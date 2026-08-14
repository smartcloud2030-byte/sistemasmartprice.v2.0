# Editor de Temas embutido para Moldes (Encarte Online) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao `MoldeEditor` um gerador de tema embutido (10 pacotes prontos de fundo+cores+fonte+ícone) pra criar a arte de fundo de um Molde sem depender de ferramenta externa (encartefácil) nem do script Python manual.

**Architecture:** Novo módulo de dados puro (`src/lib/encarteTemas.ts`) com os 10 temas. Novo componente `TemaPicker.tsx` que renderiza a galeria + customização (título/subtítulo/logo) + preview, e na confirmação captura esse preview via `html2canvas-pro` (mesma técnica já usada em `EncarteWeekly.tsx`), sobe o PNG resultante via `uploadBackgroundImage` (já existente em `src/lib/gallery.ts`) e devolve a URL pro `MoldeEditor`, que passa a tratá-la exatamente como um upload manual — nenhuma outra parte do sistema precisa saber que a arte veio de um tema.

**Tech Stack:** React + TypeScript, `html2canvas-pro` (já é dependência), `lucide-react` (ícones, já é dependência), testes com `node:assert` via `tsx` (mesmo padrão dos outros `.test.ts` do projeto).

## Global Constraints

- Não integra com o encartefácil nem com nenhuma ferramenta externa — o gerador é 100% nativo.
- 10 temas prontos, cada um com fundo, cores de título/subtítulo/preço/nome e fonte já combinando — sem picker de cor livre nesta v1.
- Tema cobre a folha inteira (fundo forte nas bordas), com um painel claro (`painelClaroColor`) desenhado exatamente na área de `grid.area`/`DEFAULT_AREA` do molde, garantindo legibilidade dos produtos.
- A logo **não** é gravada na imagem do tema — aplicar um tema apenas adiciona o slot dinâmico `tipo: 'logo'` (via `addSpecialSlot('logo')`, já existente), que continua sendo preenchido por loja em `EncarteWeekly.tsx:581-583`.
- `priceBoxColor` de cada tema precisa suportar texto branco (o texto dentro da caixa de preço é `text-white` fixo em `EncarteWeekly.tsx`, não configurável).
- `productNameColor` de cada tema precisa ler bem sobre `painelClaroColor` (branco/creme) — nunca branco.
- Aplica-se independentemente à frente e ao verso do molde (cada lado escolhe seu próprio tema).
- Dimensões do molde: `MOLDE_WIDTH_PX = 2480`, `MOLDE_HEIGHT_PX = 3508` (A4 vertical, 300dpi — mesmo padrão já usado nos moldes existentes).

---

### Task 1: Estender `EncarteFontFamily` e as opções de fonte no `MoldeEditor`

**Files:**
- Modify: `src/store.ts:230`
- Modify: `src/components/encarte/MoldeEditor.tsx:192-200`

**Interfaces:**
- Produces: `EncarteFontFamily` passa a aceitar `'Montserrat' | 'Poppins' | 'Anton' | 'Playfair Display'` além dos 3 valores já existentes. Consumido pela Task 2 (temas usam essas fontes) e pelo `<select>` de fonte do `MoldeEditor`.

Todas as fontes novas (Montserrat, Poppins, Anton, Playfair Display) já
estão carregadas globalmente via Google Fonts em `src/index.css:1` — não
precisa adicionar nenhum `@import` novo.

- [ ] **Step 1: Estender o union type em `store.ts`**

Em `src/store.ts:230`, trocar:

```ts
export type EncarteFontFamily = 'Inter' | 'Roboto' | 'Oswald';
```

por:

```ts
export type EncarteFontFamily = 'Inter' | 'Roboto' | 'Oswald' | 'Montserrat' | 'Poppins' | 'Anton' | 'Playfair Display';
```

- [ ] **Step 2: Adicionar as novas opções no `<select>` de fonte**

Em `src/components/encarte/MoldeEditor.tsx:192-200`, trocar:

```tsx
              <select
                value={draft.fontFamily || 'Inter'}
                onChange={(e) => setDraft((d) => ({ ...d, fontFamily: e.target.value as EncarteFontFamily }))}
                className="px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg text-sm outline-none"
              >
                <option value="Inter">Inter</option>
                <option value="Roboto">Roboto</option>
                <option value="Oswald">Oswald</option>
              </select>
```

por:

