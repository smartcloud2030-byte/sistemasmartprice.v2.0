# Despesas de viagem por WhatsApp + painel no SmartPrice

## Contexto

O José viaja pelo Maranhão prestando suporte às Drogarias Ultra Popular e
banca despesas do próprio bolso (abastecimento, pedágio, refeição, hospedagem)
para depois pedir reembolso à empresa. Hoje isso é foto no rolo da câmera +
planilha feita na mão + relatório montado a cada pedido de reembolso.

Este módulo transforma isso em: **mandar a foto da nota no WhatsApp com uma
linha do que é → a IA lê o valor/estabelecimento/data → o item entra numa
"viagem" → ao fechar a viagem sai um relatório em PDF e Excel pronto pra
encaminhar pra Ultra Popular.** O mesmo dado fica visível e editável numa tela
nova do SmartPrice, pra conferir e corrigir antes de enviar.

Reaproveita a infra que o SmartPrice já tem: Postgres local, MinIO, Express +
Socket.io, deploy Docker na VPS2 (primária). Nada de serviço novo separado.

## Decisões já tomadas (confirmadas com o usuário)

- **Canal WhatsApp: Meta WhatsApp Cloud API** (oficial). Sem risco de ban, sem
  violar termos, grátis no volume dele (conversas de serviço iniciadas pelo
  usuário). Custo: precisa de um número dedicado (sai do app normal do
  WhatsApp) e verificação de conta business na Meta uma vez. Não usar Evolution
  API / WhatsApp Web não-oficial.
- **Um remetente, uma empresa.** Só o José lança; todo relatório é da Ultra
  Popular. Os campos `empresa` e `criado_por` já existem no schema pra não
  travar multi-usuário/multi-empresa no futuro, mas a UI e o roteamento do bot
  assumem 1 pessoa + 1 empresa.
- **Organização por viagem.** O José abre uma viagem (destino + motivo +
  datas), lança as despesas dela, fecha, e o relatório sai por viagem. Não é
  lista solta por mês.
- **Relatório em PDF e Excel, pelos dois canais.** Pedir "fechar viagem" /
  "relatório" no WhatsApp devolve os dois arquivos; na tela do SmartPrice tem
  botão pra baixar e re-gerar quantas vezes quiser.
- **IA de extração: Claude via API oficial da Anthropic** (`@anthropic-ai/sdk`),
  visão + saída estruturada. Modelo configurável por env `DESPESAS_IA_MODEL`,
  padrão `claude-opus-5`; trocar pra `claude-sonnet-5` corta ~60% do custo de
  input e deve dar conta de cupom fiscal — é a alavanca de custo se o volume
  crescer.
- **Recibos em bucket privado.** Nota fiscal tem nome, às vezes CPF e final de
  cartão — não vai no bucket público `smartprice-images`. Bucket novo
  `smartprice-recibos` sem download anônimo; a UI e o WhatsApp recebem URLs
  pré-assinadas (validade 7 dias).
- **Dinheiro em centavos** (`bigint`), nunca `float`.
- **Allowlist de números.** Só número autorizado cria dado. Webhook valida
  assinatura `X-Hub-Signature-256`. Idempotência por `message.id`.

## Arquitetura

Três peças, todas dentro do processo Express que já roda:

| Peça | Arquivo | Papel |
|---|---|---|
| Router de despesas | `src/despesasViagem.ts` | `ensureDespesasViagemSchema()`, CRUD de viagens/despesas, agregação do relatório (funções puras testáveis), geração de PDF/Excel. Montado em `/api/despesas-viagem`. |
| Bot WhatsApp | `src/whatsappBot.ts` | Webhook GET (verificação) + POST (mensagens) em `/api/whatsapp/webhook`. Baixa mídia da Meta, sobe no MinIO, chama a extração, roda a máquina de estados da conversa, responde (texto e documento). |
| Extração IA | `src/lib/reciboExtract.ts` | Função pura `extrairRecibo(imagemBuffer, mediaType, dica)` → objeto tipado. Usada pelo bot e pelo botão "extrair" da tela. |
| Tela | `src/components/DespesasViagemModal.tsx` | Item novo no menu Administração. Lista viagens, drill-in, edição inline, conferência de pendências, download de relatório. |

