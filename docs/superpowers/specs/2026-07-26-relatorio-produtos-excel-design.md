# Relatório de produtos em Excel (exportar/importar)

## Contexto

O admin precisa preencher código de barras (e outros dados) de produtos já
cadastrados em lote. Hoje não existe forma de exportar o catálogo pra uma
planilha, editar fora do sistema e subir de volta — só dá pra editar produto
por produto na tela.

## Decisões já tomadas

- Chave de atualização da planilha: **ID interno do produto**, numa coluna
  oculta/técnica que o admin não deve mexer (não nome, não código de barras —
  evita confundir produto ao editar esses campos).
- Linhas sem ID no upload são **ignoradas** (a feature é só pra atualizar
  produtos já cadastrados; cadastro de produto novo continua pelos fluxos já
  existentes).
- Tudo roda no **navegador**, usando a biblioteca `xlsx` (SheetJS) — sem
  dependência nova no servidor. O catálogo já está carregado em
  `useStore().products` (`fetchProducts`, `src/store.ts:1096-1104`, pagina e
  traz tudo), então a exportação não precisa de nenhuma chamada ao backend.

## Onde fica

Novo item **"Relatório de Produtos"** no menu "Administração"
(`src/App.tsx:741`, junto de "Gerenciador de Produtos"), abrindo um modal
novo: `src/components/ProductReportModal.tsx`.

```tsx
<DropdownItem icon={<FileSpreadsheet className="w-4 h-4" />} label="Relatório de Produtos" onClick={() => setReportModalOpen(true)} />
```

Segue o mesmo padrão dos outros itens do menu (`productModalOpen`,
`userModalOpen`, etc.): um `useState<boolean>` novo em `App.tsx`
(`reportModalOpen`), renderizando `{reportModalOpen && <ProductReportModal onClose={...} />}` no mesmo ponto onde os outros modais admin já são renderizados.

## Exportar

Botão "Baixar planilha (Excel)" no modal. Gera um `.xlsx` a partir de
`products` (já carregado), com essas colunas nessa ordem:

| ID | Nome do Produto | Código de Barras 1 | Código de Barras 2 | Preço | Categoria | Descrição |
|----|------------------|---------------------|---------------------|-------|-----------|-----------|

- `ID`: `product.id` — coluna existe pra permitir o import identificar a
  linha depois; instrução no modal deixa claro "não altere a coluna ID".
- Nome do arquivo: `produtos-smartprice-AAAA-MM-DD.xlsx`.
- Usa `XLSX.utils.json_to_sheet` + `XLSX.utils.book_new` +
  `XLSX.writeFile` (biblioteca `xlsx`, adicionar como dependência do
  projeto).

## Importar

1. Input de arquivo (`accept=".xlsx"`) no mesmo modal.
2. Ao selecionar o arquivo: lê com `XLSX.read` (via `arrayBuffer` do
   `File`) e `XLSX.utils.sheet_to_json` pra virar um array de linhas,
   usando os nomes das colunas acima como chaves — **a planilha precisa
   manter os cabeçalhos originais** pra isso funcionar (limitação
   conhecida, documentada no modal: "não renomeie as colunas").
3. Linhas sem `ID` preenchido são descartadas silenciosamente (contadas
   num resumo, mas não bloqueiam nada).
4. Antes de mandar pro servidor, roda uma checagem de conflito em duas
   camadas, reaproveitando `findDuplicateProduct`
   (`src/lib/duplicateProductMatch.ts`):
   - Cada linha válida contra o catálogo atual (`products`), **excluindo o
     próprio produto** (`excludeId = linha.ID`) — pega o caso de editar o
     código/nome de um produto pra um valor que já pertence a OUTRO
     produto existente.
   - Cada linha válida contra as **outras linhas da própria planilha**
     (comparação par a par) — pega o caso de, ao editar, duas linhas
     acabarem com o mesmo código de barras ou nome entre si.
   - Achando qualquer conflito (em qualquer uma das duas camadas):
     **bloqueia o import inteiro**, mostra uma lista dos conflitos (linha
     da planilha × produto/linha com que colidiu), nada é enviado ao
     servidor. Mesmo padrão visual já usado no bloqueio de duplicatas do
     "Cadastrar em massa".
