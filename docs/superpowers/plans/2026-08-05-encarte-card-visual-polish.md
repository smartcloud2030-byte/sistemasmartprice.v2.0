# Encarte — Acabamento Visual dos Cards de Produto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar acabamento profissional aos cards de produto do Encarte Semanal — tipografia de preço destacada (real grande/centavo pequeno), sombra de texto opcional, e sincronizar o layout entre produtos (aplicar a todos + salvar como padrão do molde) — sem quebrar nenhum molde já existente.

**Architecture:** Extensão aditiva do modelo `EncarteMolde` (campos novos opcionais) + duas funções puras testáveis em `src/lib/encarteLayoutSync.ts` (mesmo padrão já usado por `src/lib/encarteGrid.ts` e `src/lib/encartePrice.ts`) + wiring no componente existente `EncarteWeekly.tsx` e nos controles do `MoldeEditor.tsx`. `formatPrice` (`src/lib/encartePrice.ts`) já existe, já testado, e ainda não é usado em lugar nenhum — reaproveitado aqui.

**Tech Stack:** React + TypeScript, Zustand (`useStore`), Tailwind, testes via `tsx` + `node:assert` (sem framework de teste, mesmo padrão dos arquivos `*.test.ts` já existentes em `src/lib/`).

## Global Constraints

- Zero migração de dados: todo campo novo em `EncarteMolde` é opcional; moldes salvos hoje continuam funcionando idênticos sem nenhum desses campos presentes.
- Sem deploy/push — implementação fica commitada local, testada (`npm run lint` = `tsc --noEmit`, `npm test`, `npm run build`), aguardando o usuário revisar.
- Formato de preço "Leve X Pague R$Y" está fora de escopo (ver spec).
- Cada task termina com o suite de teste (`npm test`) passando e `git commit`.

Spec completa: `docs/superpowers/specs/2026-08-05-encarte-card-visual-polish-design.md`

---

### Task 1: Estender o tipo `EncarteMolde` com os campos novos

**Files:**
- Modify: `src/store.ts:227-241`

**Interfaces:**
- Produces: `EncartePriceTypography` (tipo), e os campos `priceTypography?`, `textShadow?`, `defaultCardRect?`, `defaultElementLayout?`, `defaultNameFontSize?`, `defaultSubtitleFontSize?`, `defaultPriceFontSize?` em `EncarteMolde` — usados pelas Tasks 3, 4, 5, 6.

- [ ] **Step 1: Ler o trecho atual pra confirmar a numeração de linha antes de editar**

Run: abrir `src/store.ts` e conferir que linhas 227-241 ainda são:
```ts
export type EncarteFontFamily = 'Inter' | 'Roboto' | 'Oswald';

export interface EncarteMolde {
  id: string;
  nome: string;
  frontBgUrl: string;
  backBgUrl?: string;
  frontSlots: EncarteSlotDef[];
  backSlots?: EncarteSlotDef[];
  frontGrid: EncarteGridConfig;
  backGrid?: EncarteGridConfig;
  fontFamily?: EncarteFontFamily;
  priceBoxColor?: string;
  productNameColor?: string;
}
```
Se o conteúdo mudou, reajuste os steps seguintes pro texto real.

- [ ] **Step 2: Editar o tipo**

