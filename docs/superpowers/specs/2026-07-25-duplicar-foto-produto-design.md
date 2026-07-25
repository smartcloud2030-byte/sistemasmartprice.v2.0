# Duplicação automática de foto do produto (efeito "2 unidades")

## Contexto

Quando o admin busca um produto pelo código de barras (integração Cosmos Bluesoft,
`api.ts` + `ProductManager.tsx:lookupBarcode`), o sistema baixa uma única foto do
produto (1 unidade) e a envia pro pipeline de cadastro normal. O admin quer que essa
foto (e, opcionalmente, fotos enviadas manualmente) possa sair da galeria com um
efeito de "2 unidades sobrepostas" — como se fosse uma foto de e-commerce composta —
em vez de uma única unidade solta.

Hoje **não existe IA generativa de imagem** no projeto. O único processamento de
imagem por IA é o `rembg` (remoção de fundo, modelo local via ONNX/microserviço
Flask). `sharp` já é usado no pipeline de upload pra resize/webp.

## Decisão de abordagem

Duplicação via **composição determinística com `sharp`**, sem chamar nenhuma API de
IA generativa externa. Motivo: o produto costuma ser remédio/alimento com texto
crítico no rótulo — um modelo generativo (Gemini/GPT image edit) arrisca distorcer
esse texto, custa por chamada e exige nova chave de API na VPS. A composição
determinística reaproveita os pixels reais da foto, então o rótulo nunca sai
distorcido, é grátis e roda local.

## Escopo

Só a rota `POST /gallery/upload-nobg2/:category` (`src/gallery.ts`), hoje usada
exclusivamente pelo cadastro de produto em `ProductManager.tsx`. Não afeta outras
galerias (encartes, etc).

## Mudança 1 — Detecção automática de fundo (substitui remoção incondicional)

Hoje toda imagem enviada pra `upload-nobg2` passa pelo microserviço rembg
incondicionalmente (`src/gallery.ts:1012-1026`). Isso muda para detecção automática:

No backend, antes de decidir se chama o rembg, analisar o buffer recebido com
`sharp(buffer).stats()`:

- **Tem canal alfa com transparência real** (valor mínimo do canal alpha == 0)?
  → a imagem já veio sem fundo (ex: já processada antes, ou PNG recortado
  manualmente) → **não chama o rembg**, usa o buffer como está.
- **Não tem canal alfa, ou tem alfa mas 100% opaco** (mínimo do canal alpha == 255
  em toda a imagem)? → a imagem tem fundo → chama o rembg normalmente (mesmo
  fluxo/fallback de hoje se o microserviço estiver indisponível).

Isso substitui a ideia original de um checkbox manual "Remover fundo" — a decisão
passa a ser 100% automática no servidor.

## Mudança 2 — Checkbox "Duplicar foto (2 unidades)"

Único controle manual novo, no modal de cadastro (`ProductManager.tsx`, seção
"Imagem", ~linha 543-571), **desmarcado por padrão** em qualquer fluxo (manual ou
código de barras) — o admin decide a cada cadastro se quer o efeito.

- Novo state `duplicateOption` (boolean), resetado junto com `pendingFile` ao
  abrir/fechar o modal e após salvar.
- `uploadToMinio` / `doUpload` passam a enviar esse flag (`duplicate=true|false`)
  como campo do form-data pro backend.
- Texto do botão de seleção de arquivo (linha 561, hoje
  "Selecionar imagem (remove fundo ao salvar)") atualizado pra não afirmar remoção
  incondicional.
- Step de progresso "Removendo fundo com IA..." (linha 224) só aparece quando a
  detecção decidir rodar o rembg; adicionar step "Duplicando foto..." quando
  `duplicateOption` estiver marcado.

## Mudança 3 — Composição da imagem duplicada

Novo módulo `src/gallery/duplicateComposite.ts`, função pura:

```
composeDuplicate(buffer: Buffer): Promise<Buffer>
```

Algoritmo (via `sharp`):

1. `.trim()` no buffer de entrada pra cortar a margem transparente/uniforme e ficar
   só com o produto.
2. Cópia "de trás": escala ~85%, rotação -8°, deslocada pra cima/esquerda.
3. Cópia "da frente": escala ~100%, rotação +3°, deslocada pra baixo/direita,
   composta por cima da de trás.
4. Sombra: extrai o canal alfa da cópia da frente, tinge de preto, aplica gaussian
   blur, reduz opacidade, desloca levemente — composta como camada mais baixa
   (abaixo das duas cópias) pra dar profundidade.
5. Achata tudo num canvas transparente do tamanho das duas cópias combinadas;
   devolve PNG com alfa preservado.
6. Se a composição falhar por qualquer motivo (imagem corrompida, dimensão
   inválida, etc.), cai de volta pro buffer original sem duplicar, sem quebrar o
   cadastro — mesmo espírito do fallback já existente pro rembg
   (`src/gallery.ts:1023-1026`).

## Fluxo final no backend (`upload-nobg2`)

```
buffer recebido
   │
   ▼
detecta se tem fundo (sharp stats) ──► tem fundo? ──► chama rembg
   │                                        │
   │                                        ▼
   │                                  (fallback: usa buffer original
   │                                   se microserviço indisponível)
   ▼
buffer sem fundo (ou já sem fundo)
   │
   ▼
duplicate === true? ──► composeDuplicate(buffer)
   │
   ▼
sharp resize 800x800 / 200x200 webp (pipeline já existente, sem mudança)
   │
   ▼
upload MinIO (sem mudança)
```

## Fora de escopo

- Outras rotas de upload (`upload-nobg`, `upload-nobg3`) e outras galerias
  (encartes) não são alteradas.
- Nenhuma chave de API nova, nenhum serviço externo novo.
- Variações de ângulo/iluminação "realistas" (isso exigiria IA generativa, descartado
  pela decisão de abordagem acima).

## Teste

Local, no dev server, antes de qualquer deploy:

1. Cadastro manual com foto comum (com fundo) e "Duplicar" desmarcado → comportamento
   igual ao atual (remove fundo, sobe 1 unidade).
2. Cadastro manual com foto comum e "Duplicar" marcado → sobe já composta com 2
   unidades.
3. Cadastro manual com foto já sem fundo (PNG transparente) → confirma que o rembg
   NÃO é chamado (detecção automática).
4. Cadastro via código de barras, com e sem "Duplicar" marcado.
5. Conferência visual do resultado final no MinIO/preview antes de decidir subir pra
   VPS.
