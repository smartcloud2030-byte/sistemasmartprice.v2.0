# Detecção de produto duplicado no cadastro

## Contexto

Hoje, ao cadastrar um produto (manual ou via código de barras) — tanto no modal
individual "Novo produto" quanto no "Cadastrar em massa" — o sistema aceita
qualquer entrada sem checar se aquele produto já existe na base. Isso permite
cadastros duplicados (mesmo código de barras ou mesmo nome já cadastrados antes),
gerando produtos repetidos na listagem.

O admin quer que, ao tentar cadastrar um produto que já existe, o sistema avise
antes de criar a duplicata e ofereça editar o produto existente em vez de criar
um novo.

## Lógica de match (compartilhada entre os dois fluxos)

Um produto sendo cadastrado é considerado duplicata de um produto já existente
se **qualquer uma** das condições abaixo for verdadeira:

- **Código de barras:** `barcode` OU `barcode2` do produto novo é igual (string
  exata, não vazia) a `barcode` OU `barcode2` de um produto já cadastrado.
- **Nome:** o nome normalizado (`trim()` + minúsculas + espaços múltiplos
  colapsados em um único espaço) do produto novo é igual ao nome normalizado de
  um produto já cadastrado.

A checagem roda **inteiramente no cliente**, comparando contra
`useStore().products` — o `fetchProducts` (`src/store.ts:1096-1104`) já pagina e
carrega o catálogo inteiro na store, então não é preciso nenhum endpoint novo.

Ao **editar** um produto existente, a checagem exclui o próprio produto sendo
editado da comparação (senão toda edição acusaria duplicata dele mesmo).

## Fluxo 1 — Cadastro individual ("Novo produto", `ProductManager.tsx`)

- No `handleSubmit` (`ProductManager.tsx:247-280`), **antes** de fazer upload/
  salvar, e só quando `!editingProduct?.id` (criação nova, não edição), roda a
  checagem de duplicata contra `products`.
- **Se achar duplicata:** não envia nada ainda. Abre um modal de confirmação:
  - Título "Produto já cadastrado"
  - Mostra a **foto** (`thumb_image` ou `image` do produto batido, mesmo padrão
    de preview já usado em outros lugares do arquivo, ex:
    `ProductManager.tsx:549` — `getProxyUrl`, `crossOrigin="anonymous"`), nome e
    categoria do produto existente.
  - Pergunta "Deseja editá-lo?"
  - Botão **Cancelar**: fecha o modal, o admin ajusta o formulário livremente.
  - Botão **Editar produto existente**: chama `openModal(produtoExistente)`
    (mesma função já usada pelo botão "Editar" da listagem,
    `ProductManager.tsx:441`) — carrega os dados do produto existente no
    formulário e troca para modo edição (próximo submit vira `PUT`, não
    `POST`).
- **Se não achar:** segue o fluxo de salvamento exatamente como hoje.

## Fluxo 2 — Cadastro em massa (grade, `ProductManager.tsx:728-777`)

- Ao clicar em "Cadastrar N Produtos", **antes** de chamar
  `POST /products/bulk`, roda a checagem de duplicata em cada linha preenchida
  (`rows.filter(p => p.name.trim())`) contra `products`.
- **Se achar qualquer duplicata:** bloqueia o envio inteiro (nenhum produto é
  cadastrado) e abre um modal listando as linhas duplicadas — cada item mostra
  a **foto** do produto existente batido, o nome digitado na grade e o nome do
  produto existente que causou o match. Só tem botão de fechar; o admin corrige
  a grade (remove/ajusta as linhas duplicadas) e tenta cadastrar de novo.
- **Se nenhuma duplicata:** segue o envio em lote exatamente como hoje.

## Fora de escopo

- Não altera o "Cadastrar em massa" via JSON (`isBulkModalOpen`/
  `handleBulkSubmit`) — esse modal não é acionado por nenhum botão visível na
  UI atual (código morto/não exposto), não faz parte deste trabalho.
- Não faz correspondência aproximada de nome (fuzzy match) — só igualdade exata
  após normalização.
- Não detecta duplicatas *dentro* da própria grade do cadastro em massa (duas
  linhas novas com o mesmo nome/código entre si) — só contra produtos já
  existentes na base.
- Nenhum endpoint novo no backend — tudo client-side contra a store já
  carregada.

## Teste

Local, antes de qualquer deploy:

1. Cadastro individual: tentar cadastrar um produto com nome igual (variando
   maiúsculas/espaços) a um já existente → aparece o aviso com a foto do
   produto existente; "Cancelar" mantém o formulário aberto; "Editar produto
   existente" carrega os dados certos e o submit seguinte atualiza (não cria
   um novo).
2. Cadastro individual: código de barras igual a um produto existente (nomes
   diferentes) → mesmo aviso.
3. Cadastro individual: editar um produto existente sem mudar nome/código →
   NÃO deve acusar duplicata dele mesmo.
4. Cadastro individual: produto realmente novo → segue normalmente, sem aviso.
5. Cadastro em massa: grade com uma ou mais linhas batendo em produtos
   existentes → bloqueia o envio inteiro, lista as duplicadas com foto;
   nenhum produto é criado.
6. Cadastro em massa: grade sem nenhuma duplicata → cadastra normalmente.
