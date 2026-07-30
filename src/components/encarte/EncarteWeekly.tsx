import React, { useEffect, useRef, useState } from 'react';
import { useStore, Product, SelectedProduct, EncarteSemanal, EncarteElementRect } from '../../store';
import { getProxyUrl } from '../../lib/utils';
import ProductSelector from '../ProductSelector';
import DraggableBox, { BoxRect } from './DraggableBox';
import { Plus, FileDown, Image as ImageIcon2, Percent, ZoomIn, ZoomOut } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

const SAVE_DEBOUNCE_MS = 800;
// Guarda o save pendente aqui também (não só no ref em memória) — se o
// flush do unmount cair numa falha de rede, o registro não fica só na
// memória de uma instância que já foi desmontada: sobrevive a trocar de
// aba de novo (ou até recarregar a página, já que sessionStorage
// persiste) até uma tentativa seguinte confirmar no servidor.
const PENDING_SAVE_KEY = 'smartprice_encarte_semanal_pending';

// Posições/tamanhos iniciais dos 4 elementos dentro do card do produto —
// só usados até o usuário arrastar/redimensionar algum; a partir daí o
// valor salvo em product.elementLayout manda.
const DEFAULT_ELEMENT_RECTS: Record<'name' | 'subtitle' | 'price' | 'image', EncarteElementRect> = {
  name: { xPct: 2, yPct: 2, widthPct: 58, heightPct: 20 },
  subtitle: { xPct: 2, yPct: 24, widthPct: 58, heightPct: 16 },
  price: { xPct: 2, yPct: 44, widthPct: 42, heightPct: 40 },
  image: { xPct: 62, yPct: 10, widthPct: 36, heightPct: 80 },
};

const emptySemanal = (moldeId: string, storeProfileId: string): EncarteSemanal => ({
  id: Math.random().toString(36).slice(2, 10),
  moldeId,
  storeProfileId,
  validade: '',
  produtos: {},
});