```tsx
              <select
                value={draft.fontFamily || 'Inter'}
                onChange={(e) => setDraft((d) => ({ ...d, fontFamily: e.target.value as EncarteFontFamily }))}
                className="px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg text-sm outline-none"
              >
                <option value="Inter">Inter</option>
                <option value="Roboto">Roboto</option>
                <option value="Oswald">Oswald</option>
                <option value="Montserrat">Montserrat</option>
                <option value="Poppins">Poppins</option>
                <option value="Anton">Anton</option>
                <option value="Playfair Display">Playfair Display</option>
              </select>
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Verificação manual**

```bash
npm run dev
```

Abrir Encarte Online > Moldes > Novo molde, confirmar que o dropdown de
fonte agora lista Inter, Roboto, Oswald, Montserrat, Poppins, Anton e
Playfair Display.

- [ ] **Step 5: Commit**

```bash
git add src/store.ts src/components/encarte/MoldeEditor.tsx
git commit -m "feat: estende EncarteFontFamily com Montserrat, Poppins, Anton e Playfair Display"
```

---

### Task 2: Módulo de dados `src/lib/encarteTemas.ts`

**Files:**
- Create: `src/lib/encarteTemas.ts`
- Test: `src/lib/encarteTemas.test.ts`
- Modify: `package.json` (adicionar o novo test ao script `test`)

**Interfaces:**
- Consumes: `EncarteFontFamily` de `../store` (Task 1).
- Produces: `interface EncarteTema`, `const ENCARTE_TEMAS: EncarteTema[]` (10 itens), `function getTemaById(id: string): EncarteTema | undefined`, `const MOLDE_WIDTH_PX = 2480`, `const MOLDE_HEIGHT_PX = 3508`. Consumido pela Task 3 (`TemaPicker.tsx`).

- [ ] **Step 1: Escrever o teste (vai falhar — o módulo ainda não existe)**

Criar `src/lib/encarteTemas.test.ts`:

```ts
import assert from 'node:assert';
import { ENCARTE_TEMAS, getTemaById, MOLDE_WIDTH_PX, MOLDE_HEIGHT_PX } from './encarteTemas';

const HEX_RE = /^#[0-9a-f]{6}$/i;

function existemDezTemas() {
  assert.strictEqual(ENCARTE_TEMAS.length, 10);
}

function idsSaoUnicos() {
  const ids = ENCARTE_TEMAS.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length);
}

function todosOsCamposObrigatoriosEstaoPreenchidos() {
  for (const tema of ENCARTE_TEMAS) {
    assert.ok(tema.nome.trim().length > 0, `tema ${tema.id} sem nome`);
    assert.ok(tema.background.cores.length >= 2, `tema ${tema.id} precisa de pelo menos 2 cores no gradiente`);
    for (const cor of tema.background.cores) assert.match(cor, HEX_RE, `tema ${tema.id} com cor de fundo invalida: ${cor}`);
    assert.match(tema.painelClaroColor, HEX_RE, `tema ${tema.id} com painelClaroColor invalido`);
    assert.match(tema.tituloColor, HEX_RE, `tema ${tema.id} com tituloColor invalido`);
    assert.match(tema.subtituloColor, HEX_RE, `tema ${tema.id} com subtituloColor invalido`);
    assert.match(tema.priceBoxColor, HEX_RE, `tema ${tema.id} com priceBoxColor invalido`);
    assert.match(tema.productNameColor, HEX_RE, `tema ${tema.id} com productNameColor invalido`);
    assert.ok(tema.icone.trim().length > 0, `tema ${tema.id} sem icone`);
  }
}

function getTemaByIdEncontraTemaExistente() {
  const tema = getTemaById('inverno');
  assert.ok(tema);
  assert.strictEqual(tema?.nome, 'Inverno');
}

function getTemaByIdRetornaUndefinedParaIdInexistente() {
  assert.strictEqual(getTemaById('nao-existe'), undefined);
}

function dimensoesDoMoldeEstaoCorretas() {
  assert.strictEqual(MOLDE_WIDTH_PX, 2480);
  assert.strictEqual(MOLDE_HEIGHT_PX, 3508);
}

