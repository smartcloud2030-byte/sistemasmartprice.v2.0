# Despesas de viagem — Fase 3 (extração da nota com Claude) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Extrair da foto" no formulário de despesa: o José escolhe a foto
da nota, a IA (Claude, visão) lê valor / estabelecimento / data / categoria e
pré-preenche o formulário. Ele confere e salva (fluxo da fase 2). Nesta fase a
extração é **sem estado** — não cria despesa nem guarda a imagem (o bucket
privado de recibos entra na fase 4).

**Architecture:** `src/lib/reciboExtract.ts` faz a chamada ao Claude via
`@anthropic-ai/sdk` (dependência nova) com saída estruturada por Zod
(`zodOutputFormat` + `client.messages.parse`, o caminho documentado do SDK).
A parte que não faz I/O — normalizar a resposta da IA pro formato do sistema
(categoria válida, `valorReais` → centavos, defaults) — fica em
`normalizarExtracao`, pura e testável. O endpoint
`POST /api/despesas-viagem/extrair` (no router da fase 1) recebe a imagem em
base64 e devolve os campos. No front, o `DespesaForm` (dentro de
`DespesasViagemModal.tsx`) ganha o botão que lê o arquivo, chama o endpoint e
pré-preenche o estado do formulário.

**Tech Stack:** TypeScript, Express, React. **Dependências novas:**
`@anthropic-ai/sdk` e `zod`. Testes: `tsx` + `node:assert` (só `normalizarExtracao`).

**Spec:** `docs/superpowers/specs/2026-09-09-despesas-viagem-whatsapp-design.md`
**Fases 1-2:** `.../plans/2026-09-09-despesas-viagem-fase{1,2}.md`

## Global Constraints

- **Modelo por env:** `process.env.DESPESAS_IA_MODEL || 'claude-opus-5'`.
  Trocar pra `claude-sonnet-5` corta ~60% do custo de input.
- **Sem `ANTHROPIC_API_KEY` → falha explícita.** `extrairRecibo` lança erro
  claro; o endpoint responde **503** `{ error: 'IA não configurada...' }`; o
  botão no front some/desabilita com aviso. O resto do módulo (CRUD manual)
  continua funcionando sem a chave.
- **A IA devolve `valorReais` (número decimal), não centavos.** A conversão
  pra `valor_centavos` inteiro é em código (`Math.round(x * 100)`), nunca
  confiada ao modelo.
- **Extração é stateless nesta fase:** o endpoint não persiste nada, não sobe
  imagem pro MinIO, não cria despesa. Só lê e devolve campos. O front usa os
  campos pra pré-preencher o formulário da fase 2.
- **`categoria` da IA é validada contra `CATEGORIAS_VALIDAS`** (fase 1); valor
  fora da lista vira `'outros'`.
- Imagem trafega como base64 no corpo JSON. `server.ts` já usa
  `express.json({ limit: '50mb' })`, então cabe.

---

### Task 1: Dependências + env

**Files:**
- Modify: `package.json` / `package-lock.json` (deps `@anthropic-ai/sdk`, `zod`)
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Instalar as deps**

```bash
npm install @anthropic-ai/sdk zod
```

- [ ] **Step 2: `.env.example`**

Depois do bloco do Gmail (linha ~`GMAIL_APP_PASSWORD=`), acrescentar:

```
# Claude (extração de nota fiscal por foto — Despesas de Viagem).
# Sem esta chave, o botão "Extrair da foto" fica indisponível; o resto do
# módulo (lançamento manual) continua funcionando.
ANTHROPIC_API_KEY=
DESPESAS_IA_MODEL=claude-opus-5
```

- [ ] **Step 3: `docker-compose.yml`**

No `environment:` do serviço `app`, junto das outras vars, acrescentar:

```yaml
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      DESPESAS_IA_MODEL: ${DESPESAS_IA_MODEL:-claude-opus-5}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example docker-compose.yml
git commit -m "chore: deps e env pra extracao de nota com Claude (@anthropic-ai/sdk, zod)"
```

---

### Task 2: `src/lib/reciboExtract.ts` (+ teste da parte pura)

