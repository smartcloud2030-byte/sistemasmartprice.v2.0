# Emissão de Nota Fiscal (NFS-e) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um botão no SmartHelp que emite uma NFS-e Nacional real (API da Prefeitura de Bacabal) selecionando o CNPJ do cliente, e oferece baixar (link do DANFSe oficial) e enviar por e-mail (Gmail SMTP), com histórico salvo no Postgres.

**Architecture:** Router Express novo (`src/notaFiscal.ts`, mesmo padrão de `src/payments.ts`) que monta o payload da NFS-e Nacional a partir de config fixa do prestador + dados do tomador (auto-preenchidos via BrasilAPI) e chama a API REST da prefeitura. Frontend: modal de emissão + lista de histórico, ambos dentro do `SmartHelpDashboard.tsx` (página já restrita a admin).

**Tech Stack:** Express + `pg` (Postgres), `nodemailer` (Gmail SMTP), React + Zustand (`useStore`), `fetch` nativo pro BrasilAPI e pra API da prefeitura.

## Global Constraints

- CNPJ do prestador (emissor): `66125544000198` — vai em `NFSE_API_TOKEN`/`NFSE_PRESTADOR_CNPJ` no `.env`, nunca hardcoded nem commitado.
- Config tributária fixa do prestador (não muda por nota): `opSimpNac: 3`, `regApTribSn: 1`, `regEspTrib: 0`, `issRetido: 1`, `tribISSQN: 1` (sem `aliquota`), `cnae: "9511800"`, `servico.localPrestacaoIbge: "2101202"` (Bacabal/MA).
- `Authorization: Token <T>` (nunca `Bearer`) + `X-Contribuinte-Cnpj: <14 dígitos>` em toda chamada à API da prefeitura.
- `servicoCodigo` precisa ter exatamente 6 dígitos; `valorTotal` vai como string `"0.00"` (ponto, 2 casas).
- **NUNCA chamar `POST /api/notafiscal/emitir` (nem o endpoint real da prefeitura) a partir de teste automatizado, script, ou qualquer execução não solicitada explicitamente pelo usuário.** Cada emissão bem-sucedida é uma NFS-e real, com efeitos fiscais/legais reais — não existe ambiente de homologação documentado para este contrato. A única validação ponta-a-ponta é manual, feita pelo próprio usuário na UI, de propósito, com uma nota que ele realmente pretende emitir.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `package.json` | Modificar | dependência `nodemailer` + novo teste no script `test` |
| `.env.example` | Modificar | novas variáveis (`NFSE_*`, `GMAIL_*`) |
| `src/lib/cnpjLookup.ts` | Modificar | endereço estruturado (IBGE/CEP/logradouro) pro payload da NFS-e |
| `src/lib/cnpjLookup.test.ts` | Modificar | testes do novo parser estruturado |
| `src/notaFiscal.ts` | Criar | schema, payload builder, mapeador de erro, rotas HTTP, envio de e-mail |
| `src/notaFiscal.test.ts` | Criar | testes unitários das funções puras (payload builder, validação, mapeador de erro) |
| `server.ts` | Modificar | wiring do router novo + criação do schema no boot |
| `src/components/NotaFiscalModal.tsx` | Criar | formulário de emissão + confirmação |
| `src/components/NotaFiscalHistorico.tsx` | Criar | lista de notas emitidas + ações |
| `src/components/SmartHelpDashboard.tsx` | Modificar | card que abre o modal + renderiza o histórico |

---

### Task 1: Dependência `nodemailer`

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: pacote `nodemailer` disponível para import em `src/notaFiscal.ts` (Task 4).

- [ ] **Step 1: Instalar a dependência**

Run: `npm install nodemailer && npm install -D @types/nodemailer`

Expected: `package.json` ganha `"nodemailer"` em `dependencies` e `"@types/nodemailer"` em `devDependencies`.

- [ ] **Step 2: Conferir que o projeto ainda builda**

