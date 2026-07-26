# Alerta de duplicata ao digitar o código de barras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao digitar/bipar um código de barras que já pertence a um produto
cadastrado, avisar na hora (sem chamar a Cosmos Bluesoft) em vez de só avisar
no clique final de "Cadastrar produto".

**Architecture:** Reaproveita 100% da infraestrutura já existente
(`findDuplicateProduct`, o state `duplicateMatch` e o modal já construído em
`ProductManager.tsx`) — a única peça nova é um state booleano
(`duplicateMatchFromBarcode`) que diferencia os dois gatilhos pra decidir
quantos botões o modal mostra.

**Tech Stack:** TypeScript, React. Sem endpoint novo, sem dependência nova.

## Global Constraints

- Achando duplicata local no campo de código de barras: **não chama a
  Cosmos** — `return` antes do `fetch('/api/barcode-lookup/...')`.
- Só 2 botões nesse gatilho: "Editar as informações" (`openModal(match)`) e
  "Cadastrar novamente" (fecha o aviso, sem salvar nada).
- O botão "Cadastrar/Salvar mesmo assim" (salva de verdade) só pode aparecer
  no aviso disparado pelo submit do formulário — nunca no gatilho do código
  de barras, porque o formulário ainda pode estar incompleto nesse ponto.
- Reaproveita o mesmo `duplicateMatch`/modal — não cria modal novo.
- Não mexe no campo `barcode2`, nem no comportamento do aviso no submit
  (continua com as 3 opções de hoje).

---

### Task 1: Checagem antecipada no código de barras

**Files:**
- Modify: `src/components/ProductManager.tsx:76` (novo state)
- Modify: `src/components/ProductManager.tsx:108-150` (`lookupBarcode`)
- Modify: `src/components/ProductManager.tsx:303-304` (`handleSubmit`, seta o flag explicitamente)
- Modify: `src/components/ProductManager.tsx:391-394` (`openModal`, reset)
- Modify: `src/components/ProductManager.tsx:864-892` (modal — texto/visibilidade condicional dos botões)

**Interfaces:**
- Consumes: `findDuplicateProduct(candidate, products, excludeId?): Product | null` (já existe, `src/lib/duplicateProductMatch.ts`).
- Produces: nenhuma interface nova consumida por outro código.

- [ ] **Step 1: Novo state `duplicateMatchFromBarcode`**

Na linha 76 (junto de `duplicateMatch`):
```ts
  const [duplicateMatch, setDuplicateMatch] = useState<Product | null>(null);
```
vira:
```ts
  const [duplicateMatch, setDuplicateMatch] = useState<Product | null>(null);
  const [duplicateMatchFromBarcode, setDuplicateMatchFromBarcode] = useState(false);
```

- [ ] **Step 2: Checagem local no início de `lookupBarcode`, antes da busca na Cosmos**

O início de `lookupBarcode` (linhas 108-113) hoje é:
```ts
  const lookupBarcode = async (rawCode: string) => {
    const code = rawCode.replace(/\D/g, '');
    if (code.length < 8 || isLookingUpBarcode) return;
    setIsLookingUpBarcode(true);
    try {
      const res = await fetch(`/api/barcode-lookup/${code}`, { headers: { 'x-api-token': API_SECRET } });
```
Substituir por:
```ts
  const lookupBarcode = async (rawCode: string) => {
    const code = rawCode.replace(/\D/g, '');
    if (code.length < 8 || isLookingUpBarcode) return;

    const localMatch = findDuplicateProduct({ name: formData.name, barcode: code }, products, editingProduct?.id);
    if (localMatch) { setDuplicateMatch(localMatch); setDuplicateMatchFromBarcode(true); return; }

    setIsLookingUpBarcode(true);
    try {
      const res = await fetch(`/api/barcode-lookup/${code}`, { headers: { 'x-api-token': API_SECRET } });
```

(`findDuplicateProduct` já é importado no topo do arquivo, linha 3 — nenhum import novo. `formData.name` pode estar vazio nesse ponto; a função já ignora nome vazio na comparação, então só o código de barras conta pra esse match.)

- [ ] **Step 3: Marcar explicitamente `duplicateMatchFromBarcode = false` no gatilho do submit**

Em `handleSubmit`, o trecho atual (linhas 303-304):
```ts
    const match = findDuplicateProduct({ name: formData.name, barcode: formData.barcode, barcode2: formData.barcode2 }, products, editingProduct?.id);
    if (match) { setDuplicateMatch(match); return; }
```
vira:
```ts
    const match = findDuplicateProduct({ name: formData.name, barcode: formData.barcode, barcode2: formData.barcode2 }, products, editingProduct?.id);
    if (match) { setDuplicateMatch(match); setDuplicateMatchFromBarcode(false); return; }
```

- [ ] **Step 4: Resetar o novo state em `openModal`**

Em `openModal` (linhas 391-394):
```ts
    setPendingFile(null);
    setDuplicateOption(false);
    setDuplicateMatch(null);
    setIsModalOpen(true);
  };
```
vira:
```ts
    setPendingFile(null);
    setDuplicateOption(false);
    setDuplicateMatch(null);
    setDuplicateMatchFromBarcode(false);
    setIsModalOpen(true);
  };
```

