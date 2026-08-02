# Pastas de Plaquinhas

## Contexto

Promoções se repetem toda semana (ex: "Dia da Beleza" toda segunda), mas hoje
não existe forma de guardar uma plaquinha já montada (produto + modelo +
ajustes) pra reaproveitar depois — cada semana o usuário monta tudo de novo
do zero em `ProductManager.tsx`/`CanvasPreview.tsx`.

Já existe a **Fila de Impressão** (`src/components/PrintQueue.tsx`), que desde
esta semana guarda um snapshot editável de cada item (`QueuedPlaquinhaState`
em `src/store.ts`) e tem botão "Editar" + "Salvar na Fila" (destaque azul
piscando). Mas a fila é local ao navegador (zustand `persist`, nunca sincroniza
com o servidor) e serve como área de "pronto pra imprimir agora", não como
biblioteca organizada — colocamos ali uma dica de uso temporária que este
spec substitui por uma solução de verdade.

Esta spec adiciona **Pastas**: uma biblioteca separada, sincronizada no
servidor (visível em qualquer computador daquela loja), onde o usuário
organiza plaquinhas salvas por nome de promoção (ex: "Dia da Beleza").

## Decisões já tomadas (confirmadas com o usuário)

- **Pastas ≠ Fila de Impressão.** Fila continua só pra imprimir na hora, sem
  mudanças de comportamento. Pastas é biblioteca de longo prazo. A dica que
  hoje aparece em `PrintQueue.tsx` é removida.
- **Sincronizado no servidor**, não local — decisão explícita do usuário
  mesmo sabendo que dá mais trabalho, porque o objetivo é a loja acessar de
  qualquer computador.
- **Sem tabela nova no banco nem endpoint novo.** Reaproveita o endpoint
  genérico já existente `GET/POST /api/settings/:id` (`api.ts:339-366`), com
  uma única chave `saved_plaquinhas` cujo valor é um objeto `{ [cnpjNormalizado]: SavedPlaquinha[] }`
  — mesmo padrão já usado por `activity_status` (`api.ts:374-400`, um blob só
  pra todas as lojas, indexado por cnpj dentro do JSON).
- **Miniatura embutida como base64**, não upload pro MinIO — mesma técnica já
  usada em `printQueue[].imageData`. Mais simples de construir agora; se
  crescer demais (muitas lojas, muitas plaquinhas), migra pra MinIO depois.
  Aceito como troca consciente de simplicidade agora vs. tamanho do blob no
  Postgres depois.
- **Pasta é só um campo de texto (`folder: string`) em cada plaquinha salva**,
  não uma entidade própria com id — mesmo raciocínio já usado antes: evita
  CRUD de pasta separado, "criar pasta" é só digitar um nome novo ao salvar,
  "excluir pasta" é excluir todos os itens com aquele nome, "renomear pasta"
  é um update em lote no campo `folder` de todos os itens que batem o nome
  antigo.
- **Botão "Salvar em Pasta"** fica no editor, do lado do "Adicionar à Fila"
  já existente (`src/App.tsx`, dentro do cabeçalho com Print/Fila/Exportar).
- **Tela "Minhas Pastas"** é uma tela dedicada nova (novo valor no `View`),
  no mesmo estilo visual da Fila de Impressão: grid de cards de pasta → clica
  → grid de plaquinhas salvas dentro, com miniatura.
- **Editar plaquinha salva** reusa exatamente o padrão já construído pra fila
  (`editQueueItem`/`updateQueueItem`/`editingQueueIndex` em `store.ts`): abre
  no editor, mostra botão de destaque piscando pra salvar de volta na mesma
  posição (não duplica).
- **Cada card na tela de pastas tem 3 ações**: Editar (abre no editor),
  Adicionar à Fila (manda direto pra fila de impressão sem precisar abrir o
  editor) e Excluir.
- **Risco aceito de corrida de escrita** (read-modify-write no blob inteiro):
  mesmo risco que já existe hoje em `current_layout`/`users_and_flags`/
  `activity_status` — se duas lojas *diferentes* salvarem no mesmíssimo
  segundo, uma pode sobrescrever a outra. Baixa probabilidade na prática
  (poucas lojas simultâneas), consistente com o que o projeto já tolera em
  outros lugares — não é um risco novo introduzido por esta feature.

## Modelo de dados