5. Sem conflito: mostra um resumo de confirmação ("N produtos serão
   atualizados, M linhas sem ID foram ignoradas") com um botão
   "Atualizar produtos" — só manda pro servidor depois dessa confirmação
   explícita (é uma operação em lote que mexe em vários produtos de uma
   vez, merece uma checagem a mais antes de aplicar).
6. Confirmando: uma chamada só pro backend, endpoint novo
   `PUT /products/bulk` (ver abaixo), com o array de linhas válidas.
7. Resposta do backend mostrada em toast: quantos produtos foram
   atualizados e quantos IDs não foram encontrados (produto deletado
   entre o export e o import, por exemplo) — não quebra o restante do
   lote.
8. Depois do sucesso: `fetchProducts()` / `fetchProductCount()` pra
   atualizar a lista na tela.

**Campos afetados pelo import:** nome, código de barras 1 e 2, preço,
categoria, descrição — **só esses 6**. A imagem/foto do produto (`image`,
`thumb_image`) nunca é tocada pelo import.

## Backend — novo endpoint

`PUT /products/bulk` em `api.ts`, registrado **antes** de
`PUT /products/:id` (`api.ts:273`) — se ficar depois, o Express tentaria
casar `/products/bulk` com a rota `:id` (tratando "bulk" como um ID) e
nunca chegaria na rota nova. Mesmo padrão transacional já usado em
`POST /products/bulk` (`api.ts:242-270`):

- Recebe um array `[{ id, name, description, price, category, barcode,
  barcode2 }, ...]`.
- Dentro de uma transação (`BEGIN`/`COMMIT`/`ROLLBACK`), roda um
  `UPDATE products SET name=..., description=..., price=..., category=...,
  barcode=..., barcode2=... WHERE id=$id` por item — **sem** `image` nem
  `thumb_image` no `SET`, pra nunca mexer na foto.
- Linha cujo `UPDATE` não afeta nenhuma linha (`rowCount === 0`, ID não
  existe mais) é contabilizada como "pulada", sem interromper o restante
  do lote nem dar rollback.
- Resposta: `{ updatedCount, skippedIds }`.
- Protegido por `apiAuth`, mesmo padrão das outras rotas de produto.

## Fora de escopo

- Não altera nenhum fluxo de cadastro existente (individual, em massa,
  código de barras).
- Não cria produto novo a partir do import — linhas sem ID são ignoradas.
- Não permite renomear as colunas da planilha exportada — se o admin
  mudar os cabeçalhos, o import não reconhece os campos (limitação
  conhecida, não é objetivo desta v1 resolver com um mapeamento
  flexível de colunas).
- Não afeta imagem/foto do produto.

## Teste

Local, antes de qualquer deploy:

1. Exportar a planilha com produtos já cadastrados → arquivo `.xlsx` baixa
   com as 7 colunas certas e os dados batendo com o catálogo.
2. Editar código de barras de uma linha (deixando o ID como veio) e subir
   de volta → produto atualizado no sistema, foto do produto preservada.
3. Editar duas linhas diferentes pro MESMO código de barras e subir →
   import bloqueado, mostra as duas linhas em conflito, nada é salvo.
4. Editar uma linha pro código de barras de OUTRO produto já existente
   (não presente na planilha) e subir → import bloqueado, mostra o
   conflito com o produto existente.
5. Apagar o ID de uma linha (simulando "produto novo") e subir → linha é
   ignorada, resto do lote processa normal, resumo indica quantas linhas
   foram ignoradas.
6. Planilha com um ID que não existe mais no sistema (produto deletado) →
   import processa o resto, reporta esse ID como "pulado", sem erro.
