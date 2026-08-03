# Emissão de Nota Fiscal (NFS-e) no SmartHelp

## Contexto

José (admin) presta serviço de TI/suporte para os clientes cadastrados no
SmartPrice (`allowedStores`) e hoje emite a NFS-e manualmente no portal da
Prefeitura de Bacabal (sistema **Prefeitura Moderna / MeuISS**). Esta spec
adiciona um botão dentro do **SmartHelp** (`src/components/SmartHelpDashboard.tsx`)
que emite a nota direto do SmartPrice: seleciona o CNPJ do cliente (tomador),
preenche código de serviço/valor/descrição, emite via API oficial da
prefeitura, e oferece baixar/enviar a nota por e-mail.

A prefeitura de Bacabal já aderiu ao ambiente **NFS-e Nacional** (padrão único
do governo federal via Reforma Tributária) e expõe uma API REST própria
(`https://bacabal-ma.prefeituramoderna.com.br/nfse/api/v1/erp/nfse-nacional`),
documentada em `Tenclógica Sistemas - TerraCloud - Integração NFS-e/` (zip
fornecido pelo usuário, versão de contrato v1.0.0 — 14/05/2026). O certificado
A1 do prestador já está cadastrado no painel da prefeitura — a API assina o
XML internamente, não manipulamos certificado.

## Decisões já tomadas (confirmadas com o usuário)

- **Emissor (prestador) é fixo** — sempre o CNPJ `66.125.544/0001-98` (José).
  Só o **tomador** (cliente) é selecionado por nota.
- **Lista de tomadores** vem dos CNPJs já cadastrados em `allowedStores`
  (mesma lista do Financeiro), não digitação livre.
- **Tela restrita a admin**, dentro do SmartHelp.
- **Código de serviço varia por nota** — campo de entrada manual (6 dígitos,
  `servicoCodigo`/NBS), não fixo.
- **Histórico dentro do SmartPrice**: nova tabela Postgres com as notas
  emitidas, listada na própria tela.
- **PDF**: não geramos nada próprio — botão "Ver DANFSe" abre a consulta
  pública oficial em `nfse.gov.br` pela chave de acesso (documento oficial do
  governo, sempre atualizado). Sem dependência de biblioteca de PDF.
- **E-mail**: Gmail SMTP (conta própria do usuário, com senha de app),
  variáveis novas no `.env`. Sem serviço transacional terceirizado.
- **Baixar PDF e Enviar por E-mail ficam disponíveis ao mesmo tempo** na tela
  de confirmação (e também no histórico), não é um-ou-outro.
- **Regime tributário fixo do prestador** (não muda por nota):
  - `opSimpNac: 3` (Optante Simples Nacional ME/EPP)
  - `regApTribSn: 1` (apuração SN federais + municipal — ISS recolhido via DAS)
  - `regEspTrib: 0` (nenhum regime especial)
  - `issRetido: 1` (não retido)
  - `tribISSQN: 1` (tributável), sem `aliquota` (ISS via DAS, conforme
    Optante SN sem retenção — enviar `aliquota` causa rejeição E0625 da
    Receita Federal)
  - `cnae: "9511800"` (Reparação e manutenção de computadores)
  - `servico.localPrestacaoIbge: "2101202"` (Bacabal/MA)

  > Esses valores seguem exatamente o "Cenário A" da documentação (Optante
  > ME/EPP, caso mais comum, validado contra a Receita Federal em homologação).
  > **Confirmar com o contador antes de emitir a primeira nota real** — se o
  > enquadramento no Simples Nacional mudar (ex: virar Não Optante), a Receita
  > Federal rejeita com `E0160` e os valores acima precisam ser atualizados.

## Arquitetura

- **Backend**: novo router `src/notaFiscal.ts`, mesmo padrão de
  `src/payments.ts` (Express Router próprio, pool Postgres próprio, montado em
  `server.ts` via `app.use('/api/notafiscal', notaFiscalRouter)`).
- **Config do prestador**: CNPJ e token da API vão pro `.env` (mesmo padrão
  do `ASAAS_API_KEY`). O regime tributário/CNAE/IBGE (que não mudam e não são
  segredo) ficam como constantes fixas no próprio `src/notaFiscal.ts`.
- **Frontend**: novo componente `src/components/NotaFiscalModal.tsx`, aberto a
  partir de um card novo em `SmartHelpDashboard.tsx` (visível só quando
  `currentUser.role === 'admin'`, mesmo gate usado em outras telas
  administrativas).

### Variáveis de ambiente novas (`.env` da VPS, nunca no git)