**Files:**
- Create: `src/lib/reciboExtract.ts`
- Create: `src/lib/reciboExtract.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `export interface ReciboExtraido { categoria: CategoriaDespesa; valorCentavos: number | null; dataDespesa: string | null; estabelecimento: string | null; documentoNumero: string | null; litros: number | null; kmVeiculo: number | null; confianca: 'alta' | 'media' | 'baixa'; observacao: string | null }`
  - `export interface BrutoIA { ... }` (o que a IA devolve: `valorReais` em vez de centavos)
  - `export function normalizarExtracao(bruto: BrutoIA): ReciboExtraido` (pura)
  - `export async function extrairRecibo(imagemBase64: string, mediaType: string, dica?: string): Promise<ReciboExtraido>`
  - `export class IANaoConfiguradaError extends Error`

- [ ] **Step 1: Teste que falha primeiro (`src/lib/reciboExtract.test.ts`)**

```ts
import assert from 'node:assert';
import { normalizarExtracao, type BrutoIA } from './reciboExtract';

const base: BrutoIA = {
  categoria: 'combustivel', valorReais: 250.0, dataDespesa: '2026-09-08',
  estabelecimento: 'Posto Ipiranga', documentoNumero: '123456',
  litros: 41.5, kmVeiculo: null, confianca: 'alta', observacao: null,
};

function converteValorReaisParaCentavos() {
  assert.strictEqual(normalizarExtracao(base).valorCentavos, 25000);
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: 12.34 }).valorCentavos, 1234);
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: 12.005 }).valorCentavos, 1201);
}
function valorInvalidoViraNull() {
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: null }).valorCentavos, null);
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: 0 }).valorCentavos, null);
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: -5 }).valorCentavos, null);
}
function categoriaForaDaListaViraOutros() {
  assert.strictEqual(normalizarExtracao({ ...base, categoria: 'xpto' as any }).categoria, 'outros');
  assert.strictEqual(normalizarExtracao(base).categoria, 'combustivel');
}
function confiancaInvalidaViraBaixa() {
  assert.strictEqual(normalizarExtracao({ ...base, confianca: 'meia' as any }).confianca, 'baixa');
  assert.strictEqual(normalizarExtracao({ ...base, confianca: 'media' }).confianca, 'media');
}
function camposDeTextoPassamDireto() {
  const r = normalizarExtracao(base);
  assert.strictEqual(r.estabelecimento, 'Posto Ipiranga');
  assert.strictEqual(r.documentoNumero, '123456');
  assert.strictEqual(r.dataDespesa, '2026-09-08');
  assert.strictEqual(r.litros, 41.5);
}
function dataForaDoFormatoViraNull() {
  assert.strictEqual(normalizarExtracao({ ...base, dataDespesa: '08/09/2026' }).dataDespesa, null);
  assert.strictEqual(normalizarExtracao({ ...base, dataDespesa: 'ontem' }).dataDespesa, null);
}

