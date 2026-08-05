# Encarte Semanal — Acabamento visual dos cards de produto

## Contexto

O usuário mandou dois prints do Photoshop (artes reais: "Bigfort — Dia Big
10" e "Farmácia Santa Teresinha — Dia dos Pais") pedindo pra "melhorar a
tela de encarte". Ao comparar com o sistema atual (`EncarteWeekly.tsx` +
`MoldeEditor.tsx`, ver [[2026-07-28-encarte-moldes-design]]), boa parte do
segundo exemplo já é 100% coberta pelo que existe hoje (arte de fundo
própria, nome/descrição do produto, caixa "POR R$X,XX UNI" e "% DE
DESCONTO", cores configuráveis por molde). O primeiro exemplo usa um
formato de preço "Leve X Pague R$Y" que não existe no sistema — **ficou
combinado que esse formato fica pra depois**, fora desta spec.

Perguntado o que especificamente faz o resultado parecer "menos
profissional" que o Photoshop, o usuário confirmou quatro pontos, todos
dentro do card de produto (`EncarteWeekly.tsx:553-697`):

1. Tipografia do preço — hoje o preço inteiro (reais e centavos) usa o
   mesmo tamanho de fonte; numa etiqueta de preço de verdade os centavos
   costumam ser menores.
2. Falta efeito de texto (sombra/contorno) no nome e no preço — hoje é
   texto "chapado", sem profundidade.
3. Alinhamento/espaçamento inconsistente entre produtos — **nos dois
   sentidos**: o layout padrão (antes de qualquer ajuste manual) já nasce
   desalinhado, e além disso corrigir isso hoje exige arrastar cada
   elemento de cada produto manualmente, produto por produto.
4. Foto do produto: o problema é como o **sistema** posiciona/dimensiona a
   foto por padrão dentro do card — não a qualidade da imagem de origem
   (isso é outro fluxo, fora de escopo aqui).

Sessão ocorreu de madrugada com o usuário indisponível para aprovar cada
seção do design em tempo real; ele autorizou explicitamente ("fica
trabalhando aí, amanhã quero o resultado") prosseguir com julgamento
próprio nas decisões menores, documentando tudo aqui para revisão pela
manhã. Onde uma decisão de design não tinha uma resposta clara das
perguntas já feitas, isso está marcado abaixo em **Suposições — revisar**.

## Decisões já confirmadas com o usuário

- **Abordagem escolhida (dentre 3 propostas): estender o estilo do molde +
  ação "aplicar a todos"**, em vez de (a) só botões avulsos sem mexer no
  padrão ou (b) reconstruir os cards como templates fixos sem arrastar.
- Formato "Leve X Pague R$Y" fica fora desta spec.
- Qualidade/corte da imagem de origem do produto fica fora desta spec.
- Sem deploy nem push automático — implementação fica commitada local,
  testada, aguardando o usuário revisar e decidir quando subir (ver
  [[feedback_ask_deploy_vps]]).

## Modelo de dados

Quatro campos novos, todos opcionais, em `EncarteMolde` (`src/store.ts`):

```ts
export type EncartePriceTypography = 'uniforme' | 'destacado';

export interface EncarteMolde {
  // ...campos existentes...
  priceTypography?: EncartePriceTypography; // default 'uniforme' (comportamento atual)
  textShadow?: boolean;                     // default false (comportamento atual)
  defaultElementLayout?: EncarteElementLayout; // ver "Salvar como padrão do molde"
  defaultCardRect?: { offsetX: number; offsetY: number; width: number; height: number };
  defaultNameFontSize?: number;
  defaultSubtitleFontSize?: number;
  defaultPriceFontSize?: number;
}
```

Todos opcionais e ausentes em moldes já salvos — **sem migração
necessária**, cai automaticamente no comportamento de hoje (mesmo padrão
usado pela spec anterior).

## Parte 1 — Tipografia do preço ("destacado")

Quando `molde.priceTypography === 'destacado'`, o preço renderiza reais
grande + centavos menor, em vez do texto único de hoje:

- Faz `split` do `product.price` na vírgula (formato já usado em todo o
  sistema, ex: `"6,49"`). Se não houver vírgula (valor atípico, ex:
  "Grátis" digitado manualmente), renderiza como está hoje — sem quebrar.
- Parte inteira no tamanho `priceFontSize` atual; parte decimal (com a
  vírgula) em ~55% desse tamanho, alinhada ao topo (baseline), do jeito
  que etiqueta de preço de farmácia normalmente mostra.
- Não é campo por produto — é escolha do molde inteiro (todo produto
  daquele molde usa o mesmo estilo), consistente com como
  `priceBoxColor`/`productNameColor` já funcionam hoje.
- Controle novo no `MoldeEditor.tsx`, ao lado dos seletores de cor já
  existentes: um toggle "Preço destacado (centavo menor)".

## Parte 2 — Sombra de texto

Quando `molde.textShadow === true`, nome do produto e texto do preço
recebem `text-shadow: 0 1px 2px rgba(0,0,0,.35)` (sutil, não é um efeito
forte tipo contorno grosso — **suposição — revisar**: se o usuário quiser
um efeito mais forte tipo contorno, ajusto depois de ver o resultado).
Controle: outro toggle no `MoldeEditor.tsx`, "Sombra no texto".

Descrição (`subtitle`) não recebe sombra — é texto pequeno/secundário nos
dois exemplos reais, sombra ali só resultaria em ruído visual.

## Parte 3 — Sincronizar estilo entre produtos

Dois botões novos que aparecem no `EncarteWeekly.tsx` quando o card de um
produto está selecionado (`selected.key === 'card'`), junto dos outros
controles `no-print` já existentes:

**"Aplicar a todos"** — copia o layout completo do card selecionado
(posição/tamanho do card, retângulos de nome/descrição/preço/foto, e os
3 tamanhos de fonte) para todos os outros produtos já preenchidos *nesse
`EncarteSemanal`* (a semana atual, não mexe no molde). Resolve a dor de
"tenho que ajustar produto por produto na mão" — ajusta um, aplica pro
resto, ainda dá pra afinar individualmente depois se algum precisar.

**"Definir como padrão do molde"** — salva esse mesmo layout nos campos
`defaultElementLayout`/`defaultCardRect`/`default*FontSize` do
`EncarteMolde`. A partir daí, todo produto novo colocado em qualquer slot
desse molde (essa semana em diante, incluindo semanas futuras) já nasce
com esse layout em vez das constantes fixas
`DEFAULT_ELEMENT_RECTS`/`DEFAULT_NAME_FONT_SIZE` etc. que existem hoje no
código. Resolve a dor de "o padrão já nasce torto" — resolve na raiz, uma
vez por molde, não por semana.

Os `DEFAULT_ELEMENT_RECTS` e tamanhos de fonte fixos no código continuam
existindo como **fallback de fábrica**, usados só em moldes que nunca
tiveram um padrão customizado definido — sem isso, um molde novíssimo (sem
`defaultElementLayout`) não teria layout nenhum pra um produto recém
colocado num slot.

## Parte 4 — Foto do produto

Não há mudança nos `DEFAULT_ELEMENT_RECTS.image` fixos no código — a Parte
3 (`defaultElementLayout` por molde) já resolve isso na prática: o usuário
ajusta o tamanho/posição da foto uma vez, num produto, e vira o padrão do
molde inteiro dali em diante. **Suposição — revisar**: não estou mudando o
valor padrão de fábrica (`xPct: 62, yPct: 10, widthPct: 36, heightPct:
80`) porque não há uma foto "certa" universal — cada arte de fundo tem
proporções diferentes de coluna. Se depois de usar o "definir como
padrão" o usuário achar o ponto de partida de fábrica ruim demais pra
começar a ajustar, dá pra revisar esse valor específico.

## Fora de escopo (mantido)

- Formato de preço "Leve X Pague R$Y" — combinado explicitamente que fica
  pra depois, o usuário vai mandar um novo print quando quiser tratar
  disso.
- Pipeline de qualidade/corte da imagem de origem do produto (fundo
  removido etc.) — já existe noutro fluxo do sistema
  (`ProductManager.tsx`, opção de remover fundo no cadastro), não faz
  parte desta spec.
- Editor de contorno de texto mais elaborado (só sombra simples por ora).
- Duplicar/clonar molde — já estava fora de escopo na spec original,
  continua.

## Teste

Local, sem deploy (ver [[feedback_ask_deploy_vps]]):

1. `npx tsc --noEmit` e `npm run build` limpos.
2. Criar/editar um molde de teste, ligar "Preço destacado" → conferir que
   o preço mostra reais grande + centavos menor, e que desligar volta ao
   texto uniforme de antes.
3. Ligar "Sombra no texto" → conferir sombra sutil em nome e preço, nada
   na descrição.
4. Preencher 2+ produtos num `EncarteSemanal` de teste, ajustar manualmente
   o layout de um deles (posição da foto, tamanho do preço) → clicar
   "Aplicar a todos" → conferir que os outros produtos preenchidos
   assumem o mesmo layout.
5. Clicar "Definir como padrão do molde" → remover um produto do slot e
   colocar um novo → conferir que o produto novo já nasce com o layout
   customizado, não com o `DEFAULT_ELEMENT_RECTS` de fábrica.
6. Conferir que um molde **antigo** (sem nenhum desses campos novos)
   continua abrindo e funcionando exatamente como antes — preço uniforme,
   sem sombra, layout de fábrica pra produto novo.
7. Exportar PNG de um encarte com "Preço destacado" + "Sombra" ligados →
   conferir visualmente que o `html2canvas` captura a tipografia
   dividida e a sombra corretamente (é uma exportação via canvas, texto
   com efeitos CSS pode não capturar igual ao DOM — validar isso
   especificamente).
