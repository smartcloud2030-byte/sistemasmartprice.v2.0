import React, { useEffect, useRef, useState } from 'react';
import { useStore, EncarteMolde, EncarteSlotDef, EncarteGridConfig, EncarteFontFamily } from '../../store';
import { uploadBackgroundImage } from '../../lib/gallery';
import { distributeSlots } from '../../lib/encarteGrid';
import { getProxyUrl } from '../../lib/utils';
import DraggableBox, { BoxRect } from './DraggableBox';
import { Upload, Grid3x3, PenLine, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import TemaPicker from './TemaPicker';
import { EncarteTema } from '../../lib/encarteTemas';

const DEFAULT_AREA: BoxRect = { xPct: 5, yPct: 18, widthPct: 90, heightPct: 68 };
const DEFAULT_GRID: EncarteGridConfig = { cols: 3, rows: 5, area: DEFAULT_AREA, manual: false };
const DEFAULT_PRICE_BOX_COLOR = '#dc2626';
const DEFAULT_PRODUCT_NAME_COLOR = '#dc2626';

const emptyMolde = (): EncarteMolde => ({
  id: Math.random().toString(36).slice(2, 10),
  nome: '',
  frontBgUrl: '',
  frontSlots: [],
  frontGrid: DEFAULT_GRID,
  priceBoxColor: DEFAULT_PRICE_BOX_COLOR,
  productNameColor: DEFAULT_PRODUCT_NAME_COLOR,
});

const SLOT_COLORS: Record<EncarteSlotDef['tipo'], string> = {
  produto: '#10b981',
  data: '#f59e0b',
  logo: '#3b82f6',
  contato: '#a855f7',
};

export default function MoldeEditor({ molde, onClose }: { molde: EncarteMolde | null; onClose: () => void }) {
  const { encarteMoldes, saveEncarteMoldes } = useStore();
  const [draft, setDraft] = useState<EncarteMolde>(molde ? { ...molde } : emptyMolde());
  const [side, setSide] = useState<'frente' | 'verso'>('frente');
  // Grade de frente/verso é rastreada separadamente — reabrir um molde salvo
  // hidrata cols/rows/area/manual exatamente como foram salvos, pra que o
  // useEffect abaixo reproduza os MESMOS ids de slot (distributeSlots é
  // determinístico por row/col) em vez de gerar um layout novo por cima do
  // que já existe e órfãos os produtos já preenchidos em EncarteSemanal.
  const [frontGrid, setFrontGrid] = useState<EncarteGridConfig>(molde?.frontGrid || DEFAULT_GRID);
  const [backGrid, setBackGrid] = useState<EncarteGridConfig>(molde?.backGrid || DEFAULT_GRID);
  const [isUploading, setIsUploading] = useState(false);
  const [showTemaPicker, setShowTemaPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const grid = side === 'frente' ? frontGrid : backGrid;
  const setGrid = side === 'frente' ? setFrontGrid : setBackGrid;

  const bgUrl = side === 'frente' ? draft.frontBgUrl : draft.backBgUrl;
  const slots = side === 'frente' ? draft.frontSlots : (draft.backSlots || []);
  const productSlots = slots.filter((s) => s.tipo === 'produto');
  const specialSlots = slots.filter((s) => s.tipo !== 'produto');

  const setBgUrl = (url: string) => {
    setDraft((d) => (side === 'frente' ? { ...d, frontBgUrl: url } : { ...d, backBgUrl: url }));
  };

  const setSlots = (updater: (current: EncarteSlotDef[]) => EncarteSlotDef[]) => {
    setDraft((d) => {
      if (side === 'frente') return { ...d, frontSlots: updater(d.frontSlots) };
      return { ...d, backSlots: updater(d.backSlots || []) };
    });
  };

  // Grade automática: recalcula os slots de produto sempre que cols/rows/area
  // mudam, a menos que o usuário tenha ativado o modo manual pra esse lado.
  // Não roda sem uma arte de fundo enviada (evita popular backSlots à toa só
  // por clicar na aba Verso sem nunca enviar imagem).
  useEffect(() => {
    if (grid.manual || !bgUrl) return;
    setSlots((current) => {
      const special = current.filter((s) => s.tipo !== 'produto');
      return [...distributeSlots(grid.cols, grid.rows, grid.area, side), ...special];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid.cols, grid.rows, grid.area, grid.manual, side, bgUrl]);

  const handleBgUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { url } = await uploadBackgroundImage(file, 'encarte-moldes');
      setBgUrl(url);
    } catch {
      toast.error('Falha ao enviar a arte de fundo.');
    } finally {
      setIsUploading(false);
    }
  };

  const updateSlot = (id: string, rect: BoxRect) => {
    setSlots((current) => current.map((s) => (s.id === id ? { ...s, ...rect } : s)));
  };

  const addSpecialSlot = (tipo: 'data' | 'logo' | 'contato') => {
    const newSlot: EncarteSlotDef = {
      id: `${tipo}-${Date.now()}`,
      tipo,
      xPct: 10, yPct: 5, widthPct: 25, heightPct: 8,
    };
    setSlots((current) => [...current, newSlot]);
  };

  const removeSlot = (id: string) => {
    setSlots((current) => current.filter((s) => s.id !== id));
  };

  const handleTemaApply = ({ url, tema, incluirLogo }: { url: string; tema: EncarteTema; incluirLogo: boolean }) => {
    setBgUrl(url);
    const alreadyStyled = !!(draft.fontFamily || draft.priceBoxColor || draft.productNameColor);
    if (!alreadyStyled) {
      setDraft((d) => ({ ...d, fontFamily: tema.fontFamily, priceBoxColor: tema.priceBoxColor, productNameColor: tema.productNameColor }));
    }
    if (incluirLogo && !specialSlots.some((s) => s.tipo === 'logo')) {
      addSpecialSlot('logo');
    }
    setShowTemaPicker(false);
  };

  const handleSave = async () => {
    if (!draft.nome.trim()) {
      toast.error('Dê um nome ao molde.');
      return;
    }
    if (!draft.frontBgUrl) {
      toast.error('Envie a arte de fundo da frente antes de salvar.');
      return;
    }
    const finalDraft: EncarteMolde = {
      ...draft,
      frontGrid,
      backGrid: draft.backBgUrl ? backGrid : undefined,
      backSlots: draft.backBgUrl ? draft.backSlots : undefined,
    };
    const exists = encarteMoldes.some((m) => m.id === finalDraft.id);
    const updated = exists
      ? encarteMoldes.map((m) => (m.id === finalDraft.id ? finalDraft : m))
      : [...encarteMoldes, finalDraft];
    // saveEncarteMoldes já mostra o toast de erro sozinho quando falha —
    // só fecha e comemora se o servidor realmente confirmou o save.
    const ok = await saveEncarteMoldes(updated);
    if (!ok) return;
    toast.success('Molde salvo!');
    onClose();
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <input
          type="text"
          placeholder="Nome do molde (ex: Fecha Mês)"
          value={draft.nome}
          onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
          className="text-lg font-black uppercase tracking-tight bg-transparent outline-none border-b-2 border-transparent focus:border-emerald-500"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-black uppercase">
            Cancelar
          </button>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase">
            <Save className="w-4 h-4" /> Salvar molde
          </button>
        </div>
      </div>

      <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl w-fit">
        <button
          onClick={() => setSide('frente')}
          className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${side === 'frente' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
        >
          Frente
        </button>
        <button
          onClick={() => setSide('verso')}
          className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${side === 'verso' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
        >
          Verso {draft.backBgUrl ? '' : '(opcional)'}
        </button>
      </div>

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
        <>
          <div className="flex flex-wrap items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl">
            <div className="flex items-center gap-2">
              <Grid3x3 className="w-4 h-4 text-zinc-400" />
              <label className="text-[10px] font-black uppercase text-zinc-500">Colunas</label>
              <input type="number" min={1} max={6} value={grid.cols} onChange={(e) => setGrid((g) => ({ ...g, cols: Number(e.target.value) || 1 }))}
                className="w-14 px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg text-sm text-center outline-none" disabled={grid.manual} />
              <label className="text-[10px] font-black uppercase text-zinc-500">Linhas</label>
              <input type="number" min={1} max={10} value={grid.rows} onChange={(e) => setGrid((g) => ({ ...g, rows: Number(e.target.value) || 1 }))}
                className="w-14 px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg text-sm text-center outline-none" disabled={grid.manual} />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black uppercase text-zinc-500">Fonte</label>
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
            </div>

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

            <button
              onClick={() => setGrid((g) => ({ ...g, manual: !g.manual }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                grid.manual ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              <PenLine className="w-3.5 h-3.5" /> Desenhar manualmente
            </button>

            <div className="flex gap-2 ml-auto">
              <button onClick={() => addSpecialSlot('data')} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white" style={{ backgroundColor: SLOT_COLORS.data }}>
                + Data
              </button>
              <button onClick={() => addSpecialSlot('logo')} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white" style={{ backgroundColor: SLOT_COLORS.logo }}>
                + Logo
              </button>
              <button onClick={() => addSpecialSlot('contato')} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white" style={{ backgroundColor: SLOT_COLORS.contato }}>
                + Contato
              </button>
            </div>
          </div>

          <div ref={containerRef} className="relative w-full mx-auto bg-white shadow-lg" style={{ maxWidth: 600 }}>
            <img src={getProxyUrl(bgUrl)} className="w-full h-auto block select-none pointer-events-none" draggable={false} />

            {!grid.manual && (
              <DraggableBox rect={grid.area} containerRef={containerRef} onChange={(rect) => setGrid((g) => ({ ...g, area: rect }))} label="Área dos produtos" color={SLOT_COLORS.produto} />
            )}

            {grid.manual && productSlots.map((slot, idx) => (
              <DraggableBox
                key={slot.id}
                rect={slot}
                containerRef={containerRef}
                onChange={(rect) => updateSlot(slot.id, rect)}
                label={`${idx + 1}`}
                color={SLOT_COLORS.produto}
              />
            ))}

            {specialSlots.map((slot) => (
              <DraggableBox
                key={slot.id}
                rect={slot}
                containerRef={containerRef}
                onChange={(rect) => updateSlot(slot.id, rect)}
                onRemove={() => removeSlot(slot.id)}
                label={slot.tipo}
                color={SLOT_COLORS[slot.tipo]}
              />
            ))}
          </div>

          <p className="text-[10px] text-zinc-400 text-center">
            {productSlots.length} posições de produto {grid.manual ? '(ajuste arrastando cada uma)' : `(grade automática ${grid.cols}×${grid.rows})`}
          </p>
        </>
      )}

      {showTemaPicker && <TemaPicker area={grid.area} onApply={handleTemaApply} onCancel={() => setShowTemaPicker(false)} />}
    </div>
  );
}