```
# NFS-e — API da Prefeitura de Bacabal (Prefeitura Moderna)
NFSE_API_BASE_URL=https://bacabal-ma.prefeituramoderna.com.br/nfse/api/v1
NFSE_API_TOKEN=            # gerado em Token API no portal, atrelado ao CNPJ do prestador
NFSE_PRESTADOR_CNPJ=66125544000198

# Gmail SMTP — envio da nota por e-mail
GMAIL_USER=
GMAIL_APP_PASSWORD=        # senha de app gerada em myaccount.google.com/apppasswords
```

## Fluxo de emissão (UI)

1. Card **"Emitir Nota Fiscal"** no SmartHelp (só admin) abre
   `NotaFiscalModal`.
2. Select com os CNPJs de `allowedStores` (`bandeira · CNPJ`).
3. Ao selecionar, chama `fetchCnpjData`-like lookup (ver seção "Dados do
   tomador" abaixo) pra preencher automaticamente razão social e endereço
   estruturado — exibidos como confirmação, somente leitura nesta v1.
4. Campos manuais: **e-mail do tomador**, **código de serviço** (6 dígitos),
   **descrição do serviço**, **valor (R$)**.
5. Botão "Emitir Nota Fiscal" → `POST /api/notafiscal/emitir`.
6. **Sucesso síncrono** (`status: "autorizado"`, resposta 200 da prefeitura):
   grava em `notas_fiscais` e mostra tela de confirmação com número/chave da
   nota e dois botões lado a lado: **"Ver DANFSe"** (abre `nfse.gov.br` numa
   nova aba) e **"Enviar por E-mail"** (`POST /api/notafiscal/:id/email`).
7. **Processamento assíncrono** (202 `"transmitindo"`): mostra "Emitindo,
   aguarde..." e faz polling em `GET /api/notafiscal/:id` a cada 3s (máximo
   ~30s) até virar `autorizado` ou `rejeitado`.
8. **Rejeição pela Receita Federal** (422): mostra a mensagem oficial
   (`descricaoErro` + `acaoSugerida` do payload de erro) num alerta, modal
   continua aberto pra corrigir e tentar de novo. Nota fica salva no
   histórico com `status = 'rejeitada'` e o erro, pra referência.
