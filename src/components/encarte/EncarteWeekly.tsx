import React, { useEffect, useRef, useState } from 'react';
import { useStore, Product, SelectedProduct, EncarteSemanal } from '../../store';
import { getProxyUrl } from '../../lib/utils';
import { formatPrice } from '../../lib/encartePrice';
import ProductSelector from '../ProductSelector';
import { Plus, FileDown, Image as ImageIcon2, X, Percent } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

const SAVE_DEBOUNCE_MS = 800;

const emptySemanal = (moldeId: string, storeProfileId: string): EncarteSemanal => ({
  id: Math.random().toString(36).slice(2, 10),
  moldeId,
  storeProfileId,
  validade: '',
  produtos: {},
});

export default function EncarteWeekly() {
  const {
    encarteMoldes, fetchEncarteMoldes,
    storeProfiles, fetchStoreProfiles,
    encartesSemanais, fetchEncartesSemanais, saveEncartesSemanais,
  } = useStore();

  const [moldeId, setMoldeId] = useState('');
  const [storeProfileId, setStoreProfileId] = useState('');
  const [semanal, setSemanal] = useState<EncarteSemanal | null>(null);
  // Só decide "existe ou cria novo" depois que encartesSemanais realmente
  // carregou — sem isso, escolher molde+loja antes do fetch responder cria
  // um registro novo que depois convive duplicado com o que já existia.
  const [semanaisReady, setSemanaisReady] = useState(false);
  const [side, setSide] = useState<'frente' | 'verso'>('frente');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchEncarteMoldes();
    fetchStoreProfiles();
    fetchEncartesSemanais().then(() => setSemanaisReady(true));
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const molde = encarteMoldes.find((m) => m.id === moldeId) || null;
  const storeProfile = storeProfiles.find((p) => p.id === storeProfileId) || null;

  useEffect(() => {
    if (!moldeId || !storeProfileId || !semanaisReady) return;
    const existing = encartesSemanais.find((s) => s.moldeId === moldeId && s.storeProfileId === storeProfileId);
    setSemanal(existing || emptySemanal(moldeId, storeProfileId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moldeId, storeProfileId, semanaisReady]);

  // Atualiza a tela na hora, mas só grava no servidor 800ms depois da última
  // mudança — sem isso, cada tecla digitada na validade ou no preço disparava
  // um POST do array inteiro de encartes semanais.
  const persistSemanal = (updated: EncarteSemanal) => {
    setSemanal(updated);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const others = useStore.getState().encartesSemanais.filter((s) => s.id !== updated.id);
      saveEncartesSemanais([...others, updated]);
    }, SAVE_DEBOUNCE_MS);
  };

  const handleSelectProduct = (product: Product) => {
    if (!semanal || !activeSlotId) return;
    const produtos = {
      ...semanal.produtos,
      [activeSlotId]: {
        ...product,
        id: Math.random().toString(36).slice(2, 10),
        subtitle: product.description || '',
        displayType: 'price' as const,
      },
    };
    persistSemanal({ ...semanal, produtos });
    setActiveSlotId(null);
  };

  const updateSlotProduct = (slotId: string, updates: Partial<SelectedProduct>) => {
    if (!semanal) return;
    const current = semanal.produtos[slotId];
    if (!current) return;
    persistSemanal({ ...semanal, produtos: { ...semanal.produtos, [slotId]: { ...current, ...updates } } });
  };

  const toggleSlotDisplayType = (slotId: string) => {
    if (!semanal) return;
    const current = semanal.produtos[slotId];
    if (!current) return;
    if (current.displayType === 'discount') {
      updateSlotProduct(slotId, { displayType: 'price' });
    } else {
      updateSlotProduct(slotId, { displayType: 'discount', discountValue: current.discountValue || '' });
    }
  };

  const removeSlotProduct = (slotId: string) => {
    if (!semanal) return;
    persistSemanal({ ...semanal, produtos: { ...semanal.produtos, [slotId]: null } });
  };

  const waitFrame = () => new Promise((resolve) => setTimeout(resolve, 200));

  const captureSideAsDataUrl = async (targetSide: 'frente' | 'verso', format: 'png' | 'jpeg') => {
    setSide(targetSide);
    await waitFrame();
    const canvas = await html2canvas(previewRef.current!, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      ignoreElements: (element) => element.classList.contains('no-print'),
    });
    return format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.95);
  };

  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  };

  const handleExportPNG = async () => {
    if (!previewRef.current || !molde) return;
    setIsExporting(true);
    const toastId = toast.loading('Gerando imagem...');
    const originalSide = side;
    try {
      const nomeArquivo = molde.nome.replace(/\s+/g, '-');
      const frenteUrl = await captureSideAsDataUrl('frente', 'png');
      downloadDataUrl(frenteUrl, `encarte-${nomeArquivo}-frente-${Date.now()}.png`);

      if (molde.backBgUrl) {
        const versoUrl = await captureSideAsDataUrl('verso', 'png');
        downloadDataUrl(versoUrl, `encarte-${nomeArquivo}-verso-${Date.now()}.png`);
      }
      toast.success('Imagem exportada!', { id: toastId });
    } catch {
      toast.error('Erro ao exportar. Verifique se a arte de fundo está acessível.', { id: toastId });
    } finally {
      setSide(originalSide);
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!previewRef.current || !molde) return;
    setIsExporting(true);
    const toastId = toast.loading('Gerando PDF...');
    const originalSide = side;
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');

      const frenteImg = await captureSideAsDataUrl('frente', 'jpeg');
      pdf.addImage(frenteImg, 'JPEG', 0, 0, 210, 297);

      if (molde.backBgUrl) {
        pdf.addPage();
        const versoImg = await captureSideAsDataUrl('verso', 'jpeg');
        pdf.addImage(versoImg, 'JPEG', 0, 0, 210, 297);
      }

      pdf.save(`encarte-${molde.nome.replace(/\s+/g, '-')}-${Date.now()}.pdf`);
      toast.success('PDF gerado!', { id: toastId });
    } catch {
      toast.error('Erro ao gerar PDF.', { id: toastId });
    } finally {
      setSide(originalSide);
      setIsExporting(false);
    }
  };

  if (!molde || !storeProfile) {
    return (
      <div className="p-6 space-y-6 max-w-lg mx-auto">
        <h2 className="text-sm font-black uppercase tracking-widest">Montar encarte da semana</h2>
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-zinc-500">Molde</label>
          <select value={moldeId} onChange={(e) => setMoldeId(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none">
            <option value="">Selecione...</option>
            {encarteMoldes.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-zinc-500">Loja</label>
          <select value={storeProfileId} onChange={(e) => setStoreProfileId(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none">
            <option value="">Selecione...</option>
            {storeProfiles.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      </div>
    );
  }

  const activeSlots = side === 'frente' ? molde.frontSlots : (molde.backSlots || []);
  const activeBgUrl = side === 'frente' ? molde.frontBgUrl : molde.backBgUrl;
  const fontFamily = molde.fontFamily || 'Inter';

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">{molde.nome} — {storeProfile.nome}</h2>
          <button onClick={() => { setMoldeId(''); setStoreProfileId(''); }} className="text-[10px] text-emerald-600 font-black uppercase">Trocar molde/loja</button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Validade (ex: 30 e 31 de Julho)"
            value={semanal?.validade || ''}
            onChange={(e) => semanal && persistSemanal({ ...semanal, validade: e.target.value })}
            className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none w-56"
          />
          <button onClick={handleExportPNG} disabled={isExporting} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-50">
            <ImageIcon2 className="w-4 h-4" /> PNG
          </button>
          <button onClick={handleExportPDF} disabled={isExporting} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-50">
            <FileDown className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {molde.backBgUrl && (
        <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl w-fit">
          <button onClick={() => setSide('frente')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${side === 'frente' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Frente</button>
          <button onClick={() => setSide('verso')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${side === 'verso' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Verso</button>
        </div>
      )}

      <div ref={previewRef} className="relative w-full mx-auto bg-white shadow-lg" style={{ maxWidth: 600, fontFamily }}>
        {activeBgUrl && <img src={getProxyUrl(activeBgUrl)} className="w-full h-auto block select-none pointer-events-none" draggable={false} crossOrigin="anonymous" />}

        {activeSlots.filter((s) => s.tipo === 'logo').map((slot) => (
          <div key={slot.id} className="absolute flex items-center justify-center" style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
            {storeProfile.logoUrl && <img src={getProxyUrl(storeProfile.logoUrl)} className="max-w-full max-h-full object-contain" crossOrigin="anonymous" />}
          </div>
        ))}

        {activeSlots.filter((s) => s.tipo === 'contato').map((slot) => (
          <div key={slot.id} className="absolute flex flex-col items-center justify-center text-center text-[8px] font-bold leading-tight" style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
            <span>{storeProfile.telefone}</span>
            <span>{storeProfile.instagram}</span>
            <span>{storeProfile.endereco}</span>
          </div>
        ))}

        {activeSlots.filter((s) => s.tipo === 'data').map((slot) => (
          <div key={slot.id} className="absolute flex items-center justify-center text-[9px] font-black uppercase" style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
            {semanal?.validade}
          </div>
        ))}

        {activeSlots.filter((s) => s.tipo === 'produto').map((slot) => {
          const product = semanal?.produtos[slot.id];
          return (
            <div key={slot.id} className="absolute p-0.5" style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
              {product ? (
                <div className="group relative w-full h-full flex flex-col items-center justify-center gap-0.5 text-center">
                  <button onClick={() => removeSlotProduct(slot.id)} className="no-print absolute top-0 right-0 z-10 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                    <X className="w-2.5 h-2.5" />
                  </button>
                  {product.image && <img src={getProxyUrl(product.image)} className="max-h-[45%] object-contain" crossOrigin="anonymous" />}
                  <p className="text-[7px] font-black uppercase leading-tight">{product.name}</p>
                  {product.displayType === 'discount' ? (
                    <p className="text-lg font-black text-red-600">{product.discountValue}%</p>
                  ) : (
                    <p className="text-lg font-black text-red-600">
                      {formatPrice(product.price).integer}
                      <span className="text-xs">{formatPrice(product.price).cents}</span>
                    </p>
                  )}
                  <div className="no-print flex items-center gap-1">
                    <button
                      onClick={() => toggleSlotDisplayType(slot.id)}
                      title="Alternar entre preço e % de desconto"
                      className="p-1 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                    >
                      <Percent className="w-2.5 h-2.5" />
                    </button>
                    <input
                      type="text"
                      value={product.displayType === 'discount' ? (product.discountValue || '') : product.price}
                      onChange={(e) => updateSlotProduct(slot.id, product.displayType === 'discount' ? { discountValue: e.target.value } : { price: e.target.value })}
                      className="w-16 text-[9px] text-center bg-white/80 border border-zinc-300 rounded px-1"
                    />
                  </div>
                </div>
              ) : (
                <button onClick={() => setActiveSlotId(slot.id)} className="no-print w-full h-full border-2 border-dashed border-zinc-300 rounded-lg flex items-center justify-center text-zinc-400 hover:border-emerald-500 hover:text-emerald-500 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {activeSlotId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setActiveSlotId(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-black uppercase tracking-widest mb-4">Escolher produto</h3>
            <ProductSelector onSelect={handleSelectProduct} />
          </div>
        </div>
      )}
    </div>
  );
}
