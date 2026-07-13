// ─────────────────────────────────────────
// Migração de produtos do smartprice.uk (Supabase/Vercel) para este sistema
//
// O que faz:
//   1. Lê todos os produtos da tabela `products` no Postgres do Supabase (origem).
//   2. Busca os produtos já existentes no sistema atual (destino) via API pública.
//   3. Pula produtos cujo barcode (ou nome, se não houver barcode) já existe no destino.
//   4. Para cada produto novo, baixa a imagem do Supabase Storage e reenvia para o
//      MinIO do sistema atual (pasta separada, fácil de identificar depois).
//   5. Insere os produtos novos via POST /api/products/bulk — só faz INSERT,
//      nunca UPDATE/DELETE. Não toca em nenhum produto já cadastrado.
//
// Como rodar:
//   SOURCE_DB_URL="postgres://postgres:SENHA@HOST:5432/postgres" \
//   TARGET_BASE_URL="https://seudominio.com.br" \
//   TARGET_API_SECRET="valor do API_SECRET no .env da VPS" \
//   TARGET_GALLERY_TOKEN="valor do GALLERY_PASSWORD no .env da VPS" \
//   node scripts/migrate-from-legacy.mjs
//
// Onde achar SOURCE_DB_URL: painel do Supabase → Project Settings → Database →
// Connection string → URI (modo "Session" ou "Transaction pooler").
//
// É seguro rodar mais de uma vez: cada execução busca os produtos que já existem
// no destino antes de decidir o que inserir, então nada é duplicado.
// ─────────────────────────────────────────

import pg from 'pg';

const {
  SOURCE_DB_URL,
  TARGET_BASE_URL,
  TARGET_API_SECRET,
  TARGET_GALLERY_TOKEN,
  GALLERY_CATEGORY = 'migrados-smartprice-uk',
  BATCH_SIZE = '50',
  CONCURRENCY = '4',
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Faltando variável de ambiente obrigatória: ${name}`);
    process.exit(1);
  }
}
requireEnv('SOURCE_DB_URL', SOURCE_DB_URL);
requireEnv('TARGET_BASE_URL', TARGET_BASE_URL);
requireEnv('TARGET_API_SECRET', TARGET_API_SECRET);
requireEnv('TARGET_GALLERY_TOKEN', TARGET_GALLERY_TOKEN);

const baseUrl = TARGET_BASE_URL.replace(/\/$/, '');
const batchSize = parseInt(BATCH_SIZE, 10);
const concurrency = parseInt(CONCURRENCY, 10);

function normalizeKey(str) {
  return (str || '').trim().toLowerCase();
}

async function fetchExistingProducts() {
  const existingBarcodes = new Set();
  const existingNames = new Set();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await fetch(`${baseUrl}/api/products?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`Falha ao listar produtos existentes: HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const p of rows) {
      if (p.barcode) existingBarcodes.add(normalizeKey(p.barcode));
      if (p.barcode2) existingBarcodes.add(normalizeKey(p.barcode2));
      existingNames.add(normalizeKey(p.name));
    }

    if (rows.length < limit) break;
    offset += limit;
  }

  return { existingBarcodes, existingNames };
}

function isDuplicate(product, existingBarcodes, existingNames) {
  if (product.barcode && existingBarcodes.has(normalizeKey(product.barcode))) return true;
  if (product.barcode2 && existingBarcodes.has(normalizeKey(product.barcode2))) return true;
  if (!product.barcode && !product.barcode2 && existingNames.has(normalizeKey(product.name))) return true;
  return false;
}

async function migrateImage(imageUrl, productName) {
  if (!imageUrl) return null;
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const filename = `${(productName || 'produto').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60)}.${ext}`;

    const form = new FormData();
    form.append('image', new Blob([buffer], { type: contentType }), filename);

    const uploadRes = await fetch(`${baseUrl}/gallery/upload/${encodeURIComponent(GALLERY_CATEGORY)}`, {
      method: 'POST',
      headers: { 'x-gallery-token': TARGET_GALLERY_TOKEN },
      body: form,
    });
    if (!uploadRes.ok) throw new Error(`HTTP ${uploadRes.status}`);
    const data = await uploadRes.json();
    return data.url || null;
  } catch (err) {
    console.warn(`  ⚠ Falha ao migrar imagem de "${productName}": ${err.message}`);
    return null;
  }
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

async function insertBatch(products) {
  const res = await fetch(`${baseUrl}/api/products/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-token': TARGET_API_SECRET },
    body: JSON.stringify(products),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.count ?? products.length;
}

async function main() {
  console.log('Conectando ao banco de origem (Supabase)...');
  const client = new pg.Client({ connectionString: SOURCE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: sourceProducts } = await client.query('SELECT * FROM products ORDER BY id');
  await client.end();
  console.log(`Encontrados ${sourceProducts.length} produtos na origem.`);

  console.log('Buscando produtos já existentes no destino (para não duplicar)...');
  const { existingBarcodes, existingNames } = await fetchExistingProducts();
  console.log(`Destino já tem produtos com ${existingBarcodes.size} códigos de barra distintos e ${existingNames.size} nomes distintos.`);

  const toMigrate = sourceProducts.filter((p) => !isDuplicate(p, existingBarcodes, existingNames));
  const skipped = sourceProducts.length - toMigrate.length;
  console.log(`${toMigrate.length} produtos novos para migrar (${skipped} já existiam, pulados).`);

  if (toMigrate.length === 0) {
    console.log('Nada a fazer. Concluído.');
    return;
  }

  console.log(`Migrando imagens (concorrência ${concurrency})...`);
  let imagesOk = 0;
  let imagesFailed = 0;
  const transformed = await runWithConcurrency(toMigrate, concurrency, async (p, i) => {
    const newImageUrl = await migrateImage(p.image, p.name);
    if (p.image) {
      if (newImageUrl) imagesOk++; else imagesFailed++;
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${toMigrate.length} processados...`);
    return {
      name: p.name || 'Sem nome',
      description: p.description || '',
      subtitle: p.subtitle || '',
      price: p.price || 'R$ 0,00',
      image: newImageUrl,
      thumb_image: null,
      category: p.category || '',
      barcode: p.barcode || null,
      barcode2: p.barcode2 || null,
    };
  });

  console.log(`Imagens migradas: ${imagesOk} ok, ${imagesFailed} falharam (produto segue sem imagem nesses casos).`);

  console.log('Inserindo produtos no destino em lotes...');
  let inserted = 0;
  for (let i = 0; i < transformed.length; i += batchSize) {
    const batch = transformed.slice(i, i + batchSize);
    const count = await insertBatch(batch);
    inserted += count;
    console.log(`  Lote ${Math.floor(i / batchSize) + 1}: ${count} inseridos (total ${inserted}/${transformed.length}).`);
  }

  console.log('─────────────────────────────────────────');
  console.log(`Concluído. Inseridos: ${inserted}. Pulados (já existiam): ${skipped}. Imagens ok: ${imagesOk}. Imagens falharam: ${imagesFailed}.`);
}

main().catch((err) => {
  console.error('Erro fatal na migração:', err);
  process.exit(1);
});