- [ ] **Step 5: Ajustar o modal — texto do botão "Cancelar" e visibilidade do botão "mesmo assim"**

O bloco do modal (linhas 882-890) hoje é:
```tsx
            <p className="text-zinc-600 dark:text-zinc-400 font-bold mb-8">Deseja editá-lo em vez de cadastrar um novo?</p>
            <div className="flex gap-3">
              <button onClick={() => setDuplicateMatch(null)} className="flex-1 px-6 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-black uppercase text-xs text-black dark:text-white">Cancelar</button>
              <button onClick={() => { const match = duplicateMatch; setDuplicateMatch(null); if (match) openModal(match); }} className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs">Editar produto existente</button>
            </div>
            <button onClick={() => { setDuplicateMatch(null); saveProduct(); }} className="w-full mt-3 py-2 text-xs font-bold uppercase text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-center">
              {editingProduct?.id ? 'Salvar mesmo assim' : 'Cadastrar mesmo assim'}
            </button>
          </div>
        </div>
      )}
```
Substituir por:
```tsx
            <p className="text-zinc-600 dark:text-zinc-400 font-bold mb-8">Deseja editá-lo em vez de cadastrar um novo?</p>
            <div className="flex gap-3">
              <button onClick={() => { setDuplicateMatch(null); setDuplicateMatchFromBarcode(false); }} className="flex-1 px-6 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-black uppercase text-xs text-black dark:text-white">
                {duplicateMatchFromBarcode ? 'Cadastrar novamente' : 'Cancelar'}
              </button>
              <button onClick={() => { const match = duplicateMatch; setDuplicateMatch(null); setDuplicateMatchFromBarcode(false); if (match) openModal(match); }} className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs">Editar produto existente</button>
            </div>
            {!duplicateMatchFromBarcode && (
              <button onClick={() => { setDuplicateMatch(null); saveProduct(); }} className="w-full mt-3 py-2 text-xs font-bold uppercase text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-center">
                {editingProduct?.id ? 'Salvar mesmo assim' : 'Cadastrar mesmo assim'}
              </button>
            )}
          </div>
        </div>
      )}
```

(O botão "Cancelar"/"Cadastrar novamente" agora também reseta `duplicateMatchFromBarcode` — evita que o flag fique "preso" em `true` se o modal reabrir depois por outro caminho. O botão "Editar produto existente" também reseta o flag pelo mesmo motivo, embora `openModal` já faça esse reset de qualquer forma — redundância inofensiva, mais clara de ler.)

- [ ] **Step 6: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 7: Testar manualmente no navegador**

Suba o app localmente (Docker com `postgres`/`minio`/`app`, como nas features
anteriores — lembrar de garantir que as tabelas `products`/`settings` e o
bucket do MinIO existem nesse ambiente, se for um banco/volume novo) e, como
admin, no cadastro de produto:

1. Abrir "Novo produto", digitar/bipar um código de barras que já pertence a
   um produto cadastrado → o aviso "Produto já cadastrado" aparece na hora,
   com foto/nome/categoria do produto existente e SÓ 2 botões
   ("Cadastrar novamente" e "Editar produto existente" — sem
   "Cadastrar/Salvar mesmo assim"). Confirmar que nenhum toast de busca da
   Cosmos apareceu (nem sucesso, nem "produto não encontrado").
2. Clicar "Cadastrar novamente" → aviso fecha, formulário continua aberto e
   com os dados já digitados.
3. Digitar o mesmo código de novo, clicar "Editar as informações" → carrega o
   produto existente pra edição (título vira "Editar produto").
4. Digitar um código que NÃO existe na base local → segue normal, busca na
   Cosmos acontece (toast de sucesso ou "não encontrado", como já era).
5. Preencher um formulário completo (nome, descrição, preço, categoria) sem
   passar pelo código de barras batendo em nada, mas com NOME igual a um
   produto existente, e clicar "Cadastrar produto" → aviso completo com os
   3 botões continua aparecendo normalmente (fluxo já existente, não deve
   ter regredido).
6. No aviso de 3 botões (cenário 5), clicar "Cadastrar mesmo assim" → salva
   normalmente, confirma que esse caminho não foi afetado pelas mudanças.

Expected: os 6 cenários se comportam como descrito, sem erro no console.

- [ ] **Step 8: Commit**

```bash
git add src/components/ProductManager.tsx
git commit -m "feat: alerta de duplicata ao digitar codigo de barras, antes da busca na Cosmos"
```

---

### Task 2: Verificação final

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Rodar a suíte de testes existente**

```bash
npm test
```
Expected: as 3 linhas `PASS: ...` aparecem (nenhum teste novo nesta feature —
a lógica reaproveitada já é testada em `duplicateProductMatch.test.ts`),
exit code 0.

- [ ] **Step 2: Rodar o lint do projeto inteiro**

```bash
npm run lint
```
Expected: sem erros.

- [ ] **Step 3: Repetir o roteiro de teste do spec**

Repetir os 6 cenários da seção "Teste" do spec
(`docs/superpowers/specs/2026-07-26-alerta-duplicata-no-codigo-de-barras-design.md`)
no navegador, de ponta a ponta, se ainda não foram todos cobertos na Task 1.

- [ ] **Step 4: Não fazer deploy ainda**

Combinar com o usuário antes de subir pra VPS.