`ensureDespesasViagemSchema()` é chamada no `server.ts` junto das outras
(`ensureMonitoringSchema` etc.). O bot não tem job agendado no v1 (um lembrete
diário de "você tem viagem aberta" fica pra fase de polish).

Autenticação das rotas de escrita/leitura: mesmo padrão do resto do admin —
header `x-api-token` == `API_SECRET` (igual `src/monitoring.ts`,
`src/notaFiscal.ts`). O webhook do WhatsApp é a exceção: autentica por
assinatura HMAC da Meta, não por `x-api-token`.

## Modelo de dados

Tabelas novas no Postgres local (não é blob JSON em `settings` — é dado
relacional com histórico e agregação).

```sql
-- Viagens
CREATE TABLE IF NOT EXISTS viagens_despesa (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT NOT NULL,               -- "Bacabal → São Luís (visita lojas)"
  destino       TEXT,
  motivo        TEXT,
  empresa       TEXT NOT NULL DEFAULT 'Ultra Popular',
  data_inicio   DATE,
  data_fim      DATE,
  status        TEXT NOT NULL DEFAULT 'aberta',   -- aberta | fechada | enviada
  criada_por    TEXT,                         -- telefone E.164 ou 'admin'
  observacoes   TEXT,
  total_centavos BIGINT NOT NULL DEFAULT 0,   -- cache, recalculado a cada mudança
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Itens de despesa
CREATE TABLE IF NOT EXISTS despesas_viagem (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id         UUID NOT NULL REFERENCES viagens_despesa(id) ON DELETE CASCADE,
  categoria         TEXT NOT NULL DEFAULT 'outros',
     -- combustivel | pedagio | refeicao | hospedagem | estacionamento | manutencao | outros
  descricao         TEXT,
  valor_centavos    BIGINT NOT NULL,
  data_despesa      DATE NOT NULL,
  estabelecimento   TEXT,
  documento_numero  TEXT,                     -- nº do cupom/NF se legível
  km_veiculo        INTEGER,                  -- opcional (combustível)
  litros            NUMERIC(8,3),             -- opcional (combustível)
  recibo_key        TEXT,                     -- caminho no bucket privado
  origem            TEXT NOT NULL DEFAULT 'whatsapp',  -- whatsapp | manual
  ia_status         TEXT NOT NULL DEFAULT 'pendente',
     -- pendente (foto recebida, não processada) | extraido (IA leu) |
     -- revisado (usuário confirmou) | erro
  ia_confianca      TEXT,                     -- alta | media | baixa
  ia_raw            JSONB,                    -- resposta bruta da extração, p/ auditoria
  criado_por        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_despesas_viagem_viagem ON despesas_viagem(viagem_id);

-- Estado da conversa por remetente (máquina de estados do bot)
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  telefone         TEXT PRIMARY KEY,          -- E.164, ex. 5599XXXXXXXXX
  nome             TEXT,
  autorizado       BOOLEAN NOT NULL DEFAULT false,
  viagem_ativa_id  UUID REFERENCES viagens_despesa(id) ON DELETE SET NULL,
  estado           JSONB NOT NULL DEFAULT '{}'::jsonb,
     -- { fase: 'ocioso'|'aguardando_viagem'|'aguardando_descricao'|'confirmando',
     --   despesa_pendente_id: uuid|null }
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log cru de entrada (auditoria + idempotência)
CREATE TABLE IF NOT EXISTS whatsapp_inbound_log (
  id            BIGSERIAL PRIMARY KEY,
  message_id    TEXT UNIQUE,                  -- id da mensagem na Meta; dedup
  telefone      TEXT,
  tipo          TEXT,                         -- text | image | ...
  payload       JSONB,
  processado_em TIMESTAMPTZ
);
```