Substituir o bloco acima por:
```ts
export type EncarteFontFamily = 'Inter' | 'Roboto' | 'Oswald';
export type EncartePriceTypography = 'uniforme' | 'destacado';

export interface EncarteMolde {
  id: string;
  nome: string;
  frontBgUrl: string;
  backBgUrl?: string;
  frontSlots: EncarteSlotDef[];
  backSlots?: EncarteSlotDef[];
  frontGrid: EncarteGridConfig;
  backGrid?: EncarteGridConfig;
  fontFamily?: EncarteFontFamily;
  priceBoxColor?: string;
  productNameColor?: string;
  // Tipografia do preço: 'uniforme' (padrão, comportamento de sempre) ou
  // 'destacado' (reais grande + centavos menor, como etiqueta de preço).
  priceTypography?: EncartePriceTypography;
  // Sombra sutil no nome do produto e no texto do preço (não na descrição).
  textShadow?: boolean;
  // Layout padrão pra produto NOVO colocado num slot desse molde — grava
  // via botão "Definir como padrão do molde" em EncarteWeekly. Ausente =
  // usa as constantes DEFAULT_* de EncarteWeekly.tsx (comportamento atual).
  defaultCardRect?: { offsetX: number; offsetY: number; width: number; height: number };
  defaultElementLayout?: EncarteElementLayout;
  defaultNameFontSize?: number;
  defaultSubtitleFontSize?: number;
  defaultPriceFontSize?: number;
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `store.ts` (o tipo só ganhou campos opcionais, nada consome ainda — não deve quebrar nada existente).

- [ ] **Step 4: Commit**

```bash
git add src/store.ts
git commit -m "feat: adiciona campos de estilo/padrao no tipo EncarteMolde"
```

---

### Task 2: Funções puras de sincronização de layout (`src/lib/encarteLayoutSync.ts`)

**Files:**
- Create: `src/lib/encarteLayoutSync.ts`
- Create: `src/lib/encarteLayoutSync.test.ts`
- Modify: `package.json:8` (encadear o novo teste no script `test`)

**Interfaces:**
- Consumes: `SelectedProduct`, `EncarteElementLayout`, `EncarteMolde` (de `../store`, definidos na Task 1).
- Produces: `ProductLayoutFields` (interface), `extractLayoutFields(product): ProductLayoutFields`, `applyLayoutToAll(produtos, slotIds, layout): Record<string, SelectedProduct | null>`, `buildMoldeDefaults(layout): Pick<EncarteMolde, 'defaultCardRect'|'defaultElementLayout'|'defaultNameFontSize'|'defaultSubtitleFontSize'|'defaultPriceFontSize'>` — usados pela Task 6.

- [ ] **Step 1: Escrever o arquivo de implementação**

`src/lib/encarteLayoutSync.ts`:
```ts
import type { EncarteElementLayout, EncarteMolde, SelectedProduct } from '../store';

// Só os campos de POSIÇÃO/TAMANHO/FONTE de um produto no card — nunca nome,
// preço, foto ou id, que são conteúdo, não layout.
export interface ProductLayoutFields {
  offsetX?: number;
  offsetY?: number;
  width?: number;
  height?: number;
  elementLayout?: EncarteElementLayout;
  nameFontSize?: number;
  subtitleFontSize?: number;
  priceFontSize?: number;
}

export function extractLayoutFields(product: SelectedProduct): ProductLayoutFields {
  return {
    offsetX: product.offsetX,
    offsetY: product.offsetY,
    width: product.width,
    height: product.height,
    elementLayout: product.elementLayout,
    nameFontSize: product.nameFontSize,
    subtitleFontSize: product.subtitleFontSize,
    priceFontSize: product.priceFontSize,
  };
}

// Aplica `layout` a todo produto já preenchido cujo slotId esteja em
// `slotIds` (o chamador restringe à frente OU ao verso — os dois lados
// dividem o mesmo mapa `produtos`, então sem essa restrição o botão
// "aplicar a todos" da frente bagunçaria o verso). Slots vazios (null) e
// slots fora de `slotIds` ficam intocados. Nome/preço/foto/id de cada
// produto são preservados — só o layout muda.
export function applyLayoutToAll(
  produtos: Record<string, SelectedProduct | null>,
  slotIds: string[],
  layout: ProductLayoutFields
): Record<string, SelectedProduct | null> {
  const result: Record<string, SelectedProduct | null> = { ...produtos };
  for (const slotId of slotIds) {
    const product = produtos[slotId];
    if (product) result[slotId] = { ...product, ...layout };
  }
  return result;
}

// Converte o layout de um produto de referência nos campos de PADRÃO DO
// MOLDE. `defaultCardRect` só é gravado se as 4 dimensões estiverem
// definidas (produto nunca arrastado = índice do card ainda usa o
// fallback embutido em EncarteWeekly, não grava um retângulo pela metade).
export function buildMoldeDefaults(
  layout: ProductLayoutFields
): Pick<EncarteMolde, 'defaultCardRect' | 'defaultElementLayout' | 'defaultNameFontSize' | 'defaultSubtitleFontSize' | 'defaultPriceFontSize'> {
  const hasFullCardRect =
    layout.offsetX !== undefined && layout.offsetY !== undefined &&
    layout.width !== undefined && layout.height !== undefined;

  return {
    defaultCardRect: hasFullCardRect
      ? { offsetX: layout.offsetX!, offsetY: layout.offsetY!, width: layout.width!, height: layout.height! }
      : undefined,
    defaultElementLayout: layout.elementLayout,
    defaultNameFontSize: layout.nameFontSize,
    defaultSubtitleFontSize: layout.subtitleFontSize,
    defaultPriceFontSize: layout.priceFontSize,
  };
}
```

- [ ] **Step 2: Escrever o teste**

`src/lib/encarteLayoutSync.test.ts`:
```ts
import assert from 'node:assert';
import { extractLayoutFields, applyLayoutToAll, buildMoldeDefaults } from './encarteLayoutSync';
import type { SelectedProduct } from '../store';