type ElementKey = 'card' | 'name' | 'subtitle' | 'price' | 'image';

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
  const [zoom, setZoom] = useState(100);
  // Qual elemento está selecionado agora (só ele mostra alças de
  // redimensionar) — clicar num elemento diferente troca a seleção, clicar
  // fora de qualquer elemento (no fundo do preview) limpa. Sem isso, todos
  // os elementos de todos os produtos mostravam alças ao mesmo tempo,
  // poluindo a tela.
  const [selected, setSelected] = useState<{ slotId: string; key: ElementKey } | null>(null);
  const isSelected = (slotId: string, key: ElementKey) => selected?.slotId === slotId && selected.key === key;
  const selectElement = (slotId: string, key: ElementKey) => setSelected({ slotId, key });
  const previewRef = useRef<HTMLDivElement>(null);
  // Um ref estável por slot (não recriado a cada render) — o conteúdo do
  // produto é arrastável dentro do próprio slot via DraggableBox, que exige
  // um containerRef com identidade estável pra não recriar os handlers de
  // pointer a cada render (a mesma classe de bug já corrigida em
  // DraggableBox.tsx: um objeto `{ current }` novo a cada render quebraria
  // o `useCallback` que depende de `containerRef`).
  const slotContainerRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
  const getSlotContainerRef = (slotId: string) => {
    if (!slotContainerRefs.current.has(slotId)) {
      slotContainerRefs.current.set(slotId, React.createRef<HTMLDivElement>());
    }
    return slotContainerRefs.current.get(slotId)!;
  };
  // Ref pro próprio card do produto (o DraggableBox externo) — usado como
  // containerRef dos 4 elementos internos (nome/descrição/preço/foto), que
  // são arrastáveis/redimensionáveis cada um dentro do card, igual ao
  // editor de plaquinhas.
  const cardRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
  const getCardRef = (slotId: string) => {
    if (!cardRefs.current.has(slotId)) {
      cardRefs.current.set(slotId, React.createRef<HTMLDivElement>());
    }
    return cardRefs.current.get(slotId)!;
  };
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guarda o último EncarteSemanal ainda não confirmado no servidor — usado
  // pra descarregar (flush) o save pendente se o componente desmontar antes
  // do debounce disparar (trocar de aba não pode perder os últimos 800ms).
  const pendingSaveRef = useRef<EncarteSemanal | null>(null);

  useEffect(() => {
    fetchEncarteMoldes();
    fetchStoreProfiles();
    // Só libera a criação de novos registros — e só tenta o retry pendente
    // abaixo — depois que o fetch realmente confirmar. Tentar retry ANTES
    // do fetch resolver leria encartesSemanais como [] e o retry POSTaria
    // só o registro pendente por cima disso, destruindo todo o resto salvo
    // no servidor (a persistência é por substituição do array inteiro).
    fetchEncartesSemanais().then((ok) => {
      if (!ok) return;
      setSemanaisReady(true);

      // Se um flush anterior (desta ou de uma sessão de aba anterior) ficou
      // pendente por causa de uma falha de rede ou um reload no meio do
      // debounce, tenta salvar de novo agora — com o array já carregado.
      const leftover = sessionStorage.getItem(PENDING_SAVE_KEY);
      if (!leftover) return;
      try {
        const pending: EncarteSemanal = JSON.parse(leftover);
        const others = useStore.getState().encartesSemanais.filter((s) => s.id !== pending.id);
        saveEncartesSemanais([...others, pending]).then((saved) => {
          // Só limpa a chave se ainda for o mesmo payload que acabou de ser
          // salvo — se uma edição nova sobrescreveu a chave enquanto esse
          // POST estava em voo, quem limpa é o próximo save a confirmar.
          if (saved && sessionStorage.getItem(PENDING_SAVE_KEY) === leftover) {
            sessionStorage.removeItem(PENDING_SAVE_KEY);
          }
        });
      } catch {
        sessionStorage.removeItem(PENDING_SAVE_KEY);
      }
    });
  }, []);

  const flushPendingSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    const pendingJson = JSON.stringify(pending);
    const others = useStore.getState().encartesSemanais.filter((s) => s.id !== pending.id);
    saveEncartesSemanais([...others, pending]).then((ok) => {
      // Só limpa a chave se ainda for esse mesmo payload — uma edição nova
      // pode ter sobrescrito sessionStorage enquanto esse POST estava em
      // voo, e nesse caso quem limpa é o próximo save a confirmar aquele.
      if (ok && sessionStorage.getItem(PENDING_SAVE_KEY) === pendingJson) {
        sessionStorage.removeItem(PENDING_SAVE_KEY);
      }
    });
  };

  useEffect(() => {
    return () => { flushPendingSave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const molde = encarteMoldes.find((m) => m.id === moldeId) || null;
  const storeProfile = storeProfiles.find((p) => p.id === storeProfileId) || null;

  useEffect(() => {
    if (!moldeId || !storeProfileId || !semanaisReady) {
      setSemanal(null);
      return;
    }
    const existing = encartesSemanais.find((s) => s.moldeId === moldeId && s.storeProfileId === storeProfileId);
    setSemanal(existing || emptySemanal(moldeId, storeProfileId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moldeId, storeProfileId, semanaisReady]);

  // Atualiza a tela na hora, mas só grava no servidor 800ms depois da última
  // mudança — sem isso, cada tecla digitada na validade ou no preço disparava
  // um POST do array inteiro de encartes semanais. Se o componente desmontar
  // antes do timer disparar, o useEffect de cleanup acima descarrega
  // (flush) esse save pendente em vez de simplesmente descartá-lo.
  const persistSemanal = (updated: EncarteSemanal) => {
    setSemanal(updated);
    pendingSaveRef.current = updated;
    sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(updated));
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS);
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

  const updateElementLayout = (slotId: string, key: 'name' | 'subtitle' | 'price' | 'image', rect: EncarteElementRect) => {
    if (!semanal) return;
    const current = semanal.produtos[slotId];
    if (!current) return;
    updateSlotProduct(slotId, { elementLayout: { ...current.elementLayout, [key]: rect } });
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
    setSelected((sel) => (sel?.slotId === slotId ? null : sel));
  };

  // Zoom só afeta a pré-visualização (facilita clicar/arrastar nos cards
  // pequenos) — nunca a exportação, que sempre reseta pra 100% antes de
  // capturar (ver handleExportPNG/PDF).
  const handleWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(300, Math.max(40, z - Math.sign(e.deltaY) * 10)));
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
    const originalZoom = zoom;
    setZoom(100); // captura sempre no tamanho real, o zoom é só pra edição
    setSelected(null); // sem contorno de seleção na imagem exportada
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
      setZoom(originalZoom);
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!previewRef.current || !molde) return;
    setIsExporting(true);
    const toastId = toast.loading('Gerando PDF...');
    const originalSide = side;
    const originalZoom = zoom;
    setZoom(100); // captura sempre no tamanho real, o zoom é só pra edição
    setSelected(null); // sem contorno de seleção na imagem exportada
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
      setZoom(originalZoom);
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
  const fontFamily = `${molde.fontFamily || 'Inter'}, sans-serif`;

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

      <div className="flex items-center justify-between flex-wrap gap-3">
        {molde.backBgUrl ? (
          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl w-fit">
            <button onClick={() => setSide('frente')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${side === 'frente' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Frente</button>
            <button onClick={() => setSide('verso')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${side === 'verso' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Verso</button>
          </div>
        ) : <div />}

        <div className="no-print flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
          <button onClick={() => setZoom((z) => Math.max(40, z - 20))} className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-500 transition-all" title="Diminuir zoom">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-black w-10 text-center">{zoom}%</span>
          <button onClick={() => setZoom((z) => Math.min(300, z + 20))} className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-zinc-500 transition-all" title="Aumentar zoom">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          {zoom !== 100 && (
            <button onClick={() => setZoom(100)} className="text-[9px] font-black uppercase text-emerald-600 px-1">100%</button>
          )}
        </div>
      </div>

      <div className="w-full overflow-auto rounded-2xl border border-zinc-200 dark:border-zinc-800" style={{ maxHeight: '75vh' }} onWheel={handleWheelZoom}>
        <div
          ref={previewRef}
          className="relative mx-auto bg-white shadow-lg origin-top transition-transform"
          style={{ width: 600, fontFamily, transform: `scale(${zoom / 100})` }}
          onPointerDown={() => setSelected(null)}
        >
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
          const nameColor = molde.productNameColor || '#dc2626';
          const boxColor = molde.priceBoxColor || '#dc2626';
          // Área "de conteúdo" arrastável dentro do slot: 80% do tamanho do
          // slot, com até 20% de folga (10% pra cada lado) pra mover sem
          // sair da célula — offsetX/offsetY guardam a posição atual dessa
          // área dentro do slot (0-20, padrão 10 = centralizado).
          const contentRect: BoxRect = {
            xPct: product?.offsetX ?? 10,
            yPct: product?.offsetY ?? 10,
            widthPct: product?.width ?? 80,
            heightPct: product?.height ?? 80,
          };
          const nameRect = product?.elementLayout?.name || DEFAULT_ELEMENT_RECTS.name;
          const subtitleRect = product?.elementLayout?.subtitle || DEFAULT_ELEMENT_RECTS.subtitle;
          const priceRect = product?.elementLayout?.price || DEFAULT_ELEMENT_RECTS.price;
          const imageRect = product?.elementLayout?.image || DEFAULT_ELEMENT_RECTS.image;
          const cardRef = getCardRef(slot.id);
          return (
            <div key={slot.id} ref={getSlotContainerRef(slot.id)} className="absolute p-0.5" style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
              {product ? (
                <DraggableBox
                  ref={cardRef}
                  rect={contentRect}
                  containerRef={getSlotContainerRef(slot.id)}
                  onChange={(rect) => updateSlotProduct(slot.id, { offsetX: rect.xPct, offsetY: rect.yPct, width: rect.widthPct, height: rect.heightPct })}
                  onRemove={() => removeSlotProduct(slot.id)}
                  selected={isSelected(slot.id, 'card')}
                  onSelect={() => selectElement(slot.id, 'card')}
                >
                  <div className="group relative w-full h-full overflow-visible">
                    <DraggableBox
                      rect={nameRect}
                      containerRef={cardRef}
                      onChange={(rect) => updateElementLayout(slot.id, 'name', rect)}
                      selected={isSelected(slot.id, 'name')}
                      onSelect={() => selectElement(slot.id, 'name')}
                    >
                      <input
                        type="text"
                        value={product.name}
                        onPointerDown={(e) => { e.stopPropagation(); selectElement(slot.id, 'name'); }}
                        onChange={(e) => updateSlotProduct(slot.id, { name: e.target.value })}
                        className="w-full h-full min-w-0 text-[6px] font-black uppercase leading-tight bg-transparent border-none outline-none p-0 focus:ring-1 focus:ring-black/20 rounded-[1px]"
                        style={{ color: nameColor }}
                      />
                    </DraggableBox>

                    <DraggableBox
                      rect={subtitleRect}
                      containerRef={cardRef}
                      onChange={(rect) => updateElementLayout(slot.id, 'subtitle', rect)}
                      selected={isSelected(slot.id, 'subtitle')}
                      onSelect={() => selectElement(slot.id, 'subtitle')}
                    >
                      <input
                        type="text"
                        placeholder="Descrição"
                        value={product.subtitle || ''}
                        onPointerDown={(e) => { e.stopPropagation(); selectElement(slot.id, 'subtitle'); }}
                        onChange={(e) => updateSlotProduct(slot.id, { subtitle: e.target.value })}
                        className="w-full h-full min-w-0 text-[4.5px] font-bold uppercase leading-tight text-zinc-500 bg-transparent border-none outline-none p-0 focus:ring-1 focus:ring-black/20 rounded-[1px]"
                      />
                    </DraggableBox>

                    <DraggableBox
                      rect={priceRect}
                      containerRef={cardRef}
                      onChange={(rect) => updateElementLayout(slot.id, 'price', rect)}
                      selected={isSelected(slot.id, 'price')}
                      onSelect={() => selectElement(slot.id, 'price')}
                    >
                      <div className="w-full h-full rounded px-1 py-[1px] flex flex-col items-start justify-center leading-none" style={{ backgroundColor: boxColor }}>
                        <button
                          onClick={() => toggleSlotDisplayType(slot.id)}
                          onPointerDown={(e) => { e.stopPropagation(); selectElement(slot.id, 'price'); }}
                          title="Alternar entre preço e % de desconto"
                          className="no-print absolute top-0 left-0 p-[1px] rounded bg-black/20 text-white flex-shrink-0"
                        >
                          <Percent className="w-2 h-2" />
                        </button>
                        <span className="text-[3.5px] font-black text-white uppercase leading-none">Por</span>
                        {product.displayType === 'discount' ? (
                          <div className="flex items-baseline">
                            <input
                              type="text"
                              value={product.discountValue || ''}
                              onPointerDown={(e) => { e.stopPropagation(); selectElement(slot.id, 'price'); }}
                              onChange={(e) => updateSlotProduct(slot.id, { discountValue: e.target.value })}
                              className="w-6 text-[11px] font-black text-white leading-none bg-transparent border-none outline-none p-0 focus:ring-1 focus:ring-white/50 rounded-[1px]"
                            />
                            <span className="text-[11px] font-black text-white leading-none">%</span>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-[1px]">
                            <input
                              type="text"
                              value={product.price}
                              onPointerDown={(e) => { e.stopPropagation(); selectElement(slot.id, 'price'); }}
                              onChange={(e) => updateSlotProduct(slot.id, { price: e.target.value })}
                              className="w-11 text-[9px] font-black text-white leading-none bg-transparent border-none outline-none p-0 focus:ring-1 focus:ring-white/50 rounded-[1px]"
                            />
                            <span className="text-[3.5px] font-black text-white uppercase leading-none">Uni</span>
                          </div>
                        )}
                      </div>
                    </DraggableBox>

                    {product.image && (
                      <DraggableBox
                        rect={imageRect}
                        containerRef={cardRef}
                        onChange={(rect) => updateElementLayout(slot.id, 'image', rect)}
                        selected={isSelected(slot.id, 'image')}
                        onSelect={() => selectElement(slot.id, 'image')}
                      >
                        <img src={getProxyUrl(product.image)} className="w-full h-full object-contain" crossOrigin="anonymous" />
                      </DraggableBox>
                    )}
                  </div>
                </DraggableBox>
              ) : (
                <button onClick={() => setActiveSlotId(slot.id)} className="no-print w-full h-full border-2 border-dashed border-zinc-300 rounded-lg flex items-center justify-center text-zinc-400 hover:border-emerald-500 hover:text-emerald-500 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
        </div>
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