Run: `npm run lint`
Expected: sem erros novos (só typecheck, `tsc --noEmit`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: adiciona nodemailer para envio de nota fiscal por email"
```

---

### Task 2: `cnpjLookup.ts` — endereço estruturado

**Files:**
- Modify: `src/lib/cnpjLookup.ts`
- Modify: `src/lib/cnpjLookup.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `parseCnpjResponseEstruturado(raw: any): CnpjDataEstruturado`, `fetchCnpjDataEstruturado(cnpj: string): Promise<CnpjDataEstruturado | null>`, tipo `CnpjDataEstruturado` — usados pelo `NotaFiscalModal.tsx` (Task 5) pra auto-preencher o tomador.

O payload da NFS-e exige endereço **estruturado** (`xLgr`, `nro`, `xBairro`,
`cMun` = código IBGE de 7 dígitos, `cep`), diferente do que `parseCnpjResponse`
já devolve hoje (uma string concatenada). A BrasilAPI já traz o campo
`codigo_municipio_ibge` (confirmado numa consulta real:
`codigo_municipio_ibge: 3550308` pro município de São Paulo) — é esse campo,
não `codigo_municipio` (que é um código interno da Receita Federal,
diferente do IBGE).

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `src/lib/cnpjLookup.test.ts`, antes do bloco `try { ... }`:

```ts
function extractsStructuredAddressFromABrasilApiResponse() {
  const raw = {
    nome_fantasia: 'Farmacia Exemplo',
    razao_social: 'FARMACIA EXEMPLO LTDA',
    email: 'contato@exemplo.com.br',
    descricao_tipo_de_logradouro: 'RUA',
    logradouro: 'DAS FLORES',
    numero: '123',
    complemento: 'SALA 2',
    bairro: 'CENTRO',
    municipio: 'TERESINA',
    uf: 'PI',
    cep: '64000000',
    codigo_municipio_ibge: 2211001,
    ddd_telefone_1: '8699990000',
  };
  const data = parseCnpjResponseEstruturado(raw);
  assert.strictEqual(data.nome, 'Farmacia Exemplo');
  assert.strictEqual(data.email, 'contato@exemplo.com.br');
  assert.strictEqual(data.telefone, '(86) 9999-0000');
  assert.strictEqual(data.endereco.xLgr, 'RUA DAS FLORES');
  assert.strictEqual(data.endereco.nro, '123');
  assert.strictEqual(data.endereco.xCpl, 'SALA 2');
  assert.strictEqual(data.endereco.xBairro, 'CENTRO');
  assert.strictEqual(data.endereco.cMun, '2211001');
  assert.strictEqual(data.endereco.cep, '64000000');
  assert.strictEqual(data.endereco.uf, 'PI');
}

function handlesMissingFieldsInStructuredAddressWithoutThrowing() {
  const data = parseCnpjResponseEstruturado({});
  assert.strictEqual(data.nome, '');
  assert.strictEqual(data.email, '');
  assert.strictEqual(data.endereco.xLgr, '');
  assert.strictEqual(data.endereco.cMun, '');
  assert.strictEqual(data.endereco.cep, '');
}
```

E troque o import no topo do arquivo:

```ts
import { parseCnpjResponse, parseCnpjResponseEstruturado } from './cnpjLookup';
```

E adicione as duas chamadas novas dentro do bloco `try`, antes de
`console.log(...)`:

```ts
  extractsStructuredAddressFromABrasilApiResponse();
  handlesMissingFieldsInStructuredAddressWithoutThrowing();
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx src/lib/cnpjLookup.test.ts`
Expected: FAIL — `parseCnpjResponseEstruturado` não existe ainda (erro de import/undefined).

- [ ] **Step 3: Implementar em `src/lib/cnpjLookup.ts`**

Adicione ao final do arquivo (mantendo tudo que já existe):

```ts
export interface EnderecoEstruturado {
  xLgr: string;
  nro: string;
  xCpl: string;
  xBairro: string;
  cMun: string;
  cep: string;
  uf: string;
}

export interface CnpjDataEstruturado {
  nome: string;
  email: string;
  telefone: string;
  endereco: EnderecoEstruturado;
}

export function parseCnpjResponseEstruturado(raw: any): CnpjDataEstruturado {
  const nome = (raw?.nome_fantasia || '').trim() || (raw?.razao_social || '').trim();
  const xLgr = [raw?.descricao_tipo_de_logradouro, raw?.logradouro].filter(Boolean).join(' ').trim();

  return {
    nome,
    email: (raw?.email || '').trim(),
    telefone: formatTelefone(raw?.ddd_telefone_1),
    endereco: {
      xLgr,
      nro: (raw?.numero || '').toString().trim(),
      xCpl: (raw?.complemento || '').trim(),
      xBairro: (raw?.bairro || '').trim(),
      cMun: raw?.codigo_municipio_ibge ? String(raw.codigo_municipio_ibge) : '',
      cep: (raw?.cep || '').toString().replace(/\D/g, ''),
      uf: (raw?.uf || '').trim(),
    },
  };
}

export async function fetchCnpjDataEstruturado(cnpj: string): Promise<CnpjDataEstruturado | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!res.ok) return null;

  const raw = await res.json();
  return parseCnpjResponseEstruturado(raw);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx tsx src/lib/cnpjLookup.test.ts`
Expected: `PASS: todos os testes de cnpjLookup passaram`

- [ ] **Step 5: Commit**

```bash
git add src/lib/cnpjLookup.ts src/lib/cnpjLookup.test.ts
git commit -m "feat: adiciona endereco estruturado ao lookup de CNPJ (BrasilAPI)"
```

---

### Task 3: `src/notaFiscal.ts` — schema, payload builder e mapeador de erro

**Files:**
- Create: `src/notaFiscal.ts`
- Create: `src/notaFiscal.test.ts`

**Interfaces:**
- Consumes: nada (funções puras, sem I/O).
- Produces: `buildEmissaoPayload(input, prestadorCnpj)`, `validateEmissaoInput(input)`, `mapNfseError(httpStatus, body)`, tipos `EmissaoInput`/`EnderecoInput` — usados na Task 4 (rotas HTTP) e indiretamente pelo frontend (mesmo shape de `EmissaoInput` no `NotaFiscalModal.tsx`, Task 5).

Esta task cobre só as funções **puras** (sem rede, sem banco) — testáveis sem
tocar na API real da prefeitura. As rotas HTTP que usam essas funções ficam na
Task 4.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/notaFiscal.test.ts`:

```ts
import assert from 'node:assert';
import { buildEmissaoPayload, validateEmissaoInput, mapNfseError, EmissaoInput } from './notaFiscal';

const validInput: EmissaoInput = {
  tomadorCnpj: '99888777000166',
  tomadorNome: 'Empresa Tomadora Exemplo Ltda',
  tomadorEmail: 'fiscal@exemplo.com.br',
  tomadorTelefone: '1133334444',
  tomadorEndereco: {
    xLgr: 'Avenida Paulista',
    nro: '1000',
    xCpl: 'Sala 302',
    xBairro: 'Bela Vista',
    cMun: '3550308',
    cep: '01310100',
  },
  servicoCodigo: '010101',
  descricao: 'Suporte de TI - manutencao mensal',
  valor: 150,
};

function buildsThePayloadWithFixedPrestadorConfig() {
  const payload: any = buildEmissaoPayload(validInput, '66125544000198');
  assert.strictEqual(payload.prestadorCnpj, '66125544000198');
  assert.strictEqual(payload.tomadorDoc, '99888777000166');
  assert.strictEqual(payload.servicoCodigo, '010101');
  assert.strictEqual(payload.valorTotal, '150.00');
  assert.strictEqual(payload.cnae, '9511800');
  assert.strictEqual(payload.descricao, 'Suporte de TI - manutencao mensal');
  assert.strictEqual(payload.tomador.nome, 'Empresa Tomadora Exemplo Ltda');
  assert.strictEqual(payload.tomador.email, 'fiscal@exemplo.com.br');
  assert.strictEqual(payload.tomador.endereco.cMun, '3550308');
  assert.strictEqual(payload.tomador.endereco.cep, '01310100');
  assert.strictEqual(payload.servico.localPrestacaoIbge, '2101202');
  assert.deepStrictEqual(payload.prestadorRegime, { opSimpNac: 3, regApTribSn: 1, regEspTrib: 0, issRetido: 1 });
  assert.deepStrictEqual(payload.tribISSQN, { tribISSQN: 1 });
}

function formatsValorWithTwoDecimalsEvenForWholeNumbers() {
  const payload: any = buildEmissaoPayload({ ...validInput, valor: 1000 }, '66125544000198');
  assert.strictEqual(payload.valorTotal, '1000.00');
}

function validateEmissaoInputRejectsInvalidCnpj() {
  const erro = validateEmissaoInput({ ...validInput, tomadorCnpj: '123' });
  assert.ok(erro && /CNPJ/.test(erro));
}

function validateEmissaoInputRejectsServicoCodigoWithWrongLength() {
  const erro = validateEmissaoInput({ ...validInput, servicoCodigo: '12' });
  assert.ok(erro && /6 dígitos/.test(erro));
}

function validateEmissaoInputRejectsZeroValue() {
  const erro = validateEmissaoInput({ ...validInput, valor: 0 });
  assert.ok(erro && /maior que zero/.test(erro));
}

function validateEmissaoInputAcceptsAValidInput() {
  const erro = validateEmissaoInput(validInput);
  assert.strictEqual(erro, null);
}

function mapsRfbRejectionUsingDescricaoErroAndAcaoSugerida() {
  const body = {
    statusCode: 422,
    message: 'E0039: municipio nao parametrizado',
    details: {
      codigoErro: 'E0039',
      descricaoErro: 'Municipio emissor nao parametrizado',
      acaoSugerida: 'Contatar a prefeitura',
    },
  };
  const msg = mapNfseError(422, body);
  assert.strictEqual(msg, 'Municipio emissor nao parametrizado — Contatar a prefeitura');
}

function mapsTomadorSemIdentificacaoToAFriendlyMessage() {
  const msg = mapNfseError(422, { details: { code: 'TOMADOR_SEM_IDENTIFICACAO' } });
  assert.strictEqual(msg, 'CNPJ do cliente inválido ou não encontrado.');
}

function mapsAuthErrorsToAGenericSupportMessage() {
  assert.strictEqual(mapNfseError(401, { details: { code: 'INVALID_TOKEN' } }), 'Erro de configuração da integração com a prefeitura — contate o suporte.');
  assert.strictEqual(mapNfseError(403, { details: { code: 'TOKEN_BLOQUEADO' } }), 'Erro de configuração da integração com a prefeitura — contate o suporte.');
}

function mapsServiceUnavailableToARetryMessage() {
  const msg = mapNfseError(503, {});
  assert.strictEqual(msg, 'Serviço da prefeitura indisponível no momento, tente novamente em alguns segundos.');
}

try {
  buildsThePayloadWithFixedPrestadorConfig();
  formatsValorWithTwoDecimalsEvenForWholeNumbers();
  validateEmissaoInputRejectsInvalidCnpj();
  validateEmissaoInputRejectsServicoCodigoWithWrongLength();
  validateEmissaoInputRejectsZeroValue();
  validateEmissaoInputAcceptsAValidInput();
  mapsRfbRejectionUsingDescricaoErroAndAcaoSugerida();
  mapsTomadorSemIdentificacaoToAFriendlyMessage();
  mapsAuthErrorsToAGenericSupportMessage();
  mapsServiceUnavailableToARetryMessage();
  console.log('PASS: todos os testes de notaFiscal (funcoes puras) passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx src/notaFiscal.test.ts`
Expected: FAIL — `src/notaFiscal.ts` ainda não existe.

- [ ] **Step 3: Implementar as funções puras em `src/notaFiscal.ts`**

Crie `src/notaFiscal.ts` com este conteúdo inicial (as rotas HTTP e o schema
do banco são adicionados na Task 4, no mesmo arquivo):

```ts
// ─────────────────────────────────────────
// notaFiscal.ts — Emissão de NFS-e Nacional (API da Prefeitura de Bacabal)
// Emissor (prestador) é sempre o mesmo CNPJ (NFSE_PRESTADOR_CNPJ no .env).
// Documentação de referência: zip "Tenclógica Sistemas - TerraCloud -
// Integração NFS-e" fornecido pela prefeitura, contrato v1.0.0 (14/05/2026).
// ─────────────────────────────────────────

// Config tributária fixa do prestador — não muda por nota. Ver "Cenário A"
// (Optante ME/EPP, caso mais comum) na documentação da prefeitura.
const PRESTADOR_CNAE = '9511800';
const PRESTADOR_LOCAL_PRESTACAO_IBGE = '2101202'; // Bacabal/MA
const PRESTADOR_REGIME = { opSimpNac: 3, regApTribSn: 1, regEspTrib: 0, issRetido: 1 } as const;

export interface EnderecoInput {
  xLgr: string;
  nro: string;
  xCpl?: string;
  xBairro: string;
  cMun: string;
  cep: string;
}

export interface EmissaoInput {
  tomadorCnpj: string;
  tomadorNome: string;
  tomadorEmail: string;
  tomadorTelefone?: string;
  tomadorEndereco: EnderecoInput;
  servicoCodigo: string;
  descricao: string;
  valor: number;
}

export function validateEmissaoInput(input: EmissaoInput): string | null {
  if (!/^\d{14}$/.test(input.tomadorCnpj)) return 'CNPJ do tomador inválido (precisa ter 14 dígitos).';
  if (!input.tomadorNome?.trim()) return 'Nome do tomador é obrigatório.';
  if (!input.tomadorEmail?.trim()) return 'E-mail do tomador é obrigatório.';
  if (!/^\d{6}$/.test(input.servicoCodigo)) return 'Código de serviço precisa ter exatamente 6 dígitos.';
  if (!input.descricao?.trim()) return 'Descrição do serviço é obrigatória.';
  if (!(input.valor > 0)) return 'Valor precisa ser maior que zero.';
  return null;
}

export function buildEmissaoPayload(input: EmissaoInput, prestadorCnpj: string) {
  return {
    prestadorCnpj,
    tomadorDoc: input.tomadorCnpj,
    servicoCodigo: input.servicoCodigo,
    valorTotal: input.valor.toFixed(2),
    cnae: PRESTADOR_CNAE,
    descricao: input.descricao,
    tomador: {
      nome: input.tomadorNome,
      email: input.tomadorEmail,
      telefone: input.tomadorTelefone || '',
      endereco: {
        xLgr: input.tomadorEndereco.xLgr,
        nro: input.tomadorEndereco.nro,
        xCpl: input.tomadorEndereco.xCpl || undefined,
        xBairro: input.tomadorEndereco.xBairro,
        cMun: input.tomadorEndereco.cMun,
        cep: input.tomadorEndereco.cep,
      },
    },
    servico: { localPrestacaoIbge: PRESTADOR_LOCAL_PRESTACAO_IBGE },
    prestadorRegime: PRESTADOR_REGIME,
    tribISSQN: { tribISSQN: 1 },
  };
}

export function mapNfseError(httpStatus: number, body: any): string {
  const code = body?.details?.code;

  if (httpStatus === 422 && body?.details?.codigoErro) {
    const base = body.details.descricaoErro || body.message || 'Nota rejeitada pela Receita Federal.';
    return body.details.acaoSugerida ? `${base} — ${body.details.acaoSugerida}` : base;
  }
  if (code === 'TOMADOR_SEM_IDENTIFICACAO') return 'CNPJ do cliente inválido ou não encontrado.';
  if (code === 'CATALOG_UNKNOWN_CODE') return 'Código de serviço não existe na tabela oficial (NBS).';
  if (code === 'VALIDATION_ERROR') return body?.message || 'Dados da nota inválidos.';
  if (httpStatus === 401 || httpStatus === 403 || code === 'TOKEN_BLOQUEADO') {
    return 'Erro de configuração da integração com a prefeitura — contate o suporte.';
  }
  if (httpStatus === 503) return 'Serviço da prefeitura indisponível no momento, tente novamente em alguns segundos.';
  return body?.message || 'Erro desconhecido ao emitir a nota fiscal.';
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx tsx src/notaFiscal.test.ts`
Expected: `PASS: todos os testes de notaFiscal (funcoes puras) passaram`

- [ ] **Step 5: Adicionar ao script de testes do projeto**

Em `package.json`, no script `"test"` (linha 8), acrescente ao final da
cadeia (mantendo tudo que já existe):

```json
"test": "tsx src/backgroundDetect.test.ts && tsx src/duplicateComposite.test.ts && tsx src/lib/duplicateProductMatch.test.ts && tsx src/lib/productReportConflicts.test.ts && tsx src/lib/encarteGrid.test.ts && tsx src/lib/encartePrice.test.ts && tsx src/lib/cnpjLookup.test.ts && tsx src/lib/savedPlaquinhaFolders.test.ts && tsx src/notaFiscal.test.ts",
```

- [ ] **Step 6: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes existentes continuam passando, incluindo o novo.

- [ ] **Step 7: Commit**

```bash
git add src/notaFiscal.ts src/notaFiscal.test.ts package.json
git commit -m "feat: funcoes puras de montagem de payload e mapeamento de erro da NFS-e"
```

---

### Task 4: Rotas HTTP, schema do banco, envio de e-mail e wiring

**Files:**
- Modify: `src/notaFiscal.ts`
- Modify: `server.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `buildEmissaoPayload`, `validateEmissaoInput`, `mapNfseError` (Task 3).
- Produces: `notaFiscalRouter` (default export), `ensureNotaFiscalSchema()` (named export) — montados em `server.ts`. Endpoints HTTP consumidos pelo frontend nas Tasks 5-6:
  - `POST /api/notafiscal/emitir`
  - `GET /api/notafiscal/:id`
  - `GET /api/notafiscal`
  - `POST /api/notafiscal/:id/email`

- [ ] **Step 1: Adicionar ao final de `src/notaFiscal.ts`**

```ts
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import nodemailer from 'nodemailer';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

export async function ensureNotaFiscalSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notas_fiscais (
      id SERIAL PRIMARY KEY,
      nfse_id TEXT,
      cnpj_tomador VARCHAR(14) NOT NULL,
      nome_tomador TEXT,
      email_tomador TEXT,
      codigo_servico VARCHAR(6) NOT NULL,
      descricao_servico TEXT NOT NULL,
      valor NUMERIC(12,2) NOT NULL,
      numero_nota TEXT,
      chave_acesso TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'transmitindo',
      erro_detalhe TEXT,
      ultimo_email_enviado_em TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function apiAuth(req: Request, res: Response, next: Function) {
  const token = req.headers['x-api-token'];
  if (token === process.env.API_SECRET) return next();
  res.status(401).json({ error: 'Não autorizado' });
}

const NFSE_BASE_URL = process.env.NFSE_API_BASE_URL || '';
const NFSE_TOKEN = process.env.NFSE_API_TOKEN || '';
const PRESTADOR_CNPJ = process.env.NFSE_PRESTADOR_CNPJ || '';

async function callNfsePrefeitura(path: string, options: { method?: string; body?: any } = {}) {
  const res = await fetch(`${NFSE_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${NFSE_TOKEN}`,
      'X-Contribuinte-Cnpj': PRESTADOR_CNPJ,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function danfseLinkDoGoverno(): string {
  return 'https://www.nfse.gov.br/consultapublica';
}

async function enviarEmailNota(destinatario: string, nota: { numeroNota: string; chaveAcesso: string; valor: number; descricao: string }) {
  const transporte = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  await transporte.sendMail({
    from: process.env.GMAIL_USER,
    to: destinatario,
    subject: `Nota Fiscal de Serviço nº ${nota.numeroNota}`,
    html: `
      <p>Segue sua Nota Fiscal de Serviço Eletrônica (NFS-e) nº <b>${nota.numeroNota}</b>, no valor de R$ ${nota.valor.toFixed(2)}.</p>
      <p>Descrição: ${nota.descricao}</p>
      <p>Para visualizar ou imprimir o documento oficial (DANFSe), acesse a consulta pública do governo e informe a chave de acesso abaixo:</p>
      <p><a href="${danfseLinkDoGoverno()}">${danfseLinkDoGoverno()}</a></p>
      <p>Chave de acesso: <code>${nota.chaveAcesso}</code></p>
    `,
  });
}

const router = Router();

router.post('/emitir', apiAuth, async (req: Request, res: Response) => {
  const input: EmissaoInput = {
    tomadorCnpj: (req.body?.tomadorCnpj || '').replace(/\D/g, ''),
    tomadorNome: req.body?.tomadorNome || '',
    tomadorEmail: req.body?.tomadorEmail || '',
    tomadorTelefone: req.body?.tomadorTelefone || '',
    tomadorEndereco: req.body?.tomadorEndereco || {},
    servicoCodigo: req.body?.servicoCodigo || '',
    descricao: req.body?.descricao || '',
    valor: Number(req.body?.valor),
  };

  const erroValidacao = validateEmissaoInput(input);
  if (erroValidacao) return res.status(422).json({ error: erroValidacao });

  try {
    const payload = buildEmissaoPayload(input, PRESTADOR_CNPJ);
    const { status, data } = await callNfsePrefeitura('/erp/nfse-nacional', { method: 'POST', body: payload });

    if (status === 200) {
      const inserted = await pool.query(
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, numero_nota, chave_acesso, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'autorizada') RETURNING *`,
        [data.id, input.tomadorCnpj, input.tomadorNome, input.tomadorEmail, input.servicoCodigo, input.descricao, input.valor, data.numero, data.chave]
      );
      return res.json(inserted.rows[0]);
    }

    if (status === 202) {
      const inserted = await pool.query(
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'transmitindo') RETURNING *`,
        [data.id, input.tomadorCnpj, input.tomadorNome, input.tomadorEmail, input.servicoCodigo, input.descricao, input.valor]
      );
      return res.status(202).json(inserted.rows[0]);
    }

    const mensagem = mapNfseError(status, data);
    if (status === 422 && data?.details?.codigoErro) {
      await pool.query(
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, status, erro_detalhe)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'rejeitada', $8)`,
        [data?.details?.id || null, input.tomadorCnpj, input.tomadorNome, input.tomadorEmail, input.servicoCodigo, input.descricao, input.valor, mensagem]
      );
    }
    return res.status(status >= 400 ? status : 500).json({ error: mensagem });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao emitir nota fiscal.' });
  }
});

router.get('/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM notas_fiscais WHERE id = $1', [req.params.id]);
    const nota = result.rows[0];
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

    if (nota.status === 'transmitindo' && nota.nfse_id) {
      const { status, data } = await callNfsePrefeitura(`/erp/nfse-nacional/${nota.nfse_id}`);
      if (status === 200 && data.status === 'autorizado') {
        const updated = await pool.query(
          `UPDATE notas_fiscais SET status = 'autorizada', numero_nota = $1, chave_acesso = $2 WHERE id = $3 RETURNING *`,
          [data.numero, data.chave, nota.id]
        );
        return res.json(updated.rows[0]);
      }
      if (status === 200 && data.status === 'rejeitado') {
        const updated = await pool.query(
          `UPDATE notas_fiscais SET status = 'rejeitada', erro_detalhe = $1 WHERE id = $2 RETURNING *`,
          ['NFS-e rejeitada pela Receita Federal.', nota.id]
        );
        return res.json(updated.rows[0]);
      }
    }

    res.json(nota);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', apiAuth, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM notas_fiscais ORDER BY created_at DESC LIMIT 200');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/email', apiAuth, async (req: Request, res: Response) => {
  const destinatario = req.body?.email;
  if (!destinatario) return res.status(422).json({ error: 'E-mail de destino é obrigatório.' });

  try {
    const result = await pool.query('SELECT * FROM notas_fiscais WHERE id = $1', [req.params.id]);
    const nota = result.rows[0];
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
    if (nota.status !== 'autorizada') return res.status(400).json({ error: 'Só é possível enviar por e-mail uma nota autorizada.' });

    await enviarEmailNota(destinatario, {
      numeroNota: nota.numero_nota,
      chaveAcesso: nota.chave_acesso,
      valor: Number(nota.valor),
      descricao: nota.descricao_servico,
    });

    const updated = await pool.query(
      `UPDATE notas_fiscais SET ultimo_email_enviado_em = NOW() WHERE id = $1 RETURNING *`,
      [nota.id]
    );
    res.json(updated.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao enviar e-mail.' });
  }
});

export default router;
```

- [ ] **Step 2: Wiring em `server.ts`**

No topo do arquivo, junto com os outros imports de router (linha 8):

```ts
import notaFiscalRouter, { ensureNotaFiscalSchema } from './src/notaFiscal';
```

Logo abaixo de `app.use('/api/payments', paymentsRouter);` (linha 121):

```ts
  app.use('/api/notafiscal', notaFiscalRouter);
```

E logo depois de `await ensureChatSchema().catch(...)` (linha 124):

```ts
  await ensureNotaFiscalSchema().catch(err => console.error('Erro ao preparar schema de notas fiscais:', err));
```

- [ ] **Step 3: Variáveis de ambiente em `.env.example`**

Adicione ao final do arquivo (antes da seção `# Node`):

```
# NFS-e — API da Prefeitura de Bacabal (Prefeitura Moderna). Token gerado em
# "Token API" no portal, atrelado ao CNPJ do prestador. Sem isso, o botão de
# emitir nota fiscal simplesmente falha com "configuração inválida".
NFSE_API_BASE_URL=https://bacabal-ma.prefeituramoderna.com.br/nfse/api/v1
NFSE_API_TOKEN=
NFSE_PRESTADOR_CNPJ=66125544000198

# Gmail SMTP — envio da nota fiscal por e-mail pro cliente. GMAIL_APP_PASSWORD
# é gerado em myaccount.google.com/apppasswords (não é a senha normal do Gmail).
GMAIL_USER=
GMAIL_APP_PASSWORD=
```

- [ ] **Step 4: Rodar a suíte de testes (não deve quebrar nada)**

Run: `npm test`
Expected: mesmos resultados da Task 3 — as rotas HTTP não têm teste automatizado próprio (dependem da API real da prefeitura e do Gmail, ver Global Constraints).

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/notaFiscal.ts server.ts .env.example
git commit -m "feat: rotas de emissao, consulta, historico e envio de email da NFS-e"
```

---

### Task 5: `NotaFiscalModal.tsx` — formulário de emissão

**Files:**
- Create: `src/components/NotaFiscalModal.tsx`

**Interfaces:**
- Consumes: `useStore` (`allowedStores` — `{ cnpj: string; bandeira: string }[]`, já existente em `src/store.ts:462`), `fetchCnpjDataEstruturado` (Task 2), endpoints `POST /api/notafiscal/emitir`, `GET /api/notafiscal/:id`, `POST /api/notafiscal/:id/email` (Task 4).
- Produces: componente `NotaFiscalModal` com props `{ onClose: () => void; onEmitted: () => void }` — usado por `SmartHelpDashboard.tsx` (Task 7). `onEmitted` é chamado após emissão bem-sucedida (autorizada), pra o histórico (Task 6) se atualizar.

Este componente não tem teste automatizado — é um formulário que dispara uma
emissão fiscal real (ver Global Constraints); a verificação é manual (Task
8).

- [ ] **Step 1: Criar `src/components/NotaFiscalModal.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { X, FileText, Loader2, ExternalLink, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../store';
import { fetchCnpjDataEstruturado, EnderecoEstruturado } from '../lib/cnpjLookup';
import { cn } from '../lib/utils';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const AUTH_HEADERS = { 'x-api-token': API_SECRET, 'Content-Type': 'application/json' };

interface Props {
  onClose: () => void;
  onEmitted: () => void;
}

interface Nota {
  id: number;
  status: 'transmitindo' | 'autorizada' | 'rejeitada';
  numero_nota: string | null;
  chave_acesso: string | null;
  erro_detalhe: string | null;
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 10;

export default function NotaFiscalModal({ onClose, onEmitted }: Props) {
  const allowedStores = useStore((s) => s.allowedStores);

  const [tomadorCnpj, setTomadorCnpj] = useState('');
  const [tomadorNome, setTomadorNome] = useState('');
  const [tomadorTelefone, setTomadorTelefone] = useState('');
  const [tomadorEndereco, setTomadorEndereco] = useState<EnderecoEstruturado | null>(null);
  const [tomadorEmail, setTomadorEmail] = useState('');
  const [servicoCodigo, setServicoCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');

  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState<Nota | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleSelecionarCnpj = async (cnpj: string) => {
    setTomadorCnpj(cnpj);
    setTomadorNome('');
    setTomadorEndereco(null);
    setTomadorTelefone('');
    if (!cnpj) return;

    setBuscandoCnpj(true);
    try {
      const dados = await fetchCnpjDataEstruturado(cnpj);
      if (dados) {
        setTomadorNome(dados.nome);
        setTomadorEndereco(dados.endereco);
        setTomadorTelefone(dados.telefone);
        if (dados.email) setTomadorEmail(dados.email);
      } else {
        toast.error('Não foi possível buscar os dados desse CNPJ automaticamente.');
      }
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const pararPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const consultarNota = async (id: number) => {
    const res = await fetch(`/api/notafiscal/${id}`, { headers: AUTH_HEADERS });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao consultar nota.');
    return data as Nota;
  };

  const iniciarPolling = (id: number) => {
    pollAttempts.current = 0;
    pollRef.current = setInterval(async () => {
      pollAttempts.current += 1;
      try {
        const atual = await consultarNota(id);
        if (atual.status === 'autorizada') {
          pararPolling();
          setNota(atual);
          setEmitindo(false);
          onEmitted();
        } else if (atual.status === 'rejeitada') {
          pararPolling();
          setErro(atual.erro_detalhe || 'NFS-e rejeitada pela Receita Federal.');
          setEmitindo(false);
        } else if (pollAttempts.current >= POLL_MAX_ATTEMPTS) {
          pararPolling();
          setErro('A prefeitura ainda está processando a nota. Confira o histórico em alguns minutos.');
          setEmitindo(false);
        }
      } catch (err: any) {
        pararPolling();
        setErro(err.message);
        setEmitindo(false);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleEmitir = async () => {
    if (!tomadorEndereco) {
      setErro('Selecione um CNPJ válido e aguarde o preenchimento automático do endereço.');
      return;
    }
    setErro(null);
    setEmitindo(true);

    try {
      const res = await fetch('/api/notafiscal/emitir', {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          tomadorCnpj,
          tomadorNome,
          tomadorEmail,
          tomadorTelefone,
          tomadorEndereco,
          servicoCodigo,
          descricao,
          valor: Number(valor),
        }),
      });
      const data = await res.json();

      if (res.status === 200) {
        setNota(data);
        setEmitindo(false);
        onEmitted();
      } else if (res.status === 202) {
        setNota(data);
        iniciarPolling(data.id);
      } else {
        setErro(data.error || 'Erro ao emitir nota fiscal.');
        setEmitindo(false);
      }
    } catch (err: any) {
      setErro(err.message || 'Erro ao emitir nota fiscal.');
      setEmitindo(false);
    }
  };

  const handleEnviarEmail = async () => {
    if (!nota) return;
    setEnviandoEmail(true);
    try {
      const res = await fetch(`/api/notafiscal/${nota.id}/email`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ email: tomadorEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar e-mail.');
      toast.success('E-mail enviado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar e-mail.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const notaAutorizada = nota?.status === 'autorizada';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200 no-print">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-black uppercase tracking-tighter text-black dark:text-white">Emitir Nota Fiscal</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {notaAutorizada ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-black dark:text-white">Nota emitida com sucesso!</p>
                  <p className="text-xs text-zinc-500">Nº {nota?.numero_nota} · Chave: {nota?.chave_acesso}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <a
                  href="https://www.nfse.gov.br/consultapublica"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-black dark:text-white hover:border-emerald-500/50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Ver DANFSe
                </a>
                <button
                  onClick={handleEnviarEmail}
                  disabled={enviandoEmail}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {enviandoEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Enviar por E-mail
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Cliente (tomador)</label>
                <select
                  value={tomadorCnpj}
                  onChange={(e) => handleSelecionarCnpj(e.target.value)}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                >
                  <option value="">Selecione um CNPJ...</option>
                  {allowedStores.map((s) => (
                    <option key={s.cnpj} value={s.cnpj}>{s.bandeira} · {s.cnpj}</option>
                  ))}
                </select>
              </div>

              {buscandoCnpj && <p className="text-xs text-zinc-400 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Buscando dados do CNPJ...</p>}

              {tomadorEndereco && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl text-xs text-zinc-500 space-y-0.5">
                  <p className="font-bold text-black dark:text-white">{tomadorNome}</p>
                  <p>{tomadorEndereco.xLgr}, {tomadorEndereco.nro} - {tomadorEndereco.xBairro} - {tomadorEndereco.uf}</p>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">E-mail do cliente</label>
                <input
                  type="email"
                  value={tomadorEmail}
                  onChange={(e) => setTomadorEmail(e.target.value)}
                  placeholder="cliente@exemplo.com.br"
                  className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Código de serviço (6 dígitos)</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={servicoCodigo}
                    onChange={(e) => setServicoCodigo(e.target.value.replace(/\D/g, ''))}
                    placeholder="010101"
                    className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="150.00"
                    className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Descrição do serviço</label>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white resize-none"
                />
              </div>

              {erro && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-xs text-red-600">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {erro}
                </div>
              )}

              <button
                onClick={handleEmitir}
                disabled={emitindo || !tomadorCnpj}
                className={cn(
                  'w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-colors',
                  emitindo || !tomadorCnpj ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                )}
              >
                {emitindo ? 'Emitindo...' : 'Emitir Nota Fiscal'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: sem erros de tipo (confira que `EnderecoEstruturado` está exportado
de `src/lib/cnpjLookup.ts` — feito na Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/components/NotaFiscalModal.tsx
git commit -m "feat: modal de emissao de nota fiscal no SmartHelp"
```

---

### Task 6: `NotaFiscalHistorico.tsx` — histórico de notas emitidas

**Files:**
- Create: `src/components/NotaFiscalHistorico.tsx`

**Interfaces:**
- Consumes: `GET /api/notafiscal`, `POST /api/notafiscal/:id/email` (Task 4).
- Produces: componente `NotaFiscalHistorico` (sem props obrigatórias) — renderizado em `SmartHelpDashboard.tsx` (Task 7), remontado via prop `key` quando uma nota nova é emitida.

- [ ] **Step 1: Criar `src/components/NotaFiscalHistorico.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { ExternalLink, Mail, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const AUTH_HEADERS = { 'x-api-token': API_SECRET, 'Content-Type': 'application/json' };

interface NotaHistorico {
  id: number;
  cnpj_tomador: string;
  nome_tomador: string;
  email_tomador: string;
  descricao_servico: string;
  valor: string;
  numero_nota: string | null;
  chave_acesso: string | null;
  status: 'transmitindo' | 'autorizada' | 'rejeitada';
  erro_detalhe: string | null;
  created_at: string;
}

const currency = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_LABEL: Record<NotaHistorico['status'], { label: string; className: string }> = {
  autorizada: { label: 'Autorizada', className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' },
  transmitindo: { label: 'Transmitindo', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' },
  rejeitada: { label: 'Rejeitada', className: 'bg-red-100 dark:bg-red-900/30 text-red-600' },
};

export default function NotaFiscalHistorico() {
  const [notas, setNotas] = useState<NotaHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviandoId, setEnviandoId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/notafiscal', { headers: AUTH_HEADERS })
      .then((res) => res.json())
      .then((data) => setNotas(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Erro ao carregar histórico de notas fiscais.'))
      .finally(() => setLoading(false));
  }, []);

  const reenviarEmail = async (nota: NotaHistorico) => {
    if (!nota.email_tomador) {
      toast.error('Essa nota não tem e-mail de tomador salvo.');
      return;
    }
    setEnviandoId(nota.id);
    try {
      const res = await fetch(`/api/notafiscal/${nota.id}/email`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ email: nota.email_tomador }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar e-mail.');
      toast.success('E-mail reenviado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar e-mail.');
    } finally {
      setEnviandoId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-4 md:col-span-2">
      <div className="flex items-center gap-2 text-zinc-400">
        <FileText className="w-5 h-5" />
        <span className="text-[10px] font-black uppercase tracking-widest">Notas Fiscais Emitidas</span>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-400">Carregando histórico...</p>
      ) : notas.length === 0 ? (
        <p className="text-xs text-zinc-400">Nenhuma nota emitida ainda.</p>
      ) : (
        <div className="space-y-2">
          {notas.map((nota) => {
            const statusCfg = STATUS_LABEL[nota.status];
            return (
              <div key={nota.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-black dark:text-white truncate">{nota.nome_tomador} <span className="text-zinc-400 font-normal">· {currency(nota.valor)}</span></p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {nota.descricao_servico} · {new Date(nota.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn('px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest', statusCfg.className)}>
                    {statusCfg.label}
                  </span>
                  {nota.status === 'autorizada' && (
                    <>
                      <a
                        href="https://www.nfse.gov.br/consultapublica"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver DANFSe"
                        className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/50 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                      </a>
                      <button
                        onClick={() => reenviarEmail(nota)}
                        disabled={enviandoId === nota.id}
                        title="Reenviar por e-mail"
                        className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/50 transition-colors disabled:opacity-50"
                      >
                        {enviandoId === nota.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 text-zinc-500" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/NotaFiscalHistorico.tsx
git commit -m "feat: historico de notas fiscais emitidas no SmartHelp"
```

---

### Task 7: Integração em `SmartHelpDashboard.tsx`

**Files:**
- Modify: `src/components/SmartHelpDashboard.tsx`

**Interfaces:**
- Consumes: `NotaFiscalModal` (Task 5), `NotaFiscalHistorico` (Task 6).

A página já é restrita a admin em `src/App.tsx:672-673`
(`currentView === 'smarthelp' && userRole === 'admin'`) — não precisa de
checagem de role adicional dentro do componente.

- [ ] **Step 1: Imports novos**

No topo de `src/components/SmartHelpDashboard.tsx`, adicione aos imports
existentes (linha 3, já tem vários ícones de `lucide-react`):

```tsx
import { ArrowLeft, LifeBuoy, Server, Printer, Wifi, CreditCard, HardDrive, CheckCircle2, AlertTriangle, HelpCircle, ExternalLink, Landmark, FileText } from 'lucide-react';
import NotaFiscalModal from './NotaFiscalModal';
import NotaFiscalHistorico from './NotaFiscalHistorico';
```

(substitua a linha 3 original — só está sendo adicionado `FileText` aos
ícones já importados, mais os dois imports de componente novos.)

- [ ] **Step 2: Estado e card na função `SmartHelpDashboard`**

Dentro do componente `SmartHelpDashboard` (linha 194), logo depois de:

```tsx
  const { setView } = useStore();
  const { data: tefData, isLoading: tefLoading } = useTefStatus();
```

adicione:

```tsx
  const [showNotaFiscal, setShowNotaFiscal] = useState(false);
  const [historicoKey, setHistoricoKey] = useState(0);
```

E adicione `useState` ao import do React no topo do arquivo (linha 1), que já
importa `useEffect, useState`:

```tsx
import React, { useEffect, useState } from 'react';
```

(já está assim — nenhuma mudança necessária aqui, só confirmando que
`useState` já vem importado.)

- [ ] **Step 3: Renderizar o card e o modal**

Dentro do grid que hoje só tem `DowndetectorLinks`/`TefStatusCard`/placeholders
"Em construção" (por volta da linha 225-240), substitua o array de
placeholders — troque:

```tsx
            {[
              { icon: Server, label: 'Servidor' },
              { icon: HardDrive, label: 'Máquinas' },
              { icon: Printer, label: 'Impressoras' },
              { icon: Wifi, label: 'Provedor' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 text-zinc-400">
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                <span className="text-[9px] text-zinc-400">Em construção</span>
              </div>
            ))}
```

por:

```tsx
            <button
              onClick={() => setShowNotaFiscal(true)}
              className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-emerald-500/50 hover:shadow-md transition-all"
            >
              <FileText className="w-6 h-6 text-emerald-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white">Emitir Nota Fiscal</span>
            </button>
            {[
              { icon: Server, label: 'Servidor' },
              { icon: HardDrive, label: 'Máquinas' },
              { icon: Printer, label: 'Impressoras' },
              { icon: Wifi, label: 'Provedor' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 text-zinc-400">
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                <span className="text-[9px] text-zinc-400">Em construção</span>
              </div>
            ))}
            <NotaFiscalHistorico key={historicoKey} />
```

E logo antes do fechamento do componente (depois da `</div>` que fecha
`max-w-6xl mx-auto space-y-8`, antes do `);` final), adicione a renderização
condicional do modal:

```tsx
        {showNotaFiscal && (
          <NotaFiscalModal
            onClose={() => setShowNotaFiscal(false)}
            onEmitted={() => setHistoricoKey((k) => k + 1)}
          />
        )}
```

- [ ] **Step 4: Typecheck**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/SmartHelpDashboard.tsx
git commit -m "feat: integra emissao e historico de nota fiscal no SmartHelp"
```

---

### Task 8: Verificação manual final (não automatizar)

**Files:** nenhum — só checklist manual.

> **Esta task não deve ser executada por um agente automaticamente.** Emitir
> uma nota de verdade tem efeito fiscal real. Pare aqui e devolva o controle
> pro usuário.

- [ ] **Step 1: Configurar o `.env` real na VPS/local**

O usuário preenche `NFSE_API_TOKEN` (gerado em "Token API" no portal),
`GMAIL_USER`/`GMAIL_APP_PASSWORD` (senha de app gerada em
myaccount.google.com/apppasswords).

- [ ] **Step 2: Rodar `npm test` e `npm run lint` uma última vez**

Run: `npm test && npm run lint`
Expected: tudo passando antes de qualquer teste manual na UI.

- [ ] **Step 3: Teste manual guiado pelo próprio usuário**

O usuário, deliberadamente, abre o SmartHelp, clica em "Emitir Nota Fiscal",
escolhe um CNPJ real, preenche um serviço/valor que ele realmente pretende
faturar, e confirma a emissão. Só então confere: nota aparece no histórico,
"Ver DANFSe" abre a consulta pública, e-mail chega no destinatário.

- [ ] **Step 4: Confirmar regime tributário com o contador**

Antes desse primeiro teste real, confirmar com o contador que
`opSimpNac=3`/`regApTribSn=1`/`regEspTrib=0`/`issRetido=1` batem com o
enquadramento atual do CNPJ `66.125.544/0001-98` no Simples Nacional (ver
"Global Constraints" e nota na spec sobre `E0160`).