const baseProduct: SelectedProduct = {
  id: 'p1',
  name: 'Produto A',
  price: '9,99',
  image: 'https://imagens.sistemasmartprice.com.br/smartprice-images/a.webp',
  category: 'geral',
  offsetX: 12,
  offsetY: 8,
  width: 70,
  height: 75,
  elementLayout: { name: { xPct: 1, yPct: 1, widthPct: 50, heightPct: 15 } },
  nameFontSize: 7,
  subtitleFontSize: 5,
  priceFontSize: 12,
};

function extractLayoutFieldsPicksOnlyLayoutNotContent() {
  const fields = extractLayoutFields(baseProduct);
  assert.deepStrictEqual(fields, {
    offsetX: 12, offsetY: 8, width: 70, height: 75,
    elementLayout: { name: { xPct: 1, yPct: 1, widthPct: 50, heightPct: 15 } },
    nameFontSize: 7, subtitleFontSize: 5, priceFontSize: 12,
  });
  // conteúdo (name/price/image/id) não deve vazar pro layout
  assert.strictEqual((fields as any).name, undefined);
  assert.strictEqual((fields as any).price, undefined);
}

function applyLayoutToAllOverwritesLayoutKeepsContentOnListedSlots() {
  const layout = extractLayoutFields(baseProduct);
  const produtos: Record<string, SelectedProduct | null> = {
    'slot-1': baseProduct,
    'slot-2': { ...baseProduct, id: 'p2', name: 'Produto B', offsetX: 99, offsetY: 99 },
    'slot-3': null,
    'slot-outro-lado': { ...baseProduct, id: 'p3', name: 'Produto C', offsetX: 1, offsetY: 1 },
  };

  const result = applyLayoutToAll(produtos, ['slot-1', 'slot-2', 'slot-3'], layout);

  assert.strictEqual(result['slot-2']!.name, 'Produto B'); // conteúdo preservado
  assert.strictEqual(result['slot-2']!.offsetX, 12);        // layout sobrescrito
  assert.strictEqual(result['slot-3'], null);                // slot vazio continua vazio
  assert.strictEqual(result['slot-outro-lado']!.offsetX, 1); // fora da lista, intocado
}

function buildMoldeDefaultsSkipsPartialCardRect() {
  const partial = { elementLayout: baseProduct.elementLayout, nameFontSize: 7 }; // sem offsetX/Y/width/height
  const defaults = buildMoldeDefaults(partial);
  assert.strictEqual(defaults.defaultCardRect, undefined);
  assert.deepStrictEqual(defaults.defaultElementLayout, baseProduct.elementLayout);
  assert.strictEqual(defaults.defaultNameFontSize, 7);
}

function buildMoldeDefaultsIncludesCardRectWhenComplete() {
  const layout = extractLayoutFields(baseProduct);
  const defaults = buildMoldeDefaults(layout);
  assert.deepStrictEqual(defaults.defaultCardRect, { offsetX: 12, offsetY: 8, width: 70, height: 75 });
}

