import { useRef, useState } from 'react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import {
  Undo2, Redo2, Type, Palette, Shapes, CalendarDays, Download, Share2, Package, Plus,
  ZoomIn, ZoomOut, Loader2, LayoutGrid, ChevronDown, Check, Copy, X, Image as ImageIcon, FileText,
  MessageCircle, Mail, Instagram, Square, Circle, RectangleHorizontal, Trash2,
} from 'lucide-react';
import { getProxyUrl, cn } from '../../lib/utils';
import EncarteProductCard from './EncarteProductCard';
import { Formato } from './formatos';
import {
  EncarteProduto, EstiloEncarte, GradeId, GRADES, getGrade,
  DivisorEncarte, ElementoImagem, FUNDOS_BUILTIN, ehFundoBuiltin, CANVAS_W,
  FormaEncarte, FormaTipo, FORMAS_DISPONIVEIS,
} from './encarteProduto';

const MIN_ELEMENTO = 4; // % do canvas — tamanho mínimo de um elemento de imagem

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

/** Para onde o botão "Compartilhar" pode mandar o PNG em alta qualidade. */
const DESTINOS_COMPARTILHAR = {
  whatsapp: { nome: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  email: {
    nome: 'e-mail',
    url:
      'https://mail.google.com/mail/?view=cm&fs=1&su=' +
      encodeURIComponent('Encarte') +
      '&body=' +
      encodeURIComponent('Segue o encarte em anexo.'),
  },
  instagram: { nome: 'Instagram', url: 'https://www.instagram.com/' },
} as const;

type DestinoCompartilhar = keyof typeof DESTINOS_COMPARTILHAR;

const TOOLBAR_ITEMS = [
  { icon: Type, label: 'Fontes' },
  { icon: Type, label: 'Texto' },
  { icon: Palette, label: 'Cores' },
  { icon: CalendarDays, label: 'Validade' },
];

const ICONE_FORMA: Record<FormaTipo, typeof Square> = {
  quadrado: Square,
  retangulo: RectangleHorizontal,
  circulo: Circle,
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Miniatura leve (redimensiona no canvas, sem re-renderizar o DOM) pro histórico de encartes. */
function gerarThumbnail(canvas: HTMLCanvasElement, maxW = 300): string {
  const escala = Math.min(1, maxW / canvas.width);
  const w = Math.round(canvas.width * escala);
  const h = Math.round(canvas.height * escala);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  off.getContext('2d')?.drawImage(canvas, 0, 0, w, h);
  return off.toDataURL('image/png');
}

interface EncarteCanvasProps {
  backgroundUrl: string | null;
  produtos: EncarteProduto[];
  estilo: EstiloEncarte;
  formato: Formato;
  grade: GradeId;
  divisores: DivisorEncarte[];
  imagens: ElementoImagem[];
  formas: FormaEncarte[];
  rodape: { ativo: boolean; texto: string };
  ladoAtivo: 'frente' | 'verso';
  temVerso: boolean;
  produtoDetalhadoId: string | number | null;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  onDesfazer: () => void;
  onRefazer: () => void;
  onAdicionarProdutos: () => void;
  onAbrirDetalhes: (id?: string | number) => void;
  onMoverProduto: (id: string | number | undefined, xPct: number, yPct: number) => void;
  onMoverDivisor: (id: string, yPct: number) => void;
  onMoverImagem: (id: string, xPct: number, yPct: number) => void;
  onRedimensionarImagem: (id: string, patch: Partial<ElementoImagem>) => void;
  onRemoverImagem: (id: string) => void;
  onAdicionarForma: (tipo: FormaTipo) => void;
  onMoverForma: (id: string, xPct: number, yPct: number) => void;
  onRedimensionarForma: (id: string, patch: Partial<FormaEncarte>) => void;
  onDefinirCorForma: (id: string, cor: string) => void;
  onRemoverForma: (id: string) => void;
  onGradeChange: (grade: GradeId) => void;
  onAdicionarVerso: () => void;
  onRemoverVerso: () => void;
  onLadoChange: (lado: 'frente' | 'verso') => void;
  onExportado?: (imagemPreview: string) => void;
}

interface DragState {
  tipo: 'produto' | 'divisor';
  id: string | number | undefined;
  pointerId: number;
  startX: number;
  startY: number;
  origXPct: number;
  origYPct: number;
  moved: boolean;
}

type Canto = 'nw' | 'ne' | 'sw' | 'se';

interface ImagemDragState {
  tipo: 'mover' | 'resize';
  canto?: Canto;
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  orig: ElementoImagem;
}

interface FormaDragState {
  tipo: 'mover' | 'resize';
  canto?: Canto;
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  orig: FormaEncarte;
}

export default function EncarteCanvas({
  backgroundUrl,
  produtos,
  estilo,
  formato,
  grade,
  divisores,
  imagens,
  formas,
  rodape,
  ladoAtivo,
  temVerso,
  produtoDetalhadoId,
  podeDesfazer,
  podeRefazer,
  onDesfazer,
  onRefazer,
  onAdicionarProdutos,
  onAbrirDetalhes,
  onMoverProduto,
  onMoverDivisor,
  onMoverImagem,
  onRedimensionarImagem,
  onRemoverImagem,
  onAdicionarForma,
  onMoverForma,
  onRedimensionarForma,
  onDefinirCorForma,
  onRemoverForma,
  onGradeChange,
  onAdicionarVerso,
  onRemoverVerso,
  onLadoChange,
  onExportado,
}: EncarteCanvasProps) {
  const [exportando, setExportando] = useState(false);
  const [gradeAberta, setGradeAberta] = useState(false);
  const [formasAberta, setFormasAberta] = useState(false);
  const [formaSelecionadaId, setFormaSelecionadaId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const imgDragRef = useRef<ImagemDragState | null>(null);
  const formaDragRef = useRef<FormaDragState | null>(null);

  const [downloadAberto, setDownloadAberto] = useState(false);
  const [compartilharAberto, setCompartilharAberto] = useState(false);
  const [zoom, setZoom] = useState(1);

  const ajustarZoom = (delta: number) =>
    setZoom((z) => clamp(Math.round((z + delta) * 100) / 100, ZOOM_MIN, ZOOM_MAX));

  /**
   * Renderiza o canvas do encarte em alta resolução. O preview em tela é sempre
   * CANVAS_W (480px) de largura, não importa o formato — a escala leva pra
   * resolução nominal de cada formato (formatos.ts), não um valor fixo. É isso
   * que garante alta qualidade de verdade: A4 sai em ~2480px, não ~1440px.
   * O `zoom` da visualização não entra aqui: ele fica numa camada acima do
   * `canvasRef`, então o arquivo gerado sai sempre no tamanho real.
   */
  const renderParaCanvas = () =>
    html2canvas(canvasRef.current as HTMLElement, {
      useCORS: true,
      backgroundColor: '#000000',
      scale: formato.width / CANVAS_W,
    });

  const baixar = async (tipo: 'png' | 'pdf') => {
    if (!canvasRef.current || exportando) return;
    setDownloadAberto(false);
    setExportando(true);
    try {
      const canvas = await renderParaCanvas();
      const nomeBase = `encarte-${formato.id}-${ladoAtivo}-${Date.now()}`;

      if (tipo === 'png') {
        const link = document.createElement('a');
        link.download = `${nomeBase}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const pdf = new jsPDF({
          orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height],
        });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
        pdf.save(`${nomeBase}.pdf`);
      }

      onExportado?.(gerarThumbnail(canvas));
      toast.success(tipo === 'png' ? 'PNG baixado em alta qualidade!' : 'PDF baixado em alta qualidade!');
    } catch {
      toast.error('Não foi possível gerar o arquivo do encarte. Tente novamente.');
    } finally {
      setExportando(false);
    }
  };

  const compartilhar = async (destino: DestinoCompartilhar) => {
    if (!canvasRef.current || exportando) return;
    setCompartilharAberto(false);
    // A aba precisa abrir no próprio gesto do clique — se abrisse depois do
    // `await` do html2canvas, o bloqueador de pop-up mataria ela.
    const aba = window.open('about:blank', '_blank');
    setExportando(true);
    try {
      const canvas = await renderParaCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('sem blob'))), 'image/png');
      });
      const nome = `encarte-${formato.id}-${ladoAtivo}-${Date.now()}.png`;
      const file = new File([blob], nome, { type: 'image/png' });
      onExportado?.(gerarThumbnail(canvas));

      // Caminho ideal (celular e parte dos desktops): compartilhamento nativo
      // com o PNG já anexado — o sistema mostra WhatsApp, Instagram, e-mail etc.
      // e o usuário escolhe pra onde vai.
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Encarte', text: 'Encarte gerado no SmartPrice' });
          aba?.close();
          toast.success('Encarte pronto pra compartilhar!');
          return;
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') {
            aba?.close();
            return; // usuário cancelou a folha de compartilhamento
          }
          // qualquer outro erro: cai no fluxo de baixar + abrir o site
        }
      }

      // Fallback (WhatsApp Web / Instagram Web / Gmail no navegador): baixa o
      // PNG em alta e abre o site escolhido em outra aba pra anexar o arquivo.
      const link = document.createElement('a');
      link.download = nome;
      link.href = dataUrl;
      link.click();

      const { nome: nomeDestino, url } = DESTINOS_COMPARTILHAR[destino];
      if (aba) aba.location.href = url;
      else window.open(url, '_blank', 'noopener');
      toast.success(`PNG em alta qualidade baixado! Anexe o arquivo no ${nomeDestino} que abrimos em outra aba.`);
    } catch {
      aba?.close();
      toast.error('Não foi possível preparar o encarte pra compartilhar.');
    } finally {
      setExportando(false);
    }
  };

  const iniciarDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    tipo: 'produto' | 'divisor',
    id: string | number | undefined,
    xPct: number,
    yPct: number,
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      tipo,
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origXPct: xPct,
      origYPct: yPct,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!st || !rect || e.pointerId !== st.pointerId) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.moved && Math.hypot(dx, dy) < 4) return;
    st.moved = true;
    const yPct = clamp(st.origYPct + (dy / rect.height) * 100, 0, 92);
    if (st.tipo === 'divisor') {
      onMoverDivisor(String(st.id), yPct);
    } else {
      const xPct = clamp(st.origXPct + (dx / rect.width) * 100, 0, 92);
      onMoverProduto(st.id, xPct, yPct);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>, aoClicar?: () => void) => {
    const st = dragRef.current;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    if (st && !st.moved) aoClicar?.();
  };

  const iniciarImagemDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    tipo: 'mover' | 'resize',
    im: ElementoImagem,
    canto?: Canto,
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    imgDragRef.current = { tipo, canto, id: im.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, orig: im };
  };

  const handleImagemPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = imgDragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!st || !rect || e.pointerId !== st.pointerId) return;
    const dxPct = ((e.clientX - st.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - st.startY) / rect.height) * 100;
    const o = st.orig;

    if (st.tipo === 'mover') {
      onMoverImagem(
        st.id,
        clamp(o.xPct + dxPct, 0, 100 - o.wPct),
        clamp(o.yPct + dyPct, 0, 100 - o.hPct),
      );
      return;
    }

    let { xPct, yPct, wPct, hPct } = o;
    const oesteMax = o.xPct + o.wPct - MIN_ELEMENTO;
    const norteMax = o.yPct + o.hPct - MIN_ELEMENTO;
    if (st.canto === 'nw' || st.canto === 'sw') {
      xPct = clamp(o.xPct + dxPct, 0, oesteMax);
      wPct = o.xPct + o.wPct - xPct;
    }
    if (st.canto === 'ne' || st.canto === 'se') {
      wPct = clamp(o.wPct + dxPct, MIN_ELEMENTO, 100 - o.xPct);
    }
    if (st.canto === 'nw' || st.canto === 'ne') {
      yPct = clamp(o.yPct + dyPct, 0, norteMax);
      hPct = o.yPct + o.hPct - yPct;
    }
    if (st.canto === 'sw' || st.canto === 'se') {
      hPct = clamp(o.hPct + dyPct, MIN_ELEMENTO, 100 - o.yPct);
    }
    onRedimensionarImagem(st.id, { xPct, yPct, wPct, hPct });
  };

  const handleImagemPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    imgDragRef.current = null;
  };

  // ── Formas: mesmo esquema de arraste/redimensionamento das imagens ──
  const iniciarFormaDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    tipo: 'mover' | 'resize',
    fm: FormaEncarte,
    canto?: Canto,
  ) => {
    e.stopPropagation();
    setFormaSelecionadaId(fm.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    formaDragRef.current = { tipo, canto, id: fm.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, orig: fm };
  };

  const handleFormaPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = formaDragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!st || !rect || e.pointerId !== st.pointerId) return;
    const dxPct = ((e.clientX - st.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - st.startY) / rect.height) * 100;
    const o = st.orig;

    if (st.tipo === 'mover') {
      onMoverForma(
        st.id,
        clamp(o.xPct + dxPct, 0, 100 - o.wPct),
        clamp(o.yPct + dyPct, 0, 100 - o.hPct),
      );
      return;
    }

    let { xPct, yPct, wPct, hPct } = o;
    const oesteMax = o.xPct + o.wPct - MIN_ELEMENTO;
    const norteMax = o.yPct + o.hPct - MIN_ELEMENTO;
    if (st.canto === 'nw' || st.canto === 'sw') {
      xPct = clamp(o.xPct + dxPct, 0, oesteMax);
      wPct = o.xPct + o.wPct - xPct;
    }
    if (st.canto === 'ne' || st.canto === 'se') {
      wPct = clamp(o.wPct + dxPct, MIN_ELEMENTO, 100 - o.xPct);
    }
    if (st.canto === 'nw' || st.canto === 'ne') {
      yPct = clamp(o.yPct + dyPct, 0, norteMax);
      hPct = o.yPct + o.hPct - yPct;
    }
    if (st.canto === 'sw' || st.canto === 'se') {
      hPct = clamp(o.hPct + dyPct, MIN_ELEMENTO, 100 - o.yPct);
    }
    onRedimensionarForma(st.id, { xPct, yPct, wPct, hPct });
  };

  const handleFormaPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    formaDragRef.current = null;
  };

  return (
    <div className="flex-grow flex flex-col bg-zinc-950 relative">
      {/* Barra de ferramentas */}
      <div className="h-14 flex-shrink-0 border-b border-zinc-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <button
            onClick={onDesfazer}
            disabled={!podeDesfazer}
            className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRefazer}
            disabled={!podeRefazer}
            className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Refazer (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-zinc-800 mx-2" />

          {/* Grade */}
          <div className="relative">
            <button
              onClick={() => setGradeAberta((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs font-semibold"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {getGrade(grade).nome}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {gradeAberta && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
                <p className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-zinc-600">
                  Produtos por página
                </p>
                {GRADES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => { onGradeChange(g.id); setGradeAberta(false); }}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-zinc-800 transition-colors text-left text-xs font-semibold text-zinc-200"
                  >
                    {g.nome}
                    {grade === g.id && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Frente / Verso */}
          {temVerso ? (
            <div className="flex items-center rounded-lg border border-zinc-700 overflow-hidden ml-1">
              {(['frente', 'verso'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => onLadoChange(l)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                    ladoAtivo === l ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:bg-zinc-800',
                  )}
                >
                  {l}
                </button>
              ))}
              <button
                onClick={onRemoverVerso}
                title="Remover verso"
                className="px-2 py-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors border-l border-zinc-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onAdicionarVerso}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs font-semibold ml-1"
            >
              <Copy className="w-3.5 h-3.5" />
              Verso
            </button>
          )}

          <div className="w-px h-5 bg-zinc-800 mx-2" />

          {/* Formas */}
          <div className="relative">
            <button
              onClick={() => setFormasAberta((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs font-semibold"
            >
              <Shapes className="w-3.5 h-3.5" />
              Formas
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {formasAberta && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
                <p className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-zinc-600">
                  Adicionar forma
                </p>
                {FORMAS_DISPONIVEIS.map(({ tipo, nome }) => {
                  const Icone = ICONE_FORMA[tipo];
                  return (
                    <button
                      key={tipo}
                      onClick={() => { onAdicionarForma(tipo); setFormasAberta(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-zinc-800 transition-colors text-left text-xs font-semibold text-zinc-200"
                    >
                      <Icone className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      {nome}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {TOOLBAR_ITEMS.map(({ icon: Icon, label }) => (
            <button
              key={label}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs font-semibold"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setDownloadAberto((v) => !v)}
              disabled={exportando}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase hover:bg-emerald-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exportando ? 'Gerando...' : 'Download'}
              {!exportando && <ChevronDown className="w-3 h-3 opacity-80" />}
            </button>
            {downloadAberto && (
              <div className="absolute top-full right-0 mt-1 w-52 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
                <button
                  onClick={() => baixar('png')}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-zinc-800 transition-colors text-left text-xs font-semibold text-zinc-200"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  PNG em alta qualidade
                </button>
                <button
                  onClick={() => baixar('pdf')}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-zinc-800 transition-colors text-left text-xs font-semibold text-zinc-200 border-t border-zinc-800"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  PDF em alta qualidade
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setCompartilharAberto((v) => !v)}
              disabled={exportando}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-black uppercase hover:bg-zinc-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Share2 className="w-3.5 h-3.5" />
              Compartilhar
              <ChevronDown className="w-3 h-3 opacity-80" />
            </button>
            {compartilharAberto && (
              <div className="absolute top-full right-0 mt-1 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
                <p className="px-3.5 pt-2.5 pb-1 text-[9px] font-black uppercase tracking-widest text-zinc-600">
                  Mandar PNG em alta pra
                </p>
                <button
                  onClick={() => compartilhar('whatsapp')}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-zinc-800 transition-colors text-left text-xs font-semibold text-zinc-200"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  WhatsApp
                </button>
                <button
                  onClick={() => compartilhar('email')}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-zinc-800 transition-colors text-left text-xs font-semibold text-zinc-200 border-t border-zinc-800"
                >
                  <Mail className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  E-mail
                </button>
                <button
                  onClick={() => compartilhar('instagram')}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-zinc-800 transition-colors text-left text-xs font-semibold text-zinc-200 border-t border-zinc-800"
                >
                  <Instagram className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  Instagram
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Área de preview */}
      <div
        className="flex-grow overflow-auto p-8 relative"
        onClick={() => {
          if (gradeAberta) setGradeAberta(false);
          if (formasAberta) setFormasAberta(false);
          if (downloadAberto) setDownloadAberto(false);
          if (compartilharAberto) setCompartilharAberto(false);
          if (formaSelecionadaId) setFormaSelecionadaId(null);
        }}
      >
        {produtos.length > 0 && (
          <button
            onClick={onAdicionarProdutos}
            className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-emerald-400 hover:text-emerald-300 transition-colors text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            Produtos
          </button>
        )}

        {/* Centraliza o canvas e, quando ampliado, cresce junto pra rolagem
            alcançar todas as bordas (min-w-full mantém centralizado no zoom baixo). */}
        <div className="min-h-full min-w-full w-max flex items-center justify-center">
          {/* Reserva o espaço já no tamanho ampliado — transform não empurra layout sozinho. */}
          <div
            style={{
              width: 480 * zoom,
              height: (480 / formato.ratio) * zoom,
              flexShrink: 0,
            }}
          >
            {/* Camada de zoom: só visual. O canvasRef abaixo fica sem transform,
                então o PNG/PDF sempre sai no tamanho real. */}
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <div
                ref={canvasRef}
                className="relative bg-black rounded-2xl overflow-hidden shadow-2xl"
                style={{ width: 480, aspectRatio: `${formato.ratio}` }}
              >
          {/* Fundo — preenche a caixa toda, produtos ficam por cima */}
          <div className="absolute inset-0">
            {ehFundoBuiltin(backgroundUrl) ? (
              <div className="w-full h-full" style={{ background: FUNDOS_BUILTIN[backgroundUrl] }} />
            ) : backgroundUrl ? (
              <img
                src={getProxyUrl(backgroundUrl)}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                <p className="text-[10px] text-zinc-600 font-semibold">Escolha um fundo na aba Temas</p>
              </div>
            )}
          </div>

          {/* Formas — blocos de cor arrastáveis e redimensionáveis */}
          {formas.map((fm) => {
            const selecionada = fm.id === formaSelecionadaId;
            return (
              <div
                key={fm.id}
                className="absolute group touch-none"
                style={{
                  left: `${fm.xPct}%`,
                  top: `${fm.yPct}%`,
                  width: `${fm.wPct}%`,
                  height: `${fm.hPct}%`,
                  zIndex: selecionada ? 20 : undefined,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="w-full h-full cursor-grab active:cursor-grabbing"
                  style={{ background: fm.cor, borderRadius: fm.tipo === 'circulo' ? '50%' : 0 }}
                  onPointerDown={(e) => iniciarFormaDrag(e, 'mover', fm)}
                  onPointerMove={handleFormaPointerMove}
                  onPointerUp={handleFormaPointerUp}
                  onPointerCancel={handleFormaPointerUp}
                />

                {selecionada && (
                  <>
                    {/* Barra de cor + remover — não entra no PNG exportado */}
                    <div
                      data-html2canvas-ignore="true"
                      className="absolute -top-9 left-0 flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-lg px-1.5 py-1 shadow-lg"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="color"
                        value={fm.cor}
                        onChange={(e) => onDefinirCorForma(fm.id, e.target.value)}
                        title="Cor da forma"
                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                      />
                      <button
                        onClick={() => { onRemoverForma(fm.id); setFormaSelecionadaId(null); }}
                        title="Remover forma"
                        className="p-1 text-zinc-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {(['nw', 'ne', 'sw', 'se'] as Canto[]).map((canto) => (
                      <div
                        key={canto}
                        onPointerDown={(e) => iniciarFormaDrag(e, 'resize', fm, canto)}
                        onPointerMove={handleFormaPointerMove}
                        onPointerUp={handleFormaPointerUp}
                        onPointerCancel={handleFormaPointerUp}
                        data-html2canvas-ignore="true"
                        className={cn(
                          'absolute w-3 h-3 rounded-sm bg-emerald-500 border-2 border-white shadow',
                          canto === 'nw' && 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
                          canto === 'ne' && 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
                          canto === 'sw' && 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
                          canto === 'se' && 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
                        )}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })}

          {/* Divisores de seção — faixa da largura toda, arrastável na vertical */}
          {divisores.map((d) => (
            <div
              key={d.id}
              className="absolute left-0 right-0 touch-none cursor-ns-resize flex items-center gap-2 px-4"
              style={{ top: `${d.yPct}%` }}
              onPointerDown={(e) => iniciarDrag(e, 'divisor', d.id, 0, d.yPct)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e)}
              onPointerCancel={(e) => handlePointerUp(e)}
            >
              <span className="h-0.5 flex-1 rounded-full" style={{ background: '#e8850c', opacity: 0.5 }} />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] whitespace-nowrap" style={{ color: '#e8850c' }}>
                {d.texto || 'Seção'}
              </span>
              <span className="h-0.5 flex-1 rounded-full" style={{ background: '#e8850c', opacity: 0.5 }} />
            </div>
          ))}

          {produtos.length === 0 ? (
            <button
              onClick={onAdicionarProdutos}
              data-html2canvas-ignore="true"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 hover:bg-black/20 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-zinc-900/80 backdrop-blur flex items-center justify-center">
                <Package className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-xs font-semibold text-white drop-shadow">Adicionar produtos no encarte</p>
            </button>
          ) : (
            <div className="absolute inset-0">
              {produtos.map((ep) => (
                <div
                  key={ep.product.id}
                  className="absolute touch-none cursor-grab active:cursor-grabbing"
                  style={{ left: `${ep.xPct}%`, top: `${ep.yPct}%` }}
                  onPointerDown={(e) => iniciarDrag(e, 'produto', ep.product.id, ep.xPct, ep.yPct)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => handlePointerUp(e, () => onAbrirDetalhes(ep.product.id))}
                  onPointerCancel={(e) => handlePointerUp(e)}
                >
                  <EncarteProductCard
                    produto={ep}
                    estilo={estilo}
                    selecionado={ep.product.id === produtoDetalhadoId}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Imagens livres — logos, selos, adesivos: arrastar e redimensionar pelos cantos */}
          {imagens.map((im) => (
            <div
              key={im.id}
              className="absolute group touch-none"
              style={{ left: `${im.xPct}%`, top: `${im.yPct}%`, width: `${im.wPct}%`, height: `${im.hPct}%` }}
            >
              <div
                className="w-full h-full cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => iniciarImagemDrag(e, 'mover', im)}
                onPointerMove={handleImagemPointerMove}
                onPointerUp={handleImagemPointerUp}
                onPointerCancel={handleImagemPointerUp}
              >
                <img
                  src={getProxyUrl(im.url)}
                  className="w-full h-full object-contain pointer-events-none"
                  draggable={false}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                />
              </div>

              <button
                onClick={() => onRemoverImagem(im.id)}
                onPointerDown={(e) => e.stopPropagation()}
                data-html2canvas-ignore="true"
                title="Remover imagem"
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>

              {(['nw', 'ne', 'sw', 'se'] as Canto[]).map((canto) => (
                <div
                  key={canto}
                  onPointerDown={(e) => iniciarImagemDrag(e, 'resize', im, canto)}
                  onPointerMove={handleImagemPointerMove}
                  onPointerUp={handleImagemPointerUp}
                  onPointerCancel={handleImagemPointerUp}
                  data-html2canvas-ignore="true"
                  className={cn(
                    'absolute w-3 h-3 rounded-sm bg-emerald-500 border-2 border-white shadow opacity-0 group-hover:opacity-100 transition-opacity',
                    canto === 'nw' && 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
                    canto === 'ne' && 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
                    canto === 'sw' && 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
                    canto === 'se' && 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
                  )}
                />
              ))}
            </div>
          ))}

          {/* Rodapé */}
          {rodape.ativo && (
            <div
              className="absolute bottom-0 left-0 right-0 text-center py-2 px-3 text-[10px] font-semibold tracking-wide"
              style={{ color: '#e8850c', background: 'rgba(255,255,255,0.55)' }}
            >
              {rodape.texto}
            </div>
          )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Páginas / lados */}
      <div className="absolute top-[4.5rem] right-4 bg-zinc-900 border border-zinc-800 rounded-xl p-2 w-16">
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 text-center mb-1.5">Páginas</p>
        <div className="space-y-1.5">
          {(temVerso ? (['frente', 'verso'] as const) : (['frente'] as const)).map((l, i) => (
            <button
              key={l}
              onClick={() => onLadoChange(l)}
              className={cn(
                'w-full rounded-lg border-2 bg-zinc-800 flex items-end justify-center pb-1 transition-colors',
                ladoAtivo === l ? 'border-emerald-500' : 'border-zinc-700 hover:border-zinc-500',
              )}
              style={{ aspectRatio: `${formato.ratio}` }}
            >
              <span className="text-[10px] font-bold text-zinc-400">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Zoom */}
      <div className="absolute bottom-4 right-4 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-1 px-2 py-1.5">
        <button
          onClick={() => ajustarZoom(-ZOOM_STEP)}
          disabled={zoom <= ZOOM_MIN}
          title="Diminuir zoom"
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoom(1)}
          title="Restaurar zoom (100%)"
          className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200 transition-colors w-9 text-center"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => ajustarZoom(ZOOM_STEP)}
          disabled={zoom >= ZOOM_MAX}
          title="Aumentar zoom"
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
