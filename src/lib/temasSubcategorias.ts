// Subcategorias dos temas do Encarte Online (ex.: "Black Friday" dentro de "Geral").
//
// Não são pastas no MinIO: a imagem continua na pasta da classificação e só
// ganha uma etiqueta aqui. Assim a URL do tema nunca muda e nenhum encarte
// salvo perde o fundo ao organizar. Guardado num blob em settings, igual à
// visibilidade das classificações. Ler: todo mundo; gravar: só admin.

const SETTINGS_KEY = 'encarte_temas_subcategorias';

export interface Subcategoria {
  id: string;
  nome: string;
}

export interface SubcategoriasDaClassificacao {
  subs: Subcategoria[];
  /** nome do arquivo (sem a pasta) -> id da subcategoria */
  itens: Record<string, string>;
}

/** categoria completa (ex.: 'encarte-temas', 'encarte-temas--natal') -> subcategorias */
export type MapaSubcategorias = Record<string, SubcategoriasDaClassificacao>;

export async function carregarSubcategorias(): Promise<MapaSubcategorias> {
  try {
    const res = await fetch(`/api/settings/${SETTINGS_KEY}`);
    if (!res.ok) return {};
    const data = await res.json().catch(() => null);
    const value = data?.value;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as MapaSubcategorias) : {};
  } catch {
    return {};
  }
}

export async function salvarSubcategorias(mapa: MapaSubcategorias): Promise<void> {
  const res = await fetch(`/api/settings/${SETTINGS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: mapa }),
  });
  if (!res.ok) throw new Error('Falha ao salvar as subcategorias.');
}

export function daClassificacao(mapa: MapaSubcategorias, classif: string): SubcategoriasDaClassificacao {
  const v = mapa[classif];
  return {
    subs: Array.isArray(v?.subs) ? v!.subs : [],
    itens: v?.itens && typeof v.itens === 'object' ? v.itens : {},
  };
}

export function subsOrdenadas(mapa: MapaSubcategorias, classif: string): Subcategoria[] {
  return [...daClassificacao(mapa, classif).subs].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** id da subcategoria de um arquivo, ou null (solto na classificação). Ignora id que não existe mais. */
export function subDoArquivo(mapa: MapaSubcategorias, classif: string, filename: string): string | null {
  const d = daClassificacao(mapa, classif);
  const id = d.itens[filename];
  return id && d.subs.some((s) => s.id === id) ? id : null;
}

const novoId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const comClassif = (mapa: MapaSubcategorias, classif: string, d: SubcategoriasDaClassificacao): MapaSubcategorias => {
  const novo = { ...mapa };
  if (!d.subs.length) delete novo[classif];
  else novo[classif] = d;
  return novo;
};

export function criarSub(mapa: MapaSubcategorias, classif: string, nome: string): { mapa: MapaSubcategorias; id: string } {
  const d = daClassificacao(mapa, classif);
  const id = novoId();
  return { mapa: comClassif(mapa, classif, { subs: [...d.subs, { id, nome: nome.trim() }], itens: d.itens }), id };
}

export function renomearSub(mapa: MapaSubcategorias, classif: string, id: string, nome: string): MapaSubcategorias {
  const d = daClassificacao(mapa, classif);
  return comClassif(mapa, classif, {
    subs: d.subs.map((s) => (s.id === id ? { ...s, nome: nome.trim() } : s)),
    itens: d.itens,
  });
}

/** Exclui a subcategoria; os temas dela voltam pra classificação (não são apagados). */
export function excluirSub(mapa: MapaSubcategorias, classif: string, id: string): MapaSubcategorias {
  const d = daClassificacao(mapa, classif);
  const itens = Object.fromEntries(Object.entries(d.itens).filter(([, v]) => v !== id));
  return comClassif(mapa, classif, { subs: d.subs.filter((s) => s.id !== id), itens });
}

/** Põe o arquivo na subcategoria (id null = tira de qualquer subcategoria). */
export function definirSub(mapa: MapaSubcategorias, classif: string, filename: string, id: string | null): MapaSubcategorias {
  const d = daClassificacao(mapa, classif);
  const itens = { ...d.itens };
  if (id) itens[filename] = id;
  else delete itens[filename];
  return comClassif(mapa, classif, { subs: d.subs, itens });
}

/** Classificação renomeada: as subcategorias vão junto. */
export function renomearClassif(mapa: MapaSubcategorias, antiga: string, nova: string): MapaSubcategorias {
  if (!mapa[antiga]) return mapa;
  const novo = { ...mapa, [nova]: mapa[antiga] };
  delete novo[antiga];
  return novo;
}

export function excluirClassif(mapa: MapaSubcategorias, classif: string): MapaSubcategorias {
  if (!mapa[classif]) return mapa;
  const novo = { ...mapa };
  delete novo[classif];
  return novo;
}