try {
  extractLayoutFieldsPicksOnlyLayoutNotContent();
  applyLayoutToAllOverwritesLayoutKeepsContentOnListedSlots();
  buildMoldeDefaultsSkipsPartialCardRect();
  buildMoldeDefaultsIncludesCardRectWhenComplete();
  console.log('PASS: todos os testes de encarteLayoutSync passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 3: Rodar e confirmar que passa**

Run: `npx tsx src/lib/encarteLayoutSync.test.ts`
Expected: `PASS: todos os testes de encarteLayoutSync passaram`

- [ ] **Step 4: Encadear no script `test` do `package.json`**

Em `package.json`, campo `"test"`, adicionar `&& tsx src/lib/encarteLayoutSync.test.ts` no final da cadeia existente (depois de `notaFiscal.test.ts`).

- [ ] **Step 5: Rodar a suite inteira**

Run: `npm test`
Expected: todas as linhas terminam em sucesso, incluindo a nova.

- [ ] **Step 6: Commit**

```bash
git add src/lib/encarteLayoutSync.ts src/lib/encarteLayoutSync.test.ts package.json
git commit -m "feat: funcoes puras pra sincronizar layout entre produtos do encarte"
```

---

### Task 3: Toggles de tipografia de preço e sombra no `MoldeEditor.tsx`

**Files:**
- Modify: `src/components/encarte/MoldeEditor.tsx:203-222` (bloco dos color pickers existentes)

**Interfaces:**
- Consumes: `EncartePriceTypography` (Task 1), `draft.priceTypography`/`draft.textShadow` (via `setDraft`, mecanismo já existente no arquivo).

- [ ] **Step 1: Ler o bloco atual pra confirmar a numeração**

Conferir que `src/components/encarte/MoldeEditor.tsx:203-222` ainda é o bloco:
```tsx
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-black uppercase text-zinc-500">Caixa do preço</label>
                <input
                  type="color"
                  value={draft.priceBoxColor || DEFAULT_PRICE_BOX_COLOR}
                  onChange={(e) => setDraft((d) => ({ ...d, priceBoxColor: e.target.value }))}
                  className="w-7 h-7 rounded-lg cursor-pointer border-none bg-transparent"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-black uppercase text-zinc-500">Nome do produto</label>
                <input
                  type="color"
                  value={draft.productNameColor || DEFAULT_PRODUCT_NAME_COLOR}
                  onChange={(e) => setDraft((d) => ({ ...d, productNameColor: e.target.value }))}
                  className="w-7 h-7 rounded-lg cursor-pointer border-none bg-transparent"
                />
              </div>
            </div>
```
Se mudou, reajustar o `old_string` do Step 2 pro texto real.

- [ ] **Step 2: Adicionar os dois toggles logo depois desse bloco**

Inserir, imediatamente após o `</div>` que fecha o bloco acima (antes do botão "Desenhar manualmente"):
```tsx
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, priceTypography: d.priceTypography === 'destacado' ? 'uniforme' : 'destacado' }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  draft.priceTypography === 'destacado' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700'
                }`}
              >
                Preço destacado
              </button>
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, textShadow: !d.textShadow }))}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  draft.textShadow ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700'
                }`}
              >
                Sombra no texto
              </button>
            </div>
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros (o `draft` já é tipado como `EncarteMolde`, que ganhou os campos na Task 1).

- [ ] **Step 4: Commit**

```bash
git add src/components/encarte/MoldeEditor.tsx
git commit -m "feat: toggles de preco destacado e sombra de texto no editor de molde"
```

---

### Task 4: Tipografia de preço destacada + sombra de texto no `EncarteWeekly.tsx`

**Files:**
- Modify: `src/components/encarte/EncarteWeekly.tsx:1-9` (imports)
- Modify: `src/components/encarte/EncarteWeekly.tsx:596-598` (estilo do nome)
- Modify: `src/components/encarte/EncarteWeekly.tsx:630-674` (bloco da caixa de preço)

**Interfaces:**
- Consumes: `formatPrice` (`src/lib/encartePrice.ts`, já existe), `molde.priceTypography`/`molde.textShadow` (Task 1).

- [ ] **Step 1: Importar `formatPrice`**

No topo de `src/components/encarte/EncarteWeekly.tsx`, junto dos outros imports de `../../lib/*`:
```ts
import { formatPrice } from '../../lib/encartePrice';
```
(o arquivo já importa `getProxyUrl` de `../../lib/utils` na linha 3 — adicionar essa linha logo depois.)

- [ ] **Step 2: Sombra no nome do produto**

Local atual (linha ~596-598):
```tsx
                        className="w-full h-full min-w-0 overflow-hidden font-black uppercase leading-tight bg-transparent outline-none whitespace-pre-wrap break-words focus:ring-1 focus:ring-black/20 rounded-[1px]"
                        style={{ color: nameColor, fontSize: `${product.nameFontSize ?? DEFAULT_NAME_FONT_SIZE}px` }}
```
Substituir por:
```tsx
                        className="w-full h-full min-w-0 overflow-hidden font-black uppercase leading-tight bg-transparent outline-none whitespace-pre-wrap break-words focus:ring-1 focus:ring-black/20 rounded-[1px]"
                        style={{
                          color: nameColor,
                          fontSize: `${product.nameFontSize ?? DEFAULT_NAME_FONT_SIZE}px`,
                          textShadow: molde.textShadow ? '0 1px 2px rgba(0,0,0,.35)' : undefined,
                        }}
```

- [ ] **Step 3: Ler o bloco atual da caixa de preço pra confirmar a numeração**

Confirmar que `EncarteWeekly.tsx:630-674` ainda é o bloco IIFE que renderiza `priceFontSize`/`labelFontSize` e o `<div>` da caixa de preço (com o botão de alternar `%`, o `<span>Por</span>`, e o `input`/`%` condicionais por `displayType`). Se mudou, reajustar o `old_string` do Step 4 pro texto real.

- [ ] **Step 4: Adicionar a variante "destacado" no modo preço (não no modo desconto)**

Dentro do bloco `{product.displayType === 'discount' ? (...) : (...)}`, o ramo `else` (preço normal) hoje é:
```tsx
                              <div className="flex items-baseline gap-[1px]">
                                <input
                                  type="text"
                                  value={product.price}
                                  onPointerDown={(e) => { e.stopPropagation(); selectElement(slot.id, 'price'); }}
                                  onChange={(e) => updateSlotProduct(slot.id, { price: e.target.value })}
                                  className="font-black text-white leading-none bg-transparent border-none outline-none p-0 focus:ring-1 focus:ring-white/50 rounded-[1px]"
                                  style={{ fontSize: `${priceFontSize}px`, width: `${Math.max(40, priceFontSize * 4)}px` }}
                                />
                                <span className="font-black text-white uppercase leading-none" style={{ fontSize: `${labelFontSize}px` }}>Uni</span>
                              </div>
```
Substituir por (mostra a versão "destacada" só quando o molde pede E o campo não está selecionado — clicar nela seleciona e volta pro `<input>` plano de sempre, pra digitar):
```tsx
                              molde.priceTypography === 'destacado' && !isSelected(slot.id, 'price') ? (
                                <div
                                  className="flex items-start gap-[1px]"
                                  onPointerDown={(e) => { e.stopPropagation(); selectElement(slot.id, 'price'); }}
                                  style={{ textShadow: molde.textShadow ? '0 1px 2px rgba(0,0,0,.35)' : undefined }}
                                >
                                  <span className="font-black text-white leading-none" style={{ fontSize: `${priceFontSize}px` }}>{formatPrice(product.price).integer}</span>
                                  <span className="font-black text-white leading-none" style={{ fontSize: `${priceFontSize * 0.55}px` }}>{formatPrice(product.price).cents}</span>
                                  <span className="font-black text-white uppercase leading-none self-end" style={{ fontSize: `${labelFontSize}px` }}>Uni</span>
                                </div>
                              ) : (
                                <div className="flex items-baseline gap-[1px]">
                                  <input
                                    type="text"
                                    value={product.price}
                                    onPointerDown={(e) => { e.stopPropagation(); selectElement(slot.id, 'price'); }}
                                    onChange={(e) => updateSlotProduct(slot.id, { price: e.target.value })}
                                    className="font-black text-white leading-none bg-transparent border-none outline-none p-0 focus:ring-1 focus:ring-white/50 rounded-[1px]"
                                    style={{ fontSize: `${priceFontSize}px`, width: `${Math.max(40, priceFontSize * 4)}px`, textShadow: molde.textShadow ? '0 1px 2px rgba(0,0,0,.35)' : undefined }}
                                  />
                                  <span className="font-black text-white uppercase leading-none" style={{ fontSize: `${labelFontSize}px` }}>Uni</span>
                                </div>
                              )
```
(Isso troca o `<div className="flex items-baseline gap-[1px]">...</div>` único por uma expressão ternária que produz um dos dois — o JSX ao redor, incluindo o ramo `discount` do outro lado do `? :`, não muda.)

- [ ] **Step 5: Verificar tipos e rodar o app localmente**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run dev`, abrir a tela de Encarte Semanal, escolher um molde com produto cadastrado.
Expected: preço aparece igual a antes (typography "uniforme" ainda é o padrão pra molde sem esse campo). Sem regressão visível.

- [ ] **Step 6: Commit**

```bash
git add src/components/encarte/EncarteWeekly.tsx
git commit -m "feat: tipografia de preco destacada e sombra de texto no encarte semanal"
```

---

### Task 5: Layout padrão do molde como fallback (antes de `DEFAULT_ELEMENT_RECTS`)

**Files:**
- Modify: `src/components/encarte/EncarteWeekly.tsx:283-284` (`getElementRect`)
- Modify: `src/components/encarte/EncarteWeekly.tsx:561-570` (`contentRect`, `nameRect`, `subtitleRect`, `priceRect`, `imageRect`)
- Modify: `src/components/encarte/EncarteWeekly.tsx:597,616,631` (font sizes de nome/descrição/preço)

**Interfaces:**
- Consumes: `molde.defaultCardRect`/`molde.defaultElementLayout`/`molde.default*FontSize` (Task 1).

- [ ] **Step 1: `getElementRect` — usado por `handleWheel` (redimensionar com a roda do mouse)**

Local atual:
```ts
  const getElementRect = (product: SelectedProduct, key: 'name' | 'subtitle' | 'price' | 'image'): EncarteElementRect =>
    product.elementLayout?.[key] || DEFAULT_ELEMENT_RECTS[key];
```
Substituir por (usa `molde?.` porque esta função é definida ANTES do `if (!molde || !storeProfile) return (...)`, então o TypeScript não estreita `molde` pra não-nulo aqui):
```ts
  const getElementRect = (product: SelectedProduct, key: 'name' | 'subtitle' | 'price' | 'image'): EncarteElementRect =>
    product.elementLayout?.[key] || molde?.defaultElementLayout?.[key] || DEFAULT_ELEMENT_RECTS[key];
```

- [ ] **Step 2: `contentRect` (posição/tamanho do card em si)**

Local atual:
```ts
          const contentRect: BoxRect = {
            xPct: product?.offsetX ?? 10,
            yPct: product?.offsetY ?? 10,
            widthPct: product?.width ?? 80,
            heightPct: product?.height ?? 80,
          };
```
Substituir por (aqui, dentro do corpo do render após o guard, `molde` já é não-nulo pro TypeScript — sem `?.`, igual ao resto do arquivo, ex.: `molde.productNameColor` na linha 555):
```ts
          const contentRect: BoxRect = {
            xPct: product?.offsetX ?? molde.defaultCardRect?.offsetX ?? 10,
            yPct: product?.offsetY ?? molde.defaultCardRect?.offsetY ?? 10,
            widthPct: product?.width ?? molde.defaultCardRect?.width ?? 80,
            heightPct: product?.height ?? molde.defaultCardRect?.height ?? 80,
          };
```

- [ ] **Step 3: `nameRect`/`subtitleRect`/`priceRect`/`imageRect`**

Local atual:
```ts
          const nameRect = product?.elementLayout?.name || DEFAULT_ELEMENT_RECTS.name;
          const subtitleRect = product?.elementLayout?.subtitle || DEFAULT_ELEMENT_RECTS.subtitle;
          const priceRect = product?.elementLayout?.price || DEFAULT_ELEMENT_RECTS.price;
          const imageRect = product?.elementLayout?.image || DEFAULT_ELEMENT_RECTS.image;
```
Substituir por:
```ts
          const nameRect = product?.elementLayout?.name || molde.defaultElementLayout?.name || DEFAULT_ELEMENT_RECTS.name;
          const subtitleRect = product?.elementLayout?.subtitle || molde.defaultElementLayout?.subtitle || DEFAULT_ELEMENT_RECTS.subtitle;
          const priceRect = product?.elementLayout?.price || molde.defaultElementLayout?.price || DEFAULT_ELEMENT_RECTS.price;
          const imageRect = product?.elementLayout?.image || molde.defaultElementLayout?.image || DEFAULT_ELEMENT_RECTS.image;
```

- [ ] **Step 4: Tamanhos de fonte (nome, descrição, preço)**

Três ocorrências, cada uma trocando `?? DEFAULT_X_FONT_SIZE` por `?? molde.defaultXFontSize ?? DEFAULT_X_FONT_SIZE`:

Nome (~linha 597, já tocada na Task 4 Step 2 — usar o resultado de lá como base):
```ts
fontSize: `${product.nameFontSize ?? molde.defaultNameFontSize ?? DEFAULT_NAME_FONT_SIZE}px`,
```

Descrição (~linha 616):
```tsx
style={{ fontSize: `${product.subtitleFontSize ?? molde.defaultSubtitleFontSize ?? DEFAULT_SUBTITLE_FONT_SIZE}px` }}
```

Preço (~linha 631, dentro do IIFE — variável local `priceFontSize`):
```ts
const priceFontSize = product.priceFontSize ?? molde.defaultPriceFontSize ?? DEFAULT_PRICE_FONT_SIZE;
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Teste manual — molde sem defaults continua igual**

Run: `npm run dev`, abrir um molde já existente (criado antes dessa mudança, sem `defaultCardRect`/`defaultElementLayout`).
Expected: produto novo colocado num slot cai exatamente na posição/tamanho de sempre (10/10/80/80%, fonte 6/4.5/11) — sem regressão.

- [ ] **Step 7: Commit**

```bash
git add src/components/encarte/EncarteWeekly.tsx
git commit -m "feat: usa layout padrao do molde como fallback antes das constantes fixas"
```

---

### Task 6: Botões "Aplicar a todos" e "Definir como padrão do molde"

**Files:**
- Modify: `src/components/encarte/EncarteWeekly.tsx:1-9` (imports)
- Modify: `src/components/encarte/EncarteWeekly.tsx:112-116` (destructuring do `useStore`)
- Modify: `src/components/encarte/EncarteWeekly.tsx` (novos handlers, perto de `removeSlotProduct`)
- Modify: `src/components/encarte/EncarteWeekly.tsx:583` (dentro do `DraggableBox` do card, adicionar a toolbar condicional)

**Interfaces:**
- Consumes: `extractLayoutFields`, `applyLayoutToAll`, `buildMoldeDefaults` (Task 2); `saveEncarteMoldes` (já existe em `useStore`, só precisa ser destructurado aqui).

- [ ] **Step 1: Importar as funções puras e o tipo `EncarteMolde`**

No topo do arquivo, junto do import de `formatPrice` adicionado na Task 4:
```ts
import { extractLayoutFields, applyLayoutToAll, buildMoldeDefaults } from '../../lib/encarteLayoutSync';
```
E adicionar `EncarteMolde` ao import já existente de `../../store` (linha 2, hoje
`import { useStore, Product, SelectedProduct, EncarteSemanal, EncarteElementRect } from '../../store';`)
— necessário pra anotar o tipo de `updatedMolde` no Step 3 abaixo:
```ts
import { useStore, Product, SelectedProduct, EncarteSemanal, EncarteElementRect, EncarteMolde } from '../../store';
```

- [ ] **Step 2: Adicionar `saveEncarteMoldes` ao destructuring do `useStore`**

Local atual (linhas 112-116):
```ts
  const {
    encarteMoldes, fetchEncarteMoldes,
    storeProfiles, fetchStoreProfiles,
    encartesSemanais, fetchEncartesSemanais, saveEncartesSemanais,
  } = useStore();
```
Substituir por:
```ts
  const {
    encarteMoldes, fetchEncarteMoldes, saveEncarteMoldes,
    storeProfiles, fetchStoreProfiles,
    encartesSemanais, fetchEncartesSemanais, saveEncartesSemanais,
  } = useStore();
```

- [ ] **Step 3: Escrever os dois handlers**

Adicionar logo depois da função `removeSlotProduct` existente (por volta da linha 309-313):
```ts
  // Copia o layout (posição/tamanho/fonte) do card `sourceSlotId` pra todos
  // os outros produtos JÁ PREENCHIDOS do mesmo lado (frente OU verso — os
  // dois lados dividem o mesmo mapa `produtos`, então restringe aos slots
  // do lado atual pra não bagunçar o outro lado, que pode ter proporções
  // bem diferentes).
  const handleApplyLayoutToAll = (sourceSlotId: string) => {
    if (!semanal) return;
    const source = semanal.produtos[sourceSlotId];
    if (!source) return;
    const layout = extractLayoutFields(source);
    const sameSideSlotIds = activeSlots.filter((s) => s.tipo === 'produto').map((s) => s.id);
    const produtos = applyLayoutToAll(semanal.produtos, sameSideSlotIds, layout);
    persistSemanal({ ...semanal, produtos });
    toast.success('Layout aplicado aos produtos desse lado!');
  };

  // Grava o layout do card `sourceSlotId` como padrão do MOLDE — produtos
  // novos colocados em qualquer slot desse molde, essa semana em diante,
  // já nascem com esse layout em vez das constantes fixas de fábrica.
  const handleSaveAsMoldeDefault = async (sourceSlotId: string) => {
    if (!semanal || !molde) return;
    const source = semanal.produtos[sourceSlotId];
    if (!source) return;
    const layout = extractLayoutFields(source);
    const defaults = buildMoldeDefaults(layout);
    // Merge campo a campo, não spread direto: se o produto de referência
    // nunca foi arrastado (ex: usuário só quer salvar o tamanho de fonte),
    // `defaults.defaultCardRect` vem undefined — um spread ingênuo
    // (`{...molde, ...defaults}`) APAGARIA um defaultCardRect bom que já
    // existisse no molde. Cada campo só é sobrescrito se o novo valor
    // existir; senão mantém o que já estava salvo.
    const updatedMolde: EncarteMolde = {
      ...molde,
      defaultCardRect: defaults.defaultCardRect ?? molde.defaultCardRect,
      defaultElementLayout: defaults.defaultElementLayout ?? molde.defaultElementLayout,
      defaultNameFontSize: defaults.defaultNameFontSize ?? molde.defaultNameFontSize,
      defaultSubtitleFontSize: defaults.defaultSubtitleFontSize ?? molde.defaultSubtitleFontSize,
      defaultPriceFontSize: defaults.defaultPriceFontSize ?? molde.defaultPriceFontSize,
    };
    const updatedMoldes = encarteMoldes.map((m) => (m.id === molde.id ? updatedMolde : m));
    const ok = await saveEncarteMoldes(updatedMoldes);
    if (ok) toast.success('Padrão do molde atualizado!');
  };
```

- [ ] **Step 4: Ler o trecho do `DraggableBox` do card pra confirmar a numeração**

Confirmar que por volta da linha 583-584 o código ainda é:
```tsx
                >
                  <div className="group relative w-full h-full overflow-visible">
```
(logo depois da abertura do `<DraggableBox ref={cardRef} ... onSelect={() => selectElement(slot.id, 'card')}>`). Se mudou, reajustar o `old_string` do Step 5.

- [ ] **Step 5: Inserir a toolbar condicional logo depois dessa linha**

```tsx
                >
                  <div className="group relative w-full h-full overflow-visible">
                    {isSelected(slot.id, 'card') && (
                      <div
                        className="no-print absolute -top-7 left-0 flex items-center gap-1.5 bg-white rounded shadow border border-zinc-200 px-1.5 py-1 z-10 whitespace-nowrap"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <button onClick={() => handleApplyLayoutToAll(slot.id)} className="text-[9px] font-black text-zinc-600 hover:text-emerald-600">
                          Aplicar a todos
                        </button>
                        <span className="text-zinc-300">|</span>
                        <button onClick={() => handleSaveAsMoldeDefault(slot.id)} className="text-[9px] font-black text-zinc-600 hover:text-emerald-600">
                          Definir padrão do molde
                        </button>
                      </div>
                    )}
```
(o restante do conteúdo do `<div className="group relative...">` — os `DraggableBox` de nome/descrição/preço/foto que já existiam — continua exatamente igual, só ganhou esse bloco novo como primeiro filho.)

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Rodar a suite de teste completa**

Run: `npm test`
Expected: todas as linhas em sucesso (inclui a suite da Task 2).

- [ ] **Step 8: Teste manual completo**

Run: `npm run dev`, abrir Encarte Semanal com um molde de teste (≥3 produtos preenchidos):
1. Selecionar o card de um produto (clicar nele, não nos elementos internos) → confirmar que a toolbar "Aplicar a todos | Definir padrão do molde" aparece.
2. Arrastar a foto desse produto pra uma posição diferente, clicar "Aplicar a todos" → confirmar que os outros produtos preenchidos (do mesmo lado) assumem a mesma posição de foto.
3. Clicar "Definir padrão do molde" → remover um produto do slot (botão de lixeira) e colocar um produto novo nesse slot vazio → confirmar que o produto novo já nasce com a foto na posição customizada, não na posição de fábrica.
4. Exportar PNG (`handleExportPNG`) → abrir o PNG gerado → confirmar visualmente que a toolbar "Aplicar a todos | Definir padrão do molde" NÃO aparece na imagem exportada (é `no-print`, igual aos outros controles do arquivo).

- [ ] **Step 9: Commit**

```bash
git add src/components/encarte/EncarteWeekly.tsx
git commit -m "feat: botoes aplicar layout a todos e definir padrao do molde no encarte"
```

---

### Task 7: Verificação final

**Files:** nenhum (só validação)

- [ ] **Step 1: Typecheck completo**

Run: `npm run lint` (= `tsc --noEmit`)
Expected: sem erros.

- [ ] **Step 2: Suite de testes completa**

Run: `npm test`
Expected: todas as linhas terminam com `PASS`, nenhuma com `FAIL`.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: `✓ built in ...`, sem erros (aviso de chunk grande pré-existente, se aparecer, não é dessa mudança).

- [ ] **Step 4: Regressão — molde antigo sem nenhum campo novo**

Run: `npm run dev`, abrir o molde mais antigo cadastrado (o que tem menos chance de já ter os campos novos).
Expected: abre e se comporta exatamente como antes de toda essa mudança — preço uniforme, sem sombra, layout de fábrica pra produto novo, toolbar "Aplicar a todos" só aparece ao selecionar um card (não muda nada visualmente sozinha).

- [ ] **Step 5: `git log` — confirmar a sequência de commits**

Run: `git log --oneline -8`
Expected: 6 commits novos desta feature (Tasks 1-6), todos no branch local, nenhum push feito.

- [ ] **Step 6: Resumo pro usuário**

Sem comando — só documentar (no chat, quando ele acordar) o que foi feito, o que ficou de fora (Leve/Pague), e que está tudo local, sem deploy, aguardando revisão.
