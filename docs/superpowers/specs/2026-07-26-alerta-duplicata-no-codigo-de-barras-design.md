# Alerta de duplicata ao digitar o código de barras

## Contexto

A feature de detecção de produto duplicado (já em produção) hoje só checa
duplicata no momento de clicar "Cadastrar produto" — depois do admin já ter
preenchido o formulário inteiro. O admin quer o aviso mais cedo: assim que
digita/bipa o código de barras (o mesmo momento em que o sistema já busca
nome/foto na Cosmos Bluesoft via `lookupBarcode`,
`ProductManager.tsx:108-150`), se esse código já pertence a um produto que
ele mesmo tem cadastrado, quer saber na hora — antes de perder tempo
preenchendo o resto do formulário.

## Decisão de fluxo

- Se o código digitado bate com um produto local já cadastrado, **a busca na
  Cosmos não é feita** — nem faz sentido buscar nome/foto de novo pra um
  produto que já existe. O aviso aparece direto.
- Reaproveita **o mesmo módulo de match** (`findDuplicateProduct`,
  `src/lib/duplicateProductMatch.ts`) e **o mesmo modal** já construído
  (`duplicateMatch` state, `ProductManager.tsx:864-892`) — não cria um modal
  novo.
- Como nesse momento o formulário ainda não está completo (nome/preço/
  categoria podem estar vazios), o botão "Cadastrar mesmo assim" — que hoje
  chama `saveProduct()` direto (`ProductManager.tsx:887-889`) — **não pode
  aparecer** aqui: salvaria um produto incompleto. Só faz sentido mostrar 2
  opções nesse gatilho: editar o produto existente, ou fechar o aviso e
  continuar preenchendo o cadastro novo normalmente.

## Mudanças

### 1. `lookupBarcode` (`ProductManager.tsx:108-150`)

No início da função, **antes** da chamada `fetch('/api/barcode-lookup/...')`
(a busca na Cosmos), roda a checagem local:

```
const localMatch = findDuplicateProduct({ name: formData.name, barcode: code }, products, editingProduct?.id);
if (localMatch) { setDuplicateMatch(localMatch); setDuplicateMatchFromBarcode(true); return; }
```

- `code` é a mesma variável já normalizada (`rawCode.replace(/\D/g, '')`) que
  a função já calcula no início.
- Passa `formData.name` como nome candidato só porque a assinatura de
  `findDuplicateProduct` pede — como `formData.name` pode estar vazio nesse
  ponto, o match por nome fica automaticamente desativado (a função já ignora
  nome vazio) e só o match por código de barras conta, que é o que importa
  aqui.
- `editingProduct?.id` como `excludeId` — mesma lógica já usada no submit,
  pra editar um produto sem acusar duplicata dele mesmo.
- Achando match: não chama a Cosmos (`return` antes do `fetch`), não altera
  `isLookingUpBarcode`.

### 2. Novo state `duplicateMatchFromBarcode`

Um novo `useState<boolean>(false)` junto do `duplicateMatch` existente —
guarda se o aviso atual veio do gatilho do código de barras (2 botões) ou do
submit do formulário (3 botões, comportamento de hoje, inalterado).

Precisa ser resetado pra `false` em todo lugar que já reseta `duplicateMatch`
hoje (`openModal`, e o ponto em que o `handleSubmit` seta o match no submit —
nesse último, explicitamente `false`, já que ali continua sendo o fluxo
completo de 3 botões).

### 3. Modal (`ProductManager.tsx:864-892`)

- Botão "Cancelar" (linha 884): texto vira condicional —
  `{duplicateMatchFromBarcode ? 'Cadastrar novamente' : 'Cancelar'}`. O
  `onClick` não muda (`setDuplicateMatch(null)`, mais o reset do novo state) —
  nos dois casos o efeito é fechar o aviso e deixar o formulário como estava,
  o texto só comunica a intenção certa pra cada contexto.
- Botão "Editar produto existente" (linha 885): sem mudança nenhuma, funciona
  igual nos dois gatilhos.
- Botão "Cadastrar/Salvar mesmo assim" (linhas 887-889): só renderiza quando
  `!duplicateMatchFromBarcode` — não aparece no aviso disparado pelo código de
  barras.

## Fora de escopo

- Não mexe no campo "2º código de barras" (`barcode2`) — hoje ele não dispara
  `lookupBarcode`, e isso não muda aqui.
- Não altera o comportamento do aviso disparado no submit do formulário
  (continua com as 3 opções, inclusive "Cadastrar/Salvar mesmo assim").
- Não é a mesma coisa que o relatório de produtos em Excel (feature separada,
  ainda não desenhada) — este spec é só sobre o aviso no campo de código de
  barras.

## Teste

Local, antes de qualquer deploy:

1. Cadastro novo: digitar/bipar um código de barras que já pertence a um
   produto cadastrado → aviso aparece na hora, SEM toast de busca na Cosmos
   (nem sucesso nem "produto não encontrado"), com foto/nome/categoria do
   produto existente e só 2 botões.
2. "Editar as informações" → carrega o produto existente pra edição, igual ao
   fluxo já existente.
3. "Cadastrar novamente" → fecha o aviso, formulário continua com os dados já
   digitados, nenhuma chamada de Cosmos ou de salvar acontece.
4. Digitar um código de barras que NÃO existe na base local → segue
   exatamente como hoje (busca na Cosmos normalmente).
5. Editar um produto existente sem mudar o código de barras dele → não deve
   acusar duplicata dele mesmo ao reabrir/mexer no campo.
6. Preencher o formulário inteiro sem passar pelo aviso do código de barras
   (ex: colar os dados de outra forma) e clicar "Cadastrar produto" com um
   código duplicado → continua aparecendo o aviso completo de 3 botões no
   submit, sem mudança nesse fluxo.