try {
  converteValorReaisParaCentavos();
  valorInvalidoViraNull();
  categoriaForaDaListaViraOutros();
  confiancaInvalidaViraBaixa();
  camposDeTextoPassamDireto();
  dataForaDoFormatoViraNull();
  console.log('PASS: todos os testes de reciboExtract (normalizarExtracao) passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx src/lib/reciboExtract.test.ts` → `Cannot find module './reciboExtract'`.

- [ ] **Step 3: Implementar `src/lib/reciboExtract.ts`**

```ts
// ─────────────────────────────────────────
// reciboExtract.ts — leitura de nota fiscal / cupom por foto, via Claude.
// extrairRecibo() chama o modelo (visão + saída estruturada por Zod).
// normalizarExtracao() (pura) converte a resposta pro formato do sistema.
// Stateless: não persiste nada nesta fase.
// ─────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CATEGORIAS_VALIDAS, type CategoriaDespesa } from './despesasViagemReport';

const MODELO = process.env.DESPESAS_IA_MODEL || 'claude-opus-5';
const CONFIANCAS = ['alta', 'media', 'baixa'] as const;

export class IANaoConfiguradaError extends Error {
  constructor() {
    super('IA não configurada: defina ANTHROPIC_API_KEY no ambiente.');
    this.name = 'IANaoConfiguradaError';
  }
}

// Schema que a IA preenche. Pede valor em reais (decimal), não centavos.
const SchemaIA = z.object({
  categoria: z.enum(CATEGORIAS_VALIDAS as unknown as [string, ...string[]]),
  valorReais: z.number().nullable(),
  dataDespesa: z.string().nullable(),        // YYYY-MM-DD
  estabelecimento: z.string().nullable(),
  documentoNumero: z.string().nullable(),
  litros: z.number().nullable(),
  kmVeiculo: z.number().nullable(),
  confianca: z.enum(CONFIANCAS),
  observacao: z.string().nullable(),
});
export type BrutoIA = z.infer<typeof SchemaIA>;

export interface ReciboExtraido {
  categoria: CategoriaDespesa;
  valorCentavos: number | null;
  dataDespesa: string | null;
  estabelecimento: string | null;
  documentoNumero: string | null;
  litros: number | null;
  kmVeiculo: number | null;
  confianca: 'alta' | 'media' | 'baixa';
  observacao: string | null;
}

export function normalizarExtracao(bruto: BrutoIA): ReciboExtraido {
  const categoria = (CATEGORIAS_VALIDAS as readonly string[]).includes(bruto.categoria)
    ? (bruto.categoria as CategoriaDespesa)
    : 'outros';
  const confianca = (CONFIANCAS as readonly string[]).includes(bruto.confianca)
    ? (bruto.confianca as ReciboExtraido['confianca'])
    : 'baixa';
  const valorCentavos =
    typeof bruto.valorReais === 'number' && bruto.valorReais > 0
      ? Math.round(bruto.valorReais * 100)
      : null;
  const dataDespesa =
    typeof bruto.dataDespesa === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bruto.dataDespesa)
      ? bruto.dataDespesa
      : null;
  return {
    categoria,
    valorCentavos,
    dataDespesa,
    estabelecimento: bruto.estabelecimento || null,
    documentoNumero: bruto.documentoNumero || null,
    litros: typeof bruto.litros === 'number' ? bruto.litros : null,
    kmVeiculo: typeof bruto.kmVeiculo === 'number' ? bruto.kmVeiculo : null,
    confianca,
    observacao: bruto.observacao || null,
  };
}

function montarInstrucao(dica?: string): string {
  return [
    'Você recebe a foto de uma nota fiscal / cupom fiscal brasileiro de uma despesa de viagem.',
    'Extraia os campos do schema.',
    '- valorReais: o VALOR TOTAL pago, em reais, como número decimal (ex.: 250.9). Não é centavos.',
    '- categoria: a natureza do gasto. Uma de: ' + CATEGORIAS_VALIDAS.join(', ') + '.',
    '- dataDespesa: a data da compra no formato YYYY-MM-DD. Se não der pra ler, null.',
    '- estabelecimento: nome do posto/loja/restaurante. documentoNumero: nº do cupom/NF se legível.',
    '- litros / kmVeiculo: só pra combustível, se aparecerem; senão null.',
    "- confianca: 'alta' se leu tudo com clareza, 'media' com alguma dúvida, 'baixa' se o valor ou a data estão ilegíveis.",
    '- observacao: curto, só se tiver algo que o usuário precise saber (ex.: "valor rasurado").',
    dica ? `O usuário disse que esta despesa é: "${dica}". Respeite isso pra escolher a categoria.` : '',
  ].filter(Boolean).join('\n');
}

export async function extrairRecibo(
  imagemBase64: string,
  mediaType: string,
  dica?: string,
): Promise<ReciboExtraido> {
  if (!process.env.ANTHROPIC_API_KEY) throw new IANaoConfiguradaError();

  const client = new Anthropic();
  const resp = await client.messages.parse({
    model: MODELO,
    max_tokens: 1024,
    output_config: { effort: 'low', format: zodOutputFormat(SchemaIA) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType as any, data: imagemBase64 } },
          { type: 'text', text: montarInstrucao(dica) },
        ],
      },
    ],
  });

  const bruto = resp.parsed_output;
  if (!bruto) throw new Error('A IA não devolveu um resultado válido.');
  return normalizarExtracao(bruto);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx tsx src/lib/reciboExtract.test.ts` → `PASS: ...`

- [ ] **Step 5: `package.json` script `test`**

Adicionar ` && tsx src/lib/reciboExtract.test.ts` ao fim da string do `"test"`.

- [ ] **Step 6: Suíte + typecheck**

Run: `npm test` → todas `PASS`.
Run: `npm run lint` → sem erros. (Se o `output_config: { effort, format }` não
tipar, deixar só `format` e mover `effort` pra fora / remover — anotar no PR.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/reciboExtract.ts src/lib/reciboExtract.test.ts package.json
git commit -m "feat: reciboExtract — le nota fiscal por foto via Claude (visao + saida estruturada)"
```

---

### Task 3: Endpoint `POST /api/despesas-viagem/extrair`

**Files:**
- Modify: `src/despesasViagem.ts`

**Interfaces:**
- Produces: `POST /api/despesas-viagem/extrair`, body
  `{ imagemBase64: string, mediaType: string, dica?: string }`, protegido por
  `x-api-token`. Resposta 200: o `ReciboExtraido`. 400 se faltar imagem;
  503 se `ANTHROPIC_API_KEY` não configurada; 502 se a IA falhar.

- [ ] **Step 1: Import + rota**

No topo de `src/despesasViagem.ts`, junto dos imports:
```ts
import { extrairRecibo, IANaoConfiguradaError } from './lib/reciboExtract';
```

Antes de `export default router;`, adicionar:
```ts
// ── Extração de nota por foto (stateless: não cria despesa nem guarda imagem) ──
router.post('/extrair', apiAuth, async (req: Request, res: Response) => {
  try {
    const { imagemBase64, mediaType, dica } = req.body || {};
    if (!imagemBase64 || typeof imagemBase64 !== 'string') {
      return res.status(400).json({ error: 'imagemBase64 é obrigatória' });
    }
    const tipo = typeof mediaType === 'string' && mediaType.startsWith('image/') ? mediaType : 'image/jpeg';
    const resultado = await extrairRecibo(imagemBase64, tipo, typeof dica === 'string' ? dica : undefined);
    res.json(resultado);
  } catch (err: any) {
    if (err instanceof IANaoConfiguradaError) {
      return res.status(503).json({ error: err.message });
    }
    console.error('[despesas-viagem] falha na extração:', err);
    res.status(502).json({ error: `Não consegui ler a nota: ${err.message}` });
  }
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint` → sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/despesasViagem.ts
git commit -m "feat: endpoint POST /api/despesas-viagem/extrair (le nota por foto)"
```

---

### Task 4: Botão "Extrair da foto" no formulário de despesa

**Files:**
- Modify: `src/lib/despesasViagemApi.ts` (função `extrairReciboApi`)
- Modify: `src/components/DespesasViagemModal.tsx` (`DespesaForm`)

**Interfaces:**
- `despesasViagemApi.ts` produces:
  `export interface ReciboExtraido { ... }` (mesma forma do backend) e
  `export function extrairReciboApi(imagemBase64: string, mediaType: string, dica?: string): Promise<ReciboExtraido>`
- `DespesaForm` ganha um `<input type="file">` escondido + botão "Extrair da
  foto" que lê o arquivo em base64, chama `extrairReciboApi` e pré-preenche o
  estado `f` do formulário.

- [ ] **Step 1: `despesasViagemApi.ts`**

Acrescentar ao fim do arquivo:
```ts
export interface ReciboExtraido {
  categoria: string;
  valorCentavos: number | null;
  dataDespesa: string | null;
  estabelecimento: string | null;
  documentoNumero: string | null;
  litros: number | null;
  kmVeiculo: number | null;
  confianca: 'alta' | 'media' | 'baixa';
  observacao: string | null;
}
export const extrairReciboApi = (imagemBase64: string, mediaType: string, dica?: string) =>
  req<ReciboExtraido>('/extrair', 'POST', { imagemBase64, mediaType, dica });
```

- [ ] **Step 2: `DespesaForm` em `DespesasViagemModal.tsx`**

Nos imports do arquivo, somar ao import de `despesasViagemApi`:
`extrairReciboApi` e, no `import type`, `ReciboExtraido`. Somar ícones
`Camera` e `Loader2` ao import de `lucide-react`. Somar `centavosParaBRL` já
está importado.

Dentro de `DespesaForm`, depois do `const set = ...`, acrescentar:
```tsx
  const [lendo, setLendo] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const aoEscolherFoto = async (file: File) => {
    setLendo(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
      const b64 = dataUrl.split(',')[1] || '';
      const r = await extrairReciboApi(b64, file.type || 'image/jpeg', f.descricao.trim() || undefined);
      setF((p) => ({
        ...p,
        categoria: r.categoria || p.categoria,
        valor: r.valorCentavos != null ? centavosParaBRL(r.valorCentavos).replace('R$ ', '') : p.valor,
        data_despesa: r.dataDespesa || p.data_despesa,
        estabelecimento: r.estabelecimento || p.estabelecimento,
        documento_numero: r.documentoNumero || p.documento_numero,
      }));
      toast[r.confianca === 'baixa' ? 'warning' : 'success'](
        r.confianca === 'baixa'
          ? 'Li a nota, mas confira o valor e a data (leitura incerta).'
          : 'Nota lida — confira os campos e salve.'
      );
      if (r.observacao) toast.message(r.observacao);
    } catch (e: any) {
      toast.error(e.message || 'Não consegui ler a nota');
    } finally {
      setLendo(false);
    }
  };
```

No JSX do form, logo abaixo da linha do título/`<p className={labelCls} ...>` —
na verdade **dentro do `<div className="col-span-2 flex justify-end gap-2">`**
dos botões, antes do botão "Cancelar", inserir:
```tsx
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) aoEscolherFoto(file); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={lendo}
          className="mr-auto flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-blue-300 dark:border-blue-800 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
        >
          {lendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {lendo ? 'Lendo a nota…' : 'Extrair da foto'}
        </button>
```
(`mr-auto` empurra os botões Cancelar/Salvar pra direita e deixa este à
esquerda.)

- [ ] **Step 3: Typecheck**

Run: `npm run lint` → sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/despesasViagemApi.ts src/components/DespesasViagemModal.tsx
git commit -m "feat: botao 'Extrair da foto' no formulario de despesa de viagem"
```

---

### Task 5: Teste manual (precisa de chave + foto real)

**Files:** nenhum — só verificação.

Pré-requisito: `ANTHROPIC_API_KEY` no `.env` local, Postgres local :5433,
uma foto de nota/cupom de verdade (abastecimento, pedágio…).

- [ ] **Step 1: `npm run dev`** — sobe sem erro.

- [ ] **Step 2: Sem chave (opcional):** com `ANTHROPIC_API_KEY` em branco,
  clicar "Extrair da foto" → toast de erro "IA não configurada"; o resto do
  formulário continua funcionando (dá pra salvar manual).

- [ ] **Step 3: Com chave:** Financeiro → aba Viagens → abrir/crar viagem →
  "Adicionar despesa" → escrever na Descrição algo como "abastecimento" →
  "Extrair da foto" → escolher a foto.
  Esperado: botão vira "Lendo a nota…", e em alguns segundos os campos
  Categoria / Valor / Data / Estabelecimento se preenchem; toast de sucesso
  (ou de "confira o valor" se `confianca: baixa`).

- [ ] **Step 4:** Ajustar o que estiver errado, Salvar → a despesa entra na
  viagem com o valor certo, total recalcula (fluxo da fase 2).

- [ ] **Step 5:** Repetir com uma foto ruim/borrada → deve vir
  `confianca: baixa` e/ou campos null, sem quebrar.

- [ ] **Step 6:** `curl` direto no endpoint (imagem pequena em base64) só pra
  ver o shape da resposta e os códigos 400/503/502.

---

### Task 6: Verificação final

- [ ] **Step 1:** `npm test` → todas `PASS`.
- [ ] **Step 2:** `npm run lint` → sem erros.
- [ ] **Step 3:** Atualizar `../../projetos/CLAUDE.md` (vault): fase 3 (extração
  da nota com Claude) implementada.
- [ ] **Step 4:** **Não fazer deploy.** Precisa da `ANTHROPIC_API_KEY` na VPS e
  ainda falta a fase 4 (bucket privado + WhatsApp).

---

## Próximas fases

4. Webhook WhatsApp (Meta Cloud API) + bucket privado `smartprice-recibos`.
5. Máquina de estados da conversa (viagem ativa, confirmação, correção).
6. Geração de PDF (`pdfkit`) + Excel (`xlsx`), entrega pelos dois canais.
7. Polish: realtime no modal, revisão de pendências, lembrete de viagem aberta.
