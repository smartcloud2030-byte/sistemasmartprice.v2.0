import React, { useEffect, useRef, useState } from 'react';
import { useStore, createDefaultLayout, Layout } from '../store';
import { X, Save, Crosshair, Upload, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { uploadBackgroundImage } from '../lib/gallery';

// Tela experimental: folha A4 em branco (ou com um guia semi-transparente,
// enviado só para alinhar) com réguas e caixas arrastáveis para montar um
// estilo do zero (em vez de espelhar um modelo já pronto). O resultado é
// salvo em `testLayouts` ("Meus Estilos"), separado dos modelos oficiais em
// `layouts`, para o admin poder excluir/editar sem afetar nada existente.

const PAGE_WIDTH = 794; // 210mm @ 96dpi, mesma referência do CanvasPreview
const PAGE_HEIGHT = 1123; // 297mm @ 96dpi
const PREVIEW_WIDTH = 380;
const SCALE = PREVIEW_WIDTH / PAGE_WIDTH;
const PREVIEW_HEIGHT = PAGE_HEIGHT * SCALE;
const SNAP_THRESHOLD = 12; // px em coordenada real (794x1123)

type BoxKey = 'name' | 'subtitle' | 'description' | 'price' | 'image';
const FIXED_KEYS = new Set<string>(['name', 'subtitle', 'description', 'price', 'image']);

interface BoxState { x: number; y: number; width: number; height: number; }
interface CustomTextBox extends BoxState { id: string; text: string; }

const BOX_DEFS: { key: BoxKey; label: string; classes: string }[] = [
  { key: 'name', label: 'Nome', classes: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { key: 'subtitle', label: 'Subtítulo', classes: 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { key: 'description', label: 'Descrição', classes: 'border-zinc-500 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
  { key: 'price', label: 'Preço', classes: 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  { key: 'image', label: 'Imagem', classes: 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
];

const INITIAL_BOXES: Record<BoxKey, BoxState> = {
  name: { x: 47, y: 100, width: 700, height: 60 },
  subtitle: { x: 47, y: 170, width: 700, height: 30 },
  description: { x: 47, y: 210, width: 700, height: 40 },
  price: { x: 247, y: 400, width: 300, height: 120 },
  image: { x: 272, y: 580, width: 250, height: 250 },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTarget?: { index: number; layout: Layout } | null;
}

export default function CriarEstiloModal({ isOpen, onClose, editTarget }: Props) {
  const addTestLayout = useStore((s) => s.addTestLayout);
  const updateTestLayout = useStore((s) => s.updateTestLayout);
  const [name, setName] = useState('');
  const [boxes, setBoxes] = useState<Record<BoxKey, BoxState>>(INITIAL_BOXES);
  const [customTexts, setCustomTexts] = useState<CustomTextBox[]>([]);
  const [moldUrl, setMoldUrl] = useState<string | null>(null);
  const [isUploadingMold, setIsUploadingMold] = useState(false);
  const [activeGuides, setActiveGuides] = useState({ h: false, v: false });
  const dragState = useRef<{ key: string; startX: number; startY: number; boxX: number; boxY: number; boxW: number; boxH: number; mode: 'move' | 'resize' } | null>(null);
  const moldInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editTarget) {
      const l = editTarget.layout;
      setName(l.name || '');
      setBoxes({
        name: { ...INITIAL_BOXES.name, x: l.textElements1.name.x, y: l.textElements1.name.y, width: l.textElements1.name.width },
        subtitle: { ...INITIAL_BOXES.subtitle, x: l.textElements1.subtitle.x, y: l.textElements1.subtitle.y, width: l.textElements1.subtitle.width },
        description: { ...INITIAL_BOXES.description, x: l.textElements1.description.x, y: l.textElements1.description.y, width: l.textElements1.description.width },
        price: { ...INITIAL_BOXES.price, x: l.textElements1.price.x, y: l.textElements1.price.y, width: l.textElements1.price.width },
        image: { x: l.productImage1.x, y: l.productImage1.y, width: l.productImage1.width, height: l.productImage1.height },
      });
      setMoldUrl(l.moldUrl || null);
      setCustomTexts((l.customTexts || []).map((ct) => ({ id: ct.id, text: ct.text, x: ct.x, y: ct.y, width: ct.width, height: 40 })));
    } else {
      setName('');
      setBoxes(INITIAL_BOXES);
      setMoldUrl(null);
      setCustomTexts([]);
    }
  }, [isOpen, editTarget]);

  const getBoxByKey = (key: string): BoxState | undefined => (
    FIXED_KEYS.has(key) ? boxes[key as BoxKey] : customTexts.find((ct) => ct.id === key)
  );

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / SCALE;
    const dy = (e.clientY - drag.startY) / SCALE;

    const computeNext = (b: BoxState): BoxState => {
      if (drag.mode === 'resize') {
        const width = Math.max(40, Math.round(drag.boxW + dx));
        const height = Math.max(20, Math.round(drag.boxH + dy));
        return { ...b, width, height };
      }
      let newX = Math.round(drag.boxX + dx);
      let newY = Math.round(drag.boxY + dy);
      const centerX = newX + b.width / 2;
      const centerY = newY + b.height / 2;
      const snappedV = Math.abs(centerX - PAGE_WIDTH / 2) < SNAP_THRESHOLD;
      const snappedH = Math.abs(centerY - PAGE_HEIGHT / 2) < SNAP_THRESHOLD;
      if (snappedV) newX = Math.round(PAGE_WIDTH / 2 - b.width / 2);
      if (snappedH) newY = Math.round(PAGE_HEIGHT / 2 - b.height / 2);
      setActiveGuides({ h: snappedH, v: snappedV });
      return { ...b, x: newX, y: newY };
    };

    if (FIXED_KEYS.has(drag.key)) {
      setBoxes((prev) => ({ ...prev, [drag.key]: computeNext(prev[drag.key as BoxKey]) }));
    } else {
      setCustomTexts((prev) => prev.map((ct) => (ct.id === drag.key ? { ...ct, ...computeNext(ct) } : ct)));
    }
  };

  const onPointerUp = () => {
    dragState.current = null;
    setActiveGuides({ h: false, v: false });
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  const startDrag = (key: string, mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const b = getBoxByKey(key);
    if (!b) return;
    dragState.current = { key, startX: e.clientX, startY: e.clientY, boxX: b.x, boxY: b.y, boxW: b.width, boxH: b.height, mode };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  if (!isOpen) return null;

  const centerBox = (key: string) => {
    if (FIXED_KEYS.has(key)) {
      setBoxes((prev) => ({ ...prev, [key]: { ...prev[key as BoxKey], x: Math.round((PAGE_WIDTH - prev[key as BoxKey].width) / 2) } }));
    } else {
      setCustomTexts((prev) => prev.map((ct) => (ct.id === key ? { ...ct, x: Math.round((PAGE_WIDTH - ct.width) / 2) } : ct)));
    }
  };

  const addCustomText = () => {
    const n = customTexts.length + 1;
    setCustomTexts((prev) => [...prev, {
      id: crypto.randomUUID(),
      text: `Texto Extra ${n}`,
      x: 47,
      y: 500 + (prev.length % 5) * 40,
      width: 300,
      height: 40,
    }]);
  };

  const removeCustomText = (id: string) => {
    setCustomTexts((prev) => prev.filter((ct) => ct.id !== id));
  };

  const updateCustomTextContent = (id: string, text: string) => {
    setCustomTexts((prev) => prev.map((ct) => (ct.id === id ? { ...ct, text } : ct)));
  };

  const handleMoldSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return; }

    setIsUploadingMold(true);
    try {
      const { url } = await uploadBackgroundImage(file, 'layout-moldes-guia');
      setMoldUrl(url);
      toast.success('Guia enviado! Use como referência para alinhar as caixas.');
    } catch (err: any) {
      toast.error(err.message || 'Falha no upload do guia.');
    } finally {
      setIsUploadingMold(false);
    }
  };

  const handleClose = () => {
    setName('');
    setBoxes(INITIAL_BOXES);
    setMoldUrl(null);
    setCustomTexts([]);
    onClose();
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Digite um nome para o estilo.'); return; }
    const base = editTarget ? editTarget.layout : createDefaultLayout(name.trim());
    const layout: Layout = {
      ...base,
      name: name.trim(),
      id: editTarget ? editTarget.layout.id : crypto.randomUUID(),
      // O guia é só uma referência visual dentro desta tela — nunca vira o
      // fundo real do estilo nem é impresso (etiquetas saem sobre papel/adesivo
      // já pré-impresso fisicamente).
      moldUrl: moldUrl ?? null,
      textElements1: {
        ...base.textElements1,
        name: { ...base.textElements1.name, x: boxes.name.x, y: boxes.name.y, width: boxes.name.width },
        subtitle: { ...base.textElements1.subtitle, x: boxes.subtitle.x, y: boxes.subtitle.y, width: boxes.subtitle.width },
        description: { ...base.textElements1.description, x: boxes.description.x, y: boxes.description.y, width: boxes.description.width },
        price: { ...base.textElements1.price, x: boxes.price.x, y: boxes.price.y, width: boxes.price.width },
      },
      productImage1: { ...base.productImage1, x: boxes.image.x, y: boxes.image.y, width: boxes.image.width, height: boxes.image.height },
      customTexts: customTexts.map((ct) => ({
        id: ct.id,
        text: ct.text,
        x: ct.x,
        y: ct.y,
        width: ct.width,
        fontSize: 24,
        color: '#000000',
        isBold: true,
        isItalic: false,
        fontFamily: 'Inter',
        align: 'center' as const,
        visible: true,
      })),
    };

    if (editTarget) {
      // editTarget.layout.id é garantido pela tela que abre esta edição
      // (LayoutManagerModal atribui um id antes de permitir editar).
      updateTestLayout(editTarget.layout.id as string, layout);
      toast.success('Estilo atualizado! Modelos vinculados foram sincronizados.');
    } else {
      addTestLayout(layout);
      toast.success('Estilo salvo em "Meus Estilos (Teste)"!');
    }
    handleClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl max-h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-amber-50 dark:bg-amber-900/10 flex-shrink-0">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tighter text-black dark:text-white">
              {editTarget ? `Editar Estilo: ${editTarget.layout.name}` : 'Criar Estilo (Teste)'}
            </h3>
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
              Arraste as caixas na folha A4 • use "Centralizar" para alinhar
            </p>
          </div>
          <button onClick={handleClose} className="p-3 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-grow overflow-auto p-5 flex flex-col md:flex-row gap-5 min-h-0">
          {/* Painel esquerdo: nome + guia + centralizar cada caixa + textos extras + salvar */}
          <div className="w-full md:w-60 flex-shrink-0 space-y-3">
            <div>
              <label className="text-[8px] font-bold text-zinc-500 uppercase block mb-1">Nome do Estilo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Teste 1"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-bold text-black dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-[8px] font-bold text-zinc-500 uppercase block mb-1">Layout A4 (Guia)</label>
              <input ref={moldInputRef} type="file" accept="image/*" className="hidden" onChange={handleMoldSelected} />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => moldInputRef.current?.click()}
                  disabled={isUploadingMold}
                  className="flex-grow flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-teal-400 dark:border-teal-700 text-teal-700 dark:text-teal-300 text-[10px] font-bold uppercase tracking-widest hover:bg-teal-50/60 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploadingMold ? (
                    <div className="w-3.5 h-3.5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {moldUrl ? 'Trocar Guia' : 'Enviar Guia'}
                </button>
                {moldUrl && (
                  <button
                    type="button"
                    onClick={() => setMoldUrl(null)}
                    title="Remover guia"
                    className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[9px] text-zinc-400 mt-1">Só serve de guia visual aqui — não é impresso no estilo final.</p>
            </div>

            <div className="space-y-1.5">
              {BOX_DEFS.map((def) => (
                <button
                  key={def.key}
                  onClick={() => centerBox(def.key)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[10px] font-bold text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  {def.label}
                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <Crosshair className="w-3 h-3" /> Centralizar
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[8px] font-bold text-zinc-500 uppercase">Textos Extras</label>
                <button
                  type="button"
                  onClick={addCustomText}
                  className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-teal-600 hover:text-teal-700"
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              </div>
              {customTexts.map((ct) => (
                <div key={ct.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={ct.text}
                    onChange={(e) => updateCustomTextContent(ct.id, e.target.value)}
                    className="flex-grow min-w-0 px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[10px] font-bold text-black dark:text-white outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => centerBox(ct.id)}
                    title="Centralizar"
                    className="p-1.5 flex-shrink-0 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-blue-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <Crosshair className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCustomText(ct.id)}
                    title="Remover"
                    className="p-1.5 flex-shrink-0 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={handleSave}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
            >
              <Save className="w-4 h-4" /> {editTarget ? 'Salvar Alterações' : 'Salvar em Meus Estilos'}
            </button>
          </div>

          {/* Direita: réguas + folha A4 com as caixas */}
          <div className="flex-grow flex items-start justify-center overflow-auto bg-zinc-100 dark:bg-zinc-950/40 rounded-2xl p-4">
            <div className="relative select-none" style={{ width: PREVIEW_WIDTH + 20, height: PREVIEW_HEIGHT + 20 }}>
              {/* régua horizontal (cm) */}
              <div className="absolute top-0 left-5 h-5 bg-zinc-200 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700 overflow-hidden" style={{ width: PREVIEW_WIDTH }}>
                {Array.from({ length: 22 }).map((_, i) => (
                  <div key={i} className="absolute top-0 h-full border-l border-zinc-400/60 dark:border-zinc-600 text-[6px] text-zinc-500 dark:text-zinc-400 pl-0.5" style={{ left: i * (PREVIEW_WIDTH / 21) }}>
                    {i}
                  </div>
                ))}
              </div>
              {/* régua vertical (cm) */}
              <div className="absolute top-5 left-0 w-5 bg-zinc-200 dark:bg-zinc-800 border-r border-zinc-300 dark:border-zinc-700 overflow-hidden" style={{ height: PREVIEW_HEIGHT }}>
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="absolute left-0 w-full border-t border-zinc-400/60 dark:border-zinc-600 text-[6px] text-zinc-500 dark:text-zinc-400" style={{ top: i * (PREVIEW_HEIGHT / 29) }} />
                ))}
              </div>

              {/* folha A4 */}
              <div className="absolute bg-white overflow-hidden shadow-inner border border-zinc-300 dark:border-zinc-600" style={{ left: 20, top: 20, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}>
                {moldUrl && (
                  <img
                    src={moldUrl}
                    alt="Guia do layout"
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    style={{ opacity: 0.35 }}
                  />
                )}

                {/* guias de centro */}
                <div
                  className={cn('absolute top-0 bottom-0 border-l border-dashed pointer-events-none', activeGuides.v ? 'border-rose-500' : 'border-zinc-200')}
                  style={{ left: PREVIEW_WIDTH / 2 }}
                />
                <div
                  className={cn('absolute left-0 right-0 border-t border-dashed pointer-events-none', activeGuides.h ? 'border-rose-500' : 'border-zinc-200')}
                  style={{ top: PREVIEW_HEIGHT / 2 }}
                />

                {BOX_DEFS.map((def) => {
                  const b = boxes[def.key];
                  return (
                    <div
                      key={def.key}
                      onPointerDown={startDrag(def.key, 'move')}
                      className={cn('absolute border-2 flex items-center justify-center text-center leading-tight cursor-move text-[8px] font-black uppercase', def.classes)}
                      style={{ left: b.x * SCALE, top: b.y * SCALE, width: b.width * SCALE, height: b.height * SCALE }}
                    >
                      {def.label}
                      <div
                        onPointerDown={startDrag(def.key, 'resize')}
                        className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-white border border-zinc-400 rounded-full cursor-se-resize"
                        title="Redimensionar"
                      />
                    </div>
                  );
                })}

                {customTexts.map((ct) => (
                  <div
                    key={ct.id}
                    onPointerDown={startDrag(ct.id, 'move')}
                    className="absolute border-2 border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300 flex items-center justify-center text-center leading-tight cursor-move text-[8px] font-black uppercase px-1 overflow-hidden"
                    style={{ left: ct.x * SCALE, top: ct.y * SCALE, width: ct.width * SCALE, height: ct.height * SCALE }}
                  >
                    <span className="truncate">{ct.text || 'Texto Extra'}</span>
                    <div
                      onPointerDown={startDrag(ct.id, 'resize')}
                      className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-white border border-zinc-400 rounded-full cursor-se-resize"
                      title="Redimensionar"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