9. **Erro de validação local** (422 `VALIDATION_ERROR` /
   `TOMADOR_SEM_IDENTIFICACAO` / `CATALOG_UNKNOWN_CODE`): mesma tela de erro,
   mensagem adaptada (ex: "código de serviço inválido — precisa ter 6
   dígitos").

Depois de emitida, a nota some da tela de emissão e aparece na lista de
**histórico** (mesma tela ou seção logo abaixo), com os mesmos dois botões
(Ver DANFSe / Enviar por E-mail) disponíveis a qualquer momento, não só na
hora da emissão.

## Dados do tomador (auto-preenchimento)

`src/lib/cnpjLookup.ts` já existe e usa a BrasilAPI, mas hoje só devolve
`{ nome, endereco (string concatenada), telefone }` — não serve pro payload da
NFS-e, que exige endereço **estruturado** (`xLgr`, `nro`, `xBairro`, `cMun`
IBGE, `cep`).

Ação: adicionar uma nova função `fetchCnpjDataEstruturado` (ou expandir a
existente sem quebrar quem já usa `fetchCnpjData`) que devolve os campos brutos
da BrasilAPI necessários:

```ts
interface CnpjEnderecoEstruturado {
  nome: string;               // razao_social ou nome_fantasia
  email: string;               // se a BrasilAPI trouxer; senão vazio, usuário preenche
  telefone: string;
  endereco: {
    xLgr: string;               // descricao_tipo_de_logradouro + logradouro
    nro: string;                // numero
    xCpl?: string;               // complemento
    xBairro: string;             // bairro
    cMun: string;                // codigo_municipio_ibge (BrasilAPI já traz este campo)
    cep: string;                 // cep, só dígitos
    uf: string;
  };
}
```

> A BrasilAPI não devolve e-mail do estabelecimento — o campo email do
> tomador continua manual no formulário (não vem do lookup).

## Backend — `src/notaFiscal.ts`

### `POST /api/notafiscal/emitir`

Recebe do frontend: `{ tomadorCnpj, tomadorNome, tomadorEmail, tomadorEndereco, servicoCodigo, descricao, valor }`.

Monta o payload pro `POST {NFSE_API_BASE_URL}/erp/nfse-nacional`:

```json
{
  "prestadorCnpj": "66125544000198",
  "tomadorDoc": "<tomadorCnpj>",
  "servicoCodigo": "<servicoCodigo>",
  "valorTotal": "<valor formatado 0.00>",
  "cnae": "9511800",
  "descricao": "<descricao>",
  "tomador": {
    "nome": "<tomadorNome>",
    "email": "<tomadorEmail>",
    "telefone": "<tomadorTelefone>",
    "endereco": { "...": "endereço estruturado" }
  },
  "servico": { "localPrestacaoIbge": "2101202" },
  "prestadorRegime": { "opSimpNac": 3, "regApTribSn": 1, "regEspTrib": 0, "issRetido": 1 },
  "tribISSQN": { "tribISSQN": 1 }
}
```

Headers: `Authorization: Token <NFSE_API_TOKEN>`, `X-Contribuinte-Cnpj:
66125544000198`.

- 200 → grava `notas_fiscais` com `status='autorizada'`, retorna nota completa.
- 202 → grava `status='transmitindo'`, retorna `id` pro frontend fazer polling.
- 422 (RFB) → grava `status='rejeitada'` + `erro_detalhe`, retorna erro pro
  frontend.
- 422 (validação local) → não grava nada, retorna erro direto (nunca chegou a
  virar tentativa de emissão).
- 401/403 (token/CNPJ) → erro genérico "configuração da API da prefeitura
  inválida, contate o suporte" (não é um erro que o usuário resolve na hora).

### `GET /api/notafiscal/:id`

Proxy simples pro `GET {NFSE_API_BASE_URL}/erp/nfse-nacional/:id` — usado
pelo polling do passo 202. Atualiza `notas_fiscais.status` quando a consulta
retornar `autorizado`/`rejeitado`.

### `POST /api/notafiscal/:id/email`

Não existe endpoint de e-mail na API da prefeitura — implementamos aqui com
Nodemailer + Gmail SMTP. Corpo do e-mail: dados básicos da nota (número,
valor, descrição) + link de "Ver DANFSe" (`https://www.nfse.gov.br/...`
usando a `chave`). Guarda em `notas_fiscais` a data do último envio
(`ultimo_email_enviado_em`), sem bloquear reenvios.

### `GET /api/notafiscal` (histórico)

Lista as notas emitidas (`ORDER BY created_at DESC`), pra tela de histórico.

## Dados — nova tabela `notas_fiscais`

```sql
CREATE TABLE notas_fiscais (
  id SERIAL PRIMARY KEY,
  nfse_id TEXT,                    -- id (uuid) da nota na API da prefeitura
  cnpj_tomador VARCHAR(14) NOT NULL,
  nome_tomador TEXT,
  email_tomador TEXT,
  codigo_servico VARCHAR(6) NOT NULL,
  descricao_servico TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  numero_nota TEXT,
  chave_acesso TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'transmitindo', -- transmitindo | autorizada | rejeitada | cancelada
  erro_detalhe TEXT,
  ultimo_email_enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Migração vai em `migration.sql` (mesmo arquivo usado pelas mudanças de schema
anteriores do projeto).

## Link do DANFSe oficial

O botão "Ver DANFSe" abre `https://www.nfse.gov.br/consultapublica` numa nova
aba — consulta pública interativa onde o tomador busca pela chave de acesso
(exibida na tela junto com o número da nota, pra copiar/colar). Não é um link
direto que baixa o PDF automaticamente: a API de download direto de DANFSe do
ambiente nacional foi **descontinuada em 03/08/2026**; a consulta interativa
continua disponível e é a via oficial suportada.

## Erros e mensagens ao usuário

Mapeamento das mensagens técnicas da API pra mensagens que fazem sentido pro
José, sem jargão de XSD/RFB:

| Situação da API | Mensagem exibida |
|---|---|
| 422 `TOMADOR_SEM_IDENTIFICACAO` | "CNPJ do cliente inválido ou não encontrado." |
| 422 `CATALOG_UNKNOWN_CODE` | "Código de serviço não existe na tabela oficial (NBS)." |
| 422 rejeição RFB (com `codigoErro`) | `descricaoErro` + `acaoSugerida` da própria resposta, direto. |
| 401 `INVALID_TOKEN` / 403 `TOKEN_BLOQUEADO` | "Erro de configuração da integração com a prefeitura — contate o suporte." |
| 503 | "Serviço da prefeitura indisponível no momento, tente novamente em alguns segundos." (com retry automático 1x antes de mostrar erro) |

## Testes

- Emissão de teste ponta a ponta contra o **ambiente da prefeitura** (não há
  menção de sandbox separado na documentação — primeira emissão real deve ser
  de baixo valor, pra validar o fluxo completo antes de uso normal).
- Casos a cobrir manualmente: emissão bem-sucedida (200), timeout/polling
  (202), rejeição RFB (422 com `codigoErro`), CNPJ tomador inválido, envio de
  e-mail, reenvio de e-mail pelo histórico, abrir DANFSe oficial.