`src/store.ts` — novo tipo, reaproveitando o `QueuedPlaquinhaState` já
existente (ver spec/implementação da Fila de Impressão) pro snapshot do
editor:

```ts
export interface SavedPlaquinha {
  id: string;              // uuid gerado no cliente
  folder: string;           // nome digitado pelo usuário, ex: "Dia da Beleza"
  name: string;              // nome de exibição do card (default: nome do produto)
  imageData: string;         // miniatura base64 (mesma técnica do printQueue)
  isLandscape: boolean;
  editorState: QueuedPlaquinhaState; // já existe, reaproveitado sem mudança
  createdAt: string;
  updatedAt: string;
}
```

Store (`AppState`):

```ts
savedPlaquinhas: SavedPlaquinha[]; // só as da loja logada, carregado no login
loadSavedPlaquinhas: () => Promise<void>;
savePlaquinhaToFolder: (folder: string, name: string, imageData: string, isLandscape: boolean, editorState: QueuedPlaquinhaState) => Promise<void>;
editSavedPlaquinha: (id: string) => void;       // restaura no editor + seta editingSavedPlaquinhaId
// Mesma assinatura de updateQueueItem (imagem+estado atuais do editor) — o
// alvo (qual item sobrescrever) vem de editingSavedPlaquinhaId, já no estado.
updateSavedPlaquinha: (imageData: string, isLandscape: boolean, editorState: QueuedPlaquinhaState) => Promise<void>;
deleteSavedPlaquinha: (id: string) => Promise<void>;
renameFolder: (oldName: string, newName: string) => Promise<void>;
deleteFolder: (folder: string) => Promise<void>; // exclui todos os itens daquela pasta
editingSavedPlaquinhaId: string | null; // análogo a editingQueueIndex, mutuamente exclusivo com ele
```

`editQueueItem` e `editSavedPlaquinha` devem zerar o índice/id um do outro ao
serem chamados, pra nunca mostrar os dois botões de destaque ("Salvar na
Fila" e "Salvar na Pasta") ao mesmo tempo.

## Backend

Nenhuma rota nova. Persistência via `GET/POST /api/settings/saved_plaquinhas`
já existentes, seguindo o padrão de `activity_status`: o cliente lê o blob
inteiro, atualiza só a fatia do próprio cnpj, envia o blob inteiro de volta.

## Frontend

- **`src/App.tsx`**: novo botão "Salvar em Pasta" no cabeçalho do editor
  (ícone `FolderPlus` do lucide-react), abre um modal leve (`SaveToFolderModal`
  novo componente) com: campo de nome da plaquinha (default = nome do
  produto do slot 1), seletor de pasta (dropdown com pastas já existentes +
  opção de digitar uma nova). Confirmar chama `savePlaquinhaToFolder`.
- Novo botão "Minhas Pastas" no cabeçalho, do lado de "Fila Inteligente"
  (mesmo `setView`, novo valor `'folders'` em `View`).
- **`src/components/SavedFolders.tsx`** (novo, espelhando a estrutura de
  `PrintQueue.tsx`): lista de pastas (agrupadas a partir de `savedPlaquinhas`,
  contagem de itens, clique abre) → dentro da pasta, grid de cards com
  miniatura, nome, e os 3 botões de ação (Editar/Adicionar à Fila/Excluir).
  Cabeçalho da pasta tem ação de renomear e excluir a pasta inteira.
- **`src/components/PrintQueue.tsx`**: remove o banner de dica adicionado
  nesta semana (`QUEUE_TIP_DISMISSED_KEY` e o bloco JSX relacionado) —
  comportamento da fila em si não muda.
- Botão de destaque azul piscando (`animate-pulse`, já existe pro
  "Salvar na Fila") ganha uma segunda variante "Salvar na Pasta", visível
  quando `editingSavedPlaquinhaId !== null`, chamando `updateSavedPlaquinha`.

## Fora de escopo (YAGNI por agora)

- Sem miniatura via MinIO (fica embutida em base64, ver decisão acima).
- Sem reordenar plaquinhas dentro da pasta nem pastas entre si.
- Sem busca/filtro dentro de "Minhas Pastas" (biblioteca tende a ser pequena
  por loja; adicionar se crescer muito no uso real).
- Sem compartilhar pasta entre lojas diferentes (cada loja só vê a própria,
  igual a hoje isolamento por cnpj).