Seed da allowlist: no `ensureDespesasViagemSchema()`, para cada número em
`WHATSAPP_ALLOWED_NUMBERS` (csv), `INSERT ... ON CONFLICT DO UPDATE SET
autorizado = true`.

### Tipo da extração (`src/lib/reciboExtract.ts`)

```typescript
export interface ReciboExtraido {
  categoria: 'combustivel' | 'pedagio' | 'refeicao' | 'hospedagem'
           | 'estacionamento' | 'manutencao' | 'outros';
  valorCentavos: number | null;
  dataDespesa: string | null;      // ISO date
  estabelecimento: string | null;
  documentoNumero: string | null;
  litros: number | null;
  kmVeiculo: number | null;
  confianca: 'alta' | 'media' | 'baixa';
  observacao: string | null;       // o que a IA não conseguiu ler / ressalvas
}
```

## Extração com Claude

`extrairRecibo(imagemBuffer, mediaType, dica?)`:

- SDK: `@anthropic-ai/sdk` (dependência nova), client `new Anthropic()` lendo
  `ANTHROPIC_API_KEY` do env.
- Modelo: `process.env.DESPESAS_IA_MODEL || 'claude-opus-5'`.
- `max_tokens: 2000`, `thinking: { type: 'adaptive' }`,
  `output_config: { effort: 'low' }` (extração simples), saída estruturada via
  `output_config: { format: { type: 'json_schema', schema: <schema do ReciboExtraido> } }`
  e `client.messages.parse(...)`.
- Conteúdo do user: bloco `image` (base64) + bloco `text` com a instrução
  ("extraia os campos deste cupom/nota fiscal brasileiro; valor em centavos;
  categoria pela natureza do gasto; se a linha do usuário disser a categoria,
  respeite; confiança 'baixa' se o valor estiver ilegível") + a `dica` (a
  legenda/linha que o José mandou).
- `ia_raw` guarda a resposta parseada inteira. `ia_confianca` vem de
  `confianca`. Se `valorCentavos` vier `null` → `ia_status = 'erro'` e o bot
  pede o valor por texto.
- Sem chave configurada: o botão "extrair" da tela falha com mensagem clara e o
  bot responde "não consegui ler agora, me manda o valor por texto" — o item
  ainda é criado, só fica `pendente`.

Custo aproximado (imagem ~1500 tokens + prompt): `claude-opus-5` ~US$0,01/foto,
`claude-sonnet-5` ~US$0,004/foto. Volume real dele: dezenas por mês.

## Fluxo do WhatsApp (Meta Cloud API)

### Setup (uma vez, o José faz — documentar no README do módulo)

1. Conta Meta Business + produto WhatsApp; número dedicado.
2. Anotar: `WHATSAPP_PHONE_NUMBER_ID`, token permanente de System User
   (`WHATSAPP_TOKEN`), `WHATSAPP_APP_SECRET`.
3. Inventar `WHATSAPP_VERIFY_TOKEN` e cadastrar no painel.
4. Webhook URL `https://<dominio>/api/whatsapp/webhook`, assinar o campo
   `messages`.

### GET /api/whatsapp/webhook (verificação)

Se `hub.mode == 'subscribe'` e `hub.verify_token == WHATSAPP_VERIFY_TOKEN`,
responde `hub.challenge` em texto puro. Senão 403.

### POST /api/whatsapp/webhook (mensagens)

1. **Valida assinatura**: HMAC-SHA256 do corpo cru com `WHATSAPP_APP_SECRET`,
   compara com `X-Hub-Signature-256`. Inválida → 401.
2. **Responde 200 na hora** e processa o resto em background (a Meta re-envia
   se não receber 200 em ~5s, e a chamada de visão leva 10-20s).
3. Para cada mensagem no payload:
   - **Dedup**: `INSERT INTO whatsapp_inbound_log (message_id, ...)`; se violar
     o `UNIQUE`, ignora (reentrega).
   - **Allowlist**: `whatsapp_sessions.autorizado` do remetente. Não
     autorizado → responde "número não autorizado" e para.
   - **Roteamento**:

| Entrada | Ação |
|---|---|
| `nova viagem <destino> / <motivo>` | Cria `viagens_despesa` (status `aberta`, `data_inicio = hoje`), seta `viagem_ativa_id`, responde confirmando. |
| `minhas viagens` / `status` | Lista viagens abertas + total de cada. |
| Foto (image) | Baixa mídia (`GET /{media-id}` → URL → GET binário com o token), sobe em `smartprice-recibos/<viagem_id>/<uuid>.jpg`, cria `despesas_viagem` (`ia_status = pendente`, `origem = whatsapp`). Legenda da foto vira `dica`. Chama `extrairRecibo`. Sem viagem ativa → guarda rascunho em `estado` e pergunta "pra qual viagem? responde o nome ou 'nova viagem ...'". |
| Texto logo após foto (`estado.fase == 'aguardando_descricao'`) | Usa como `descricao` / dica do último item pendente; re-extrai se ajudar. |
| `ok` / `confirmar` (`estado.fase == 'confirmando'`) | `ia_status = 'revisado'`, recalcula total da viagem, responde total corrente. |
| `valor 245,90` / `categoria pedagio` / `data 08/09` (correção) | Faz `UPDATE` do campo no item pendente, responde o card de novo pra confirmar. |
| `fechar viagem` / `relatorio` / `relatório` | Gera PDF + Excel da viagem ativa (ou última), sobe no MinIO, envia os dois como documento no WhatsApp, seta `status = 'fechada'`. Se houver item `pendente`/`erro`, avisa antes ("2 itens sem valor confirmado — fecha assim mesmo? responde 'fechar mesmo'"). |

   - Depois da extração, o bot responde um **card de confirmação**:
     `⛽ Combustível · R$ 250,00 · Posto XYZ · 08/09/2026`
     `Responde *ok* pra lançar, ou corrige: "valor 245,90", "categoria pedágio".`
     e seta `estado.fase = 'confirmando'`,
     `estado.despesa_pendente_id = <id>`.

### Envio

- Texto: `POST /{phone-number-id}/messages` type `text`.
- Documento (PDF/Excel): faz upload da mídia (`POST /{phone-number-id}/media`),
  depois `messages` type `document` com o `id` retornado e um `filename`
  amigável (`relatorio-viagem-saoluis-2026-09.pdf`).

## Relatório

Endpoint: `POST /api/despesas-viagem/viagens/:id/relatorio?formato=pdf|xlsx`
→ devolve o arquivo (`Content-Disposition: attachment`) e também guarda uma
cópia em `smartprice-recibos/relatorios/<viagem_id>/`. O bot usa a versão em
arquivo; a tela usa o download direto.

### PDF (`pdfkit` — dependência nova, JS puro, sem headless Chrome)

- Cabeçalho: empresa, viagem (título/destino/motivo), período, data de geração.
- Tabela: Data · Categoria · Estabelecimento · Descrição · Valor.
- Totais por categoria + **Total geral** em destaque.
- Anexo: páginas com as imagens dos recibos (2 por página, legenda com
  categoria + valor). Imagens baixadas do MinIO via client e embutidas com
  `doc.image(buffer)`.
- Rodapé: "Gerado pelo SmartPrice em DD/MM/AAAA".

### Excel (`xlsx` / SheetJS — **já é dependência do projeto**)

- Aba **Despesas**: uma linha por item, colunas
  `Data | Categoria | Estabelecimento | Descrição | Documento | Litros | Km | Valor (R$)`.
- Aba **Resumo**: total por categoria + total geral.
- Nome: `despesas-<slug do destino>-AAAA-MM-DD.xlsx`.

### Agregação (funções puras, testáveis com `tsx` + `node:assert`)

Mesmo padrão de `buildEmissaoPayload` / `validateEmissaoInput` em
`src/notaFiscal.ts`:

- `resumoPorCategoria(itens): { categoria, totalCentavos, qtd }[]`
- `totalViagem(itens): number`
- `linhasRelatorio(viagem, itens): LinhaRelatorio[]` (formatação de datas,
  centavos → "R$ 1.234,56", ordenação por data)

## Tela no SmartPrice

Item novo **"Despesas de Viagem"** no menu Administração (`src/App.tsx` ~linha
920, ao lado de "Relatório de Produtos"), `useState` `despesasViagemModalOpen`,
renderizado junto dos outros modais admin. Ícone `Plane` / `Receipt` do lucide.

`DespesasViagemModal.tsx`:

- **Coluna esquerda** — lista de viagens: badge de status, destino, período,
  total. Filtro por status e por período. Botão **+ Nova viagem**.
- **Coluna direita** (viagem selecionada):
  - Cabeçalho editável: título, destino, motivo, datas, empresa, observações.
  - **Tabela de despesas**: miniatura do recibo (clique = lightbox), categoria
    (`<select>`), descrição, estabelecimento, data, valor (edição inline),
    badge de `ia_status` + confiança, botão excluir. Linha destacada com total
    e total por categoria.
  - Botões: **Adicionar despesa manual** (form + upload de imagem, chama o
    mesmo `extrairRecibo` via endpoint), **Baixar PDF**, **Baixar Excel**,
    **Marcar como enviada** (status → `enviada`).
  - Aba/atalho **Revisar pendências**: filtra itens `ia_status IN
    (pendente, extraido)` ou `ia_confianca = 'baixa'` — o ponto de conferência
    antes de fechar a viagem.
- **Realtime (opcional, fase de polish)**: quando um item chega pelo WhatsApp,
  emitir `despesa:nova` pra `admin_room` (socket.io já disponível no processo)
  e a lista se atualiza sozinha se o modal estiver aberto.

## Variáveis de ambiente novas

```
ANTHROPIC_API_KEY=
DESPESAS_IA_MODEL=claude-opus-5        # troque p/ claude-sonnet-5 pra cortar custo
WHATSAPP_TOKEN=                         # System User token permanente
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=                  # você inventa; cadastra no painel da Meta
WHATSAPP_APP_SECRET=                    # valida a assinatura do webhook
WHATSAPP_ALLOWED_NUMBERS=5599XXXXXXXXX  # csv, seed da allowlist
MINIO_BUCKET_RECIBOS=smartprice-recibos
```

`docker-compose.yml`: repassar essas no `environment` do serviço `app`; no
`minio_setup`, criar `smartprice-recibos` **sem** `mc anonymous set download`
(bucket privado; backend gera URL pré-assinada).

## Fora de escopo (v1 — decisão do usuário)

- Multi-usuário / multi-empresa (campos previstos no schema, mas UI e bot
  assumem 1 remetente + Ultra Popular).
- Fluxo de aprovação da empresa dentro do sistema — o relatório sai por PDF/
  Excel e é enviado por fora.
- Integração contábil / exportação pro sistema da Ultra Popular.
- Leitura de odômetro por foto separada; controle de KM rodado / diária.
- Detecção de recibo duplicado por imagem — só um aviso simples se
  `documento_numero` repetir na mesma viagem.
- App próprio / PWA — o acesso é WhatsApp + tela do SmartPrice.
- Lembrete automático de "viagem aberta há X dias" (fase de polish, depois).

## Fases de implementação (o plano detalha)

1. Schema + `ensureDespesasViagemSchema` + router CRUD de viagens/despesas +
   testes das funções puras de agregação.
2. Tela no SmartPrice com CRUD manual (sem WhatsApp) — já dá pra usar lançando
   à mão.
3. `reciboExtract.ts` + endpoint de extração + botão "extrair" na tela.
4. Webhook WhatsApp: verificação, assinatura, download de mídia, cria despesa,
   chama extração, responde card.
5. Máquina de estados da conversa (viagem ativa, confirmação, correção,
   comandos de texto).
6. Geração de PDF + Excel e entrega pelos dois canais.
7. Polish: realtime no modal, revisão de pendências, lembrete de viagem aberta.