try {
  existemDezTemas();
  idsSaoUnicos();
  todosOsCamposObrigatoriosEstaoPreenchidos();
  getTemaByIdEncontraTemaExistente();
  getTemaByIdRetornaUndefinedParaIdInexistente();
  dimensoesDoMoldeEstaoCorretas();
  console.log('PASS: todos os testes de encarteTemas passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/encarteTemas.test.ts`
Expected: erro do tipo `Cannot find module './encarteTemas'`

- [ ] **Step 3: Implementar o módulo**

Criar `src/lib/encarteTemas.ts`:

```ts
import type { EncarteFontFamily } from '../store';

export const MOLDE_WIDTH_PX = 2480;
export const MOLDE_HEIGHT_PX = 3508;

export interface EncarteTema {
  id: string;
  nome: string;
  background: { cores: string[]; anguloDeg: number };
  // Sombra no titulo/subtitulo — só os temas com fundo mais claro
  // (Primavera, Dia das Mães) precisam, pra manter contraste do texto
  // branco.
  tituloComSombra: boolean;
  painelClaroColor: string;
  tituloColor: string;
  subtituloColor: string;
  priceBoxColor: string;
  productNameColor: string;
  fontFamily: EncarteFontFamily;
  icone: string;
  iconePosicao: { xPct: number; yPct: number; sizePct: number; opacity: number };
}

const ICONE_PADRAO = { xPct: 62, yPct: 2, sizePct: 30, opacity: 0.25 };

export const ENCARTE_TEMAS: EncarteTema[] = [
  {
    id: 'fecha-mes',
    nome: 'Fecha o Mês',
    background: { cores: ['#7f1d1d', '#dc2626'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#fef08a',
    priceBoxColor: '#f59e0b',
    productNameColor: '#7f1d1d',
    fontFamily: 'Anton',
    icone: 'TrendingDown',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'verao',
    nome: 'Verão',
    background: { cores: ['#0ea5e9', '#fbbf24'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#ffffff',
    priceBoxColor: '#f97316',
    productNameColor: '#0369a1',
    fontFamily: 'Poppins',
    icone: 'Sun',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'outono',
    nome: 'Outono',
    background: { cores: ['#b45309', '#78350f'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#fef9ec',
    tituloColor: '#fef3c7',
    subtituloColor: '#fed7aa',
    priceBoxColor: '#c2410c',
    productNameColor: '#78350f',
    fontFamily: 'Playfair Display',
    icone: 'Leaf',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'inverno',
    nome: 'Inverno',
    background: { cores: ['#1e3a8a', '#60a5fa'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#dbeafe',
    priceBoxColor: '#0369a1',
    productNameColor: '#1e3a8a',
    fontFamily: 'Montserrat',
    icone: 'Snowflake',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'primavera',
    nome: 'Primavera',
    background: { cores: ['#f472b6', '#4ade80'], anguloDeg: 135 },
    tituloComSombra: true,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#ffffff',
    priceBoxColor: '#16a34a',
    productNameColor: '#be185d',
    fontFamily: 'Poppins',
    icone: 'Flower2',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'festa-junina',
    nome: 'Festa Junina',
    background: { cores: ['#b91c1c', '#92400e'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#fef9ec',
    tituloColor: '#fef3c7',
    subtituloColor: '#ffffff',
    priceBoxColor: '#991b1b',
    productNameColor: '#92400e',
    fontFamily: 'Oswald',
    icone: 'Flame',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'dia-das-maes',
    nome: 'Dia das Mães',
    background: { cores: ['#fb7185', '#f472b6'], anguloDeg: 135 },
    tituloComSombra: true,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#ffffff',
    priceBoxColor: '#db2777',
    productNameColor: '#9d174d',
    fontFamily: 'Playfair Display',
    icone: 'Heart',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'dia-dos-namorados',
    nome: 'Dia dos Namorados',
    background: { cores: ['#dc2626', '#db2777'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#fecdd3',
    priceBoxColor: '#991b1b',
    productNameColor: '#9f1239',
    fontFamily: 'Playfair Display',
    icone: 'Heart',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'black-friday',
    nome: 'Black Friday',
    background: { cores: ['#111827', '#000000'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#facc15',
    subtituloColor: '#ffffff',
    priceBoxColor: '#dc2626',
    productNameColor: '#111827',
    fontFamily: 'Anton',
    icone: 'Tag',
    iconePosicao: ICONE_PADRAO,
  },
  {
    id: 'natal',
    nome: 'Natal',
    background: { cores: ['#166534', '#7f1d1d'], anguloDeg: 135 },
    tituloComSombra: false,
    painelClaroColor: '#ffffff',
    tituloColor: '#ffffff',
    subtituloColor: '#fde68a',
    priceBoxColor: '#b91c1c',
    productNameColor: '#166534',
    fontFamily: 'Playfair Display',
    icone: 'Gift',
    iconePosicao: ICONE_PADRAO,
  },
];

export function getTemaById(id: string): EncarteTema | undefined {
  return ENCARTE_TEMAS.find((t) => t.id === id);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/encarteTemas.test.ts`
Expected: `PASS: todos os testes de encarteTemas passaram`

- [ ] **Step 5: Adicionar ao script `test` do `package.json`**

No final da cadeia existente em `package.json` (script `test`), adicionar
` && tsx src/lib/encarteTemas.test.ts`.

- [ ] **Step 6: Rodar o script completo de testes**

Run: `npm test`
Expected: todos os testes existentes continuam passando, incluindo a nova
linha `PASS: todos os testes de encarteTemas passaram`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/encarteTemas.ts src/lib/encarteTemas.test.ts package.json
git commit -m "feat: adiciona os 10 temas prontos pro gerador de arte do Molde"
```

---

### Task 3: Componente `TemaPicker.tsx`

**Files:**
- Create: `src/components/encarte/TemaPicker.tsx`
- Modify: `src/components/encarte/MoldeEditor.tsx:10` (exportar `DEFAULT_AREA`)

**Interfaces:**
- Consumes: `ENCARTE_TEMAS`, `EncarteTema`, `getTemaById` — não usado diretamente, mas `MOLDE_WIDTH_PX`/`MOLDE_HEIGHT_PX` de `../../lib/encarteTemas` (Task 2); `DEFAULT_AREA` de `./MoldeEditor` (exportado nesta task); `uploadBackgroundImage` de `../../lib/gallery` (já existe).
- Produces: `export default function TemaPicker({ onApply, onCancel }: { onApply: (result: { url: string; tema: EncarteTema; incluirLogo: boolean }) => void; onCancel: () => void }): JSX.Element`. Consumido pela Task 4.

Não há suíte de testes de componente React neste projeto (sem
`@testing-library` nas dependências — só testes de lógica pura via
`node:assert`/`tsx`). A verificação desta task é manual, via `npm run
dev`, mesmo padrão de confiança já usado pros outros componentes visuais
do Encarte (`CosmosUsageStatus.tsx`, `EncarteWeekly.tsx` etc.).

- [ ] **Step 1: Exportar `DEFAULT_AREA` do `MoldeEditor.tsx`**

Em `src/components/encarte/MoldeEditor.tsx:10`, trocar:

```ts
const DEFAULT_AREA: BoxRect = { xPct: 5, yPct: 18, widthPct: 90, heightPct: 68 };
```

por:

```ts
export const DEFAULT_AREA: BoxRect = { xPct: 5, yPct: 18, widthPct: 90, heightPct: 68 };
```

- [ ] **Step 2: Criar `TemaPicker.tsx`**

Criar `src/components/encarte/TemaPicker.tsx`:

```tsx
import React, { useRef, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { X } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { toast } from 'sonner';
import { ENCARTE_TEMAS, EncarteTema, MOLDE_WIDTH_PX, MOLDE_HEIGHT_PX } from '../../lib/encarteTemas';
import { DEFAULT_AREA } from './MoldeEditor';
import { uploadBackgroundImage } from '../../lib/gallery';

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (MOLDE_HEIGHT_PX / MOLDE_WIDTH_PX));

interface TemaPickerProps {
  onApply: (result: { url: string; tema: EncarteTema; incluirLogo: boolean }) => void;
  onCancel: () => void;
}

export default function TemaPicker({ onApply, onCancel }: TemaPickerProps) {
  const [selected, setSelected] = useState<EncarteTema | null>(null);
  const [titulo, setTitulo] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [incluirLogo, setIncluirLogo] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleSelectTema = (tema: EncarteTema) => {
    setSelected(tema);
    setTitulo(tema.nome);
    setSubtitulo('');
  };

  const handleApply = async () => {
    if (!selected || !previewRef.current) return;
    setIsGenerating(true);
    try {
      const scale = MOLDE_WIDTH_PX / PREVIEW_WIDTH;
      const canvas = await html2canvas(previewRef.current, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png');
      });
      const file = new File([blob], `tema-${selected.id}.png`, { type: 'image/png' });
      const { url } = await uploadBackgroundImage(file, 'encarte-moldes');
      onApply({ url, tema: selected, incluirLogo });
    } catch {
      toast.error('Falha ao gerar a arte do tema.');
    } finally {
      setIsGenerating(false);
    }
  };

  const IconComp = selected ? (LucideIcons as Record<string, React.ElementType>)[selected.icone] : undefined;
  const tituloShadow = selected?.tituloComSombra ? '0 2px 8px rgba(0,0,0,.4)' : undefined;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest">Criar com tema</h3>
          <button onClick={onCancel} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!selected ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {ENCARTE_TEMAS.map((tema) => (
              <button
                key={tema.id}
                onClick={() => handleSelectTema(tema)}
                className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 relative group"
                style={{
                  aspectRatio: `${MOLDE_WIDTH_PX} / ${MOLDE_HEIGHT_PX}`,
                  background: `linear-gradient(${tema.background.anguloDeg}deg, ${tema.background.cores.join(', ')})`,
                }}
              >
                <span className="absolute inset-x-0 bottom-0 p-2 text-[10px] font-black uppercase text-white bg-black/40 group-hover:bg-black/60 transition-colors">
                  {tema.nome}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            <div className="space-y-3 flex-shrink-0" style={{ width: PREVIEW_WIDTH }}>
              <div
                ref={previewRef}
                className="relative overflow-hidden"
                style={{
                  width: PREVIEW_WIDTH,
                  height: PREVIEW_HEIGHT,
                  background: `linear-gradient(${selected.background.anguloDeg}deg, ${selected.background.cores.join(', ')})`,
                }}
              >
                {IconComp && (
                  <IconComp
                    className="absolute"
                    style={{
                      left: `${selected.iconePosicao.xPct}%`,
                      top: `${selected.iconePosicao.yPct}%`,
                      width: `${selected.iconePosicao.sizePct}%`,
                      height: `${selected.iconePosicao.sizePct}%`,
                      opacity: selected.iconePosicao.opacity,
                      color: selected.tituloColor,
                    }}
                  />
                )}

                <div
                  className="absolute text-center px-2"
                  style={{ left: '5%', top: '6%', width: '90%', color: selected.tituloColor, fontFamily: selected.fontFamily }}
                >
                  <p className="font-black uppercase leading-tight" style={{ fontSize: PREVIEW_WIDTH * 0.11, textShadow: tituloShadow }}>
                    {titulo}
                  </p>
                  {subtitulo && (
                    <p className="font-semibold mt-1" style={{ fontSize: PREVIEW_WIDTH * 0.045, color: selected.subtituloColor, textShadow: tituloShadow }}>
                      {subtitulo}
                    </p>
                  )}
                </div>

                <div
                  className="absolute rounded-lg shadow-sm"
                  style={{
                    left: `${DEFAULT_AREA.xPct}%`,
                    top: `${DEFAULT_AREA.yPct}%`,
                    width: `${DEFAULT_AREA.widthPct}%`,
                    height: `${DEFAULT_AREA.heightPct}%`,
                    backgroundColor: selected.painelClaroColor,
                  }}
                />
              </div>
              <button onClick={() => setSelected(null)} className="text-[10px] font-black uppercase text-zinc-400 hover:text-zinc-600">
                ← Escolher outro tema
              </button>
            </div>

            <div className="flex-grow space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">Título</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">Subtítulo (opcional)</label>
                <input
                  type="text"
                  value={subtitulo}
                  onChange={(e) => setSubtitulo(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                <input type="checkbox" checked={incluirLogo} onChange={(e) => setIncluirLogo(e.target.checked)} />
                Incluir slot de logo
              </label>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-black uppercase">
                  Cancelar
                </button>
                <button
                  onClick={handleApply}
                  disabled={isGenerating || !titulo.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase disabled:opacity-50"
                >
                  {isGenerating ? 'Gerando...' : 'Usar este tema'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/components/encarte/TemaPicker.tsx src/components/encarte/MoldeEditor.tsx
git commit -m "feat: adiciona componente TemaPicker (galeria + customizacao + geracao da imagem)"
```

(A verificação manual completa acontece na Task 4, depois que o
`TemaPicker` estiver integrado no `MoldeEditor` e for possível abri-lo de
verdade pela interface.)

---

### Task 4: Integração no `MoldeEditor.tsx` e verificação end-to-end

**Files:**
- Modify: `src/components/encarte/MoldeEditor.tsx`

**Interfaces:**
- Consumes: `TemaPicker` (Task 3), `EncarteTema` de `../../lib/encarteTemas` (Task 2).

- [ ] **Step 1: Importar `TemaPicker`, `EncarteTema` e o ícone `Sparkles`**

Em `src/components/encarte/MoldeEditor.tsx`, trocar a linha de import dos
ícones:

```ts
import { Upload, Grid3x3, PenLine, Save } from 'lucide-react';
```

por:

```ts
import { Upload, Grid3x3, PenLine, Save, Sparkles } from 'lucide-react';
```

E logo abaixo do import de `toast` (topo do arquivo), adicionar:

```ts
import TemaPicker from './TemaPicker';
import { EncarteTema } from '../../lib/encarteTemas';
```

- [ ] **Step 2: Adicionar estado do modal**

Logo após `const [isUploading, setIsUploading] = useState(false);`,
adicionar:

```ts
  const [showTemaPicker, setShowTemaPicker] = useState(false);
```

- [ ] **Step 3: Adicionar o handler `handleTemaApply`**

Logo depois da função `addSpecialSlot` (antes de `removeSlot`), adicionar:

```ts
  const handleTemaApply = ({ url, tema, incluirLogo }: { url: string; tema: EncarteTema; incluirLogo: boolean }) => {
    setBgUrl(url);
    setDraft((d) => ({ ...d, fontFamily: tema.fontFamily, priceBoxColor: tema.priceBoxColor, productNameColor: tema.productNameColor }));
    if (incluirLogo && !specialSlots.some((s) => s.tipo === 'logo')) {
      addSpecialSlot('logo');
    }
    setShowTemaPicker(false);
  };
```

- [ ] **Step 4: Trocar a dropzone única por duas opções lado a lado**

Trocar:

```tsx
      {!bgUrl ? (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl py-16 cursor-pointer hover:border-emerald-500/50 transition-colors">
          <Upload className="w-8 h-8 text-zinc-400" />
          <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
            {isUploading ? 'Enviando...' : `Enviar arte de fundo (${side})`}
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleBgUpload(e.target.files[0])} />
        </label>
      ) : (
```

por:

```tsx
      {!bgUrl ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl py-16 cursor-pointer hover:border-emerald-500/50 transition-colors">
            <Upload className="w-8 h-8 text-zinc-400" />
            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
              {isUploading ? 'Enviando...' : `Enviar arte de fundo (${side})`}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleBgUpload(e.target.files[0])} />
          </label>
          <button
            type="button"
            onClick={() => setShowTemaPicker(true)}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl py-16 hover:border-emerald-500/50 transition-colors"
          >
            <Sparkles className="w-8 h-8 text-zinc-400" />
            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Criar com tema ({side})</span>
          </button>
        </div>
      ) : (
```

- [ ] **Step 5: Renderizar o `TemaPicker` quando `showTemaPicker` estiver ligado**

No fim do JSX retornado pelo componente, logo antes do `</div>` final que
fecha o `<div className="p-6 space-y-6 max-w-5xl mx-auto">` (a última
linha antes do `);` de fechamento do componente), adicionar:

```tsx
      {showTemaPicker && <TemaPicker onApply={handleTemaApply} onCancel={() => setShowTemaPicker(false)} />}
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 7: Verificação manual end-to-end**

```bash
npm run dev
```

No navegador, logado como admin:

1. Abrir Encarte Online > Moldes > Novo molde.
2. Confirmar que aparecem as duas opções: "Enviar arte de fundo" e
   "Criar com tema".
3. Clicar em "Criar com tema", escolher qualquer tema (ex: Inverno),
   confirmar que o preview mostra fundo em gradiente + ícone + painel
   claro na área central + título (já preenchido com o nome do tema,
   editável) atualizando ao digitar.
4. Editar título/subtítulo, deixar "Incluir slot de logo" marcado,
   clicar "Usar este tema".
5. Confirmar que o modal fecha, a arte de fundo aparece no editor
   (imagem gerada, não mais a dropzone), a grade de produtos já aparece
   distribuída sobre a área clara, a cor da caixa de preço e a cor do
   nome do produto já vieram preenchidas com as do tema, e existe um
   slot roxo de "logo" no canto (adicionado automaticamente).
6. Trocar pra aba "Verso", repetir com um tema diferente, confirmar que
   funciona independente da frente.
7. Dar nome ao molde e salvar — confirmar que salva sem erro e aparece
   na lista de moldes com a arte gerada como thumbnail.
8. Abrir Encarte Online > Montar encarte, escolher esse molde + uma
   loja, confirmar que a logo da loja aparece no slot (prova que o slot
   dinâmico funciona, não uma logo fixa gravada na imagem).

- [ ] **Step 8: Commit**

```bash
git add src/components/encarte/MoldeEditor.tsx
git commit -m "feat: integra o TemaPicker no MoldeEditor, com slot de logo automatico"
```
