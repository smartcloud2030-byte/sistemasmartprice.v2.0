# Despesas e DRE no painel Financeiro

## Contexto

O painel **Financeiro** (`src/components/FinanceiroPanel.tsx`, aberto a partir do
card "Financeiro" em `AdminDashboard.tsx`) hoje só mostra o lado da receita:
assinaturas Asaas por CNPJ (MRR) e quem está com pagamento pendente. Não existe
nenhum lugar no sistema para lançar despesas (domínio, IA, etc.), então não dá
pra ver o resultado líquido (receita − despesas) — só a receita bruta.

Esta spec adiciona uma aba de **Despesas** dentro do mesmo modal, com um resumo
no topo no estilo DRE (Demonstrativo de Resultado): Receita, Despesas do mês,
Resultado.

## Decisões já tomadas (confirmadas com o usuário)

- Fica **dentro do modal Financeiro existente**, em abas: "Receitas" (o que já
  existe) e "Despesas" (nova) — não é um painel separado.
- Categoria de despesa é um **enum fixo**: Domínio, IA, Outros (sem categorias
  livres, pra evitar inconsistência de grafia na soma por categoria).
- Cada despesa pode ser **recorrente mensal** ou **avulsa** (lançamento único).
- O DRE tem **navegação por mês** (não é só um total corrente) — despesas
  recorrentes contam automaticamente em todo mês até serem encerradas/excluídas.
- A **Receita** do DRE é sempre o **MRR atual** (soma das assinaturas ativas
  agora), mesmo ao navegar para meses passados — o sistema não guarda
  histórico mensal de receita, e isso fica fora de escopo aqui (decisão
  explícita: manter o escopo enxuto agora, revisitar como projeto separado se
  fizer falta). A tela deixa isso visualmente claro (aviso ao lado do valor de
  receita, tipo "Receita atual — sem histórico").
- Cada despesa tem um campo opcional de **fornecedor/link** (texto livre —
  nome do fornecedor, URL de renovação, ou os dois).

## Modelo de dados

```typescript
interface Despesa {
  id: string;
  descricao: string;
  categoria: 'dominio' | 'ia' | 'outros';
  valor: number;
  recorrente: boolean;
  data: string;        // ISO date — início da despesa (avulsa: a data do gasto)
  dataFim?: string;     // ISO date, opcional — quando definida, uma despesa
                        // recorrente para de contar a partir desse mês em diante
  fornecedor?: string;  // opcional — nome do fornecedor e/ou link
}
```

## Armazenamento

Sem rota de API nova nem migração de banco: `despesas: Despesa[]` entra como
mais um campo dentro do mesmo blob JSON que `saveUsersAndFlags`/
`loadUsersAndFlags` (`src/store.ts`) já salva em `settings.users_and_flags` —
o mesmo lugar onde hoje vivem `allowedStores`, `flags`, `announcements`,
`userGroups`, etc. Isso significa:

- Nenhum endpoint novo no backend (`api.ts` não muda).
- Persistência e carregamento reaproveitam `saveUsersAndFlags`/
  `loadUsersAndFlags` — só adiciona o campo `despesas` no objeto salvo/lido.
- Segue o padrão de autenticação atual do endpoint `POST /settings/:id`
  (token fixo `x-api-token`, igual toda escrita administrativa hoje) — esta
  spec não depende da migração de sessão real (spec separada,
  `2026-08-05-seguranca-sessao-api-design.md`) para funcionar.

## Fluxo de UI

- **`FinanceiroPanel.tsx`** vira a casca do modal: header, barra de resumo DRE
  (sempre visível, independente da aba ativa), e as duas abas.
  - Barra de resumo: **Receita** (MRR atual, com aviso de que não é
    histórico) · **Despesas** (do mês selecionado na aba Despesas) ·
    **Resultado** (Receita − Despesas; verde se positivo, vermelho se
    negativo).
  - Aba **Receitas**: exatamente o conteúdo que já existe hoje no arquivo
    (lista de assinaturas, busca, contadores) — não muda.
  - Aba **Despesas**: delega para o componente novo `FinanceiroDespesasTab.tsx`.
- **`FinanceiroDespesasTab.tsx`** (novo componente, só a lógica de despesas):
  - Navegação de mês (← Agosto 2026 →), começando no mês atual.
  - Lista das despesas ativas no mês selecionado (ver "Cálculo do DRE"
    abaixo), agrupadas/com badge de cor por categoria.
  - Cada linha mostra: descrição, categoria, valor, indicador de recorrente,
    fornecedor/link (se preenchido) e botões de editar/excluir.
  - Botão **+ Nova despesa** abre um formulário (descrição, categoria, valor,
    toggle recorrente, data, fornecedor/link opcional).
  - Editar uma despesa recorrente permite definir `dataFim` (ela some do
    cálculo a partir do mês seguinte, mas continua existindo — não é
    exclusão).
  - Excluir remove a despesa por completo (de todos os meses — útil pra
    cadastro errado).

## Cálculo do DRE por mês

Dado um mês/ano selecionado (`{ year, month }`):

- **Despesas do mês** = soma de:
  - toda despesa **recorrente** cujo `data` (início) seja `<=` o mês
    selecionado **e** (`dataFim` vazio **ou** `dataFim >=` o mês selecionado);
  - toda despesa **avulsa** cujo `data` caia dentro do mês selecionado.
- **Receita** = MRR atual (`allowedStores` com `asaasSubscriptionId`, soma de
  `subscriptionValue` — mesmo cálculo que já existe em `FinanceiroPanel.tsx`
  hoje), igual em qualquer mês navegado (ver limitação assumida acima).
- **Resultado** = Receita − Despesas do mês.

A lógica de filtro por mês (`isDespesaAtivaNoMes`) e o cálculo de totais devem
ser funções puras, testáveis sem UI (mesmo padrão de
`buildEmissaoPayload`/`validateEmissaoInput` em `src/notaFiscal.ts`, testadas
com `node:assert` via `tsx`).

## Fora de escopo (decisão do usuário)

- Histórico real de receita mês a mês (snapshot mensal de MRR).
- Categorias de despesa livres/customizáveis.
- Gráficos ou exportação do DRE (só a visão do mês selecionado dentro do
  modal).
