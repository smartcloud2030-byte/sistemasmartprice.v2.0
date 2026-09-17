import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Package, RotateCcw } from 'lucide-react';
import { getProxyUrl, cn, clamp } from '../../lib/utils';
import {
  EncarteProduto,
  EstiloEncarte,
  FormaEtiqueta,
  CARD_W,
  partesPreco,
  protegerMedidaNoTexto,
  escureceHex,
  SVG_ETIQUETA,
  AjusteFotoProduto,
  Canto,
} from './encarteProduto';

interface EncarteProductCardProps {
  produto: EncarteProduto;
  estilo: EstiloEncarte;
  selecionado?: boolean;
  /** foto "solta" do lugar padrão (depois do duplo clique nela) está selecionada — mostra alças. */
  fotoSelecionada?: boolean;
  onSelecionarFoto?: () => void;
  /**
   * `null` restaura a foto pro lugar padrão do modelo de card. `opcoes.coalesce`
   * agrupa a rajada de mudanças de um arraste inteiro num passo só de desfazer
   * (mesmo esquema de `onMoverImagem`/`onRedimensionarImagem` — sem isso, cada
   * pixel de movimento virava um passo de undo separado e o arraste ficava
   * ruim de usar).
   */
  onAjustarFoto?: (ajuste: AjusteFotoProduto | null, opcoes?: { coalesce?: string }) => void;
}

/**
 * Cor dourada do preço em texto (era um degradê com `background-clip: text`,
 * mas o html2canvas-pro não implementa essa propriedade — no export virava
 * um retângulo sólido com o texto invisível, já que o `color: transparent`
 * é respeitado mas o clip no fundo, não). Cor sólida sai idêntica na tela e
 * no PNG/PDF, garantindo que o preço nunca suma no export.
 */
const PRECO_LARANJA: React.CSSProperties = {
  color: '#ef9d1c',
};

/**
 * Fundo + sombra dos cards — mesma lógica da sombra da foto: `box-shadow`
 * em CSS (mesmo em valor literal, sem `var()`) provou repetidas vezes não
 * sair no export do html2canvas-pro, então em vez de insistir nele o card
 * inteiro (forma arredondada na cor de fundo + sombra) é ASSADO num PNG só
 * e colocado atrás do conteúdo (texto/preço/foto), que fica sobre um card
 * "real" TRANSPARENTE (sem `background-color` própria). Sai igual em tela
 * e export — os dois só exibem/capturam a mesma imagem estática.
 *
 * Antes disso, o card real (com fundo colorido de verdade) ficava por cima
 * de uma sombra assada SEPARADA e propositalmente menor (margem) pra ficar
 * escondida por baixo — eram DOIS desenhos independentes (um PNG, um
 * `border-radius` do navegador) que precisavam alinhar em pixel exato, e
 * qualquer diferença de 1-2px sobrava como fresta ou borda preta sólida
 * (várias rodadas de tentativa: destination-out, clip, blur no apagamento,
 * margem generosa — todas ainda dependiam desse alinhamento). Assando o
 * fundo de verdade JUNTO da sombra, no mesmo `roundRect`, os dois nunca
 * podem desalinhar entre si — não sobra card nenhum por baixo pra vazar.
 */
interface SombraCardAssada {
  url: string;
  pad: number;
}

// Assa o PNG numa resolução bem maior que o tamanho lógico (CSS) do card —
// o export em A4 amplia tudo em ~5-10x (`QUALIDADE_DOWNLOAD`), e um PNG
// assado só no tamanho de tela (~200x128px) saía borrado nessa ampliação.
// O `pad` retornado continua em unidade lógica (1x) — só afeta o CSS de
// posicionamento, o canvas em si é maior por dentro (feito o `object-fit`
// de uma imagem @2x/@3x normal).
const RESOLUCAO_EXTRA = 4;

function criarFundoCard(w: number, h: number, raio: number, blur: number, offsetY: number, opacidade: number, cor: string): SombraCardAssada {
  const pad = Math.ceil(blur + Math.max(offsetY, 0) + 4);
  const e = RESOLUCAO_EXTRA;
  const canvas = document.createElement('canvas');
  canvas.width = (Math.ceil(w) + pad * 2) * e;
  canvas.height = (Math.ceil(h) + pad * 2) * e;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { url: '', pad };
  // Um único preenchimento na cor real do card, com sombra ligada — a
  // sombra some do lado de fora (blur) e a própria forma preenchida É o
  // fundo visível, não uma cópia escondida atrás de outro fundo.
  ctx.shadowColor = `rgba(0,0,0,${opacidade})`;
  ctx.shadowBlur = blur * e;
  ctx.shadowOffsetY = offsetY * e;
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.roundRect(pad * e, pad * e, w * e, h * e, raio * e);
  ctx.fill();
  return { url: canvas.toDataURL('image/png'), pad };
}

// Cache por combinação de tamanho/raio/cor — a cor de fundo é escolhida
// pelo usuário (slider/paleta) e pode mudar a qualquer momento, então não
// dá mais pra assar uma vez só no import (como quando a forma era sempre
// preta). `toDataURL` é síncrono e o canvas é pequeno, então recalcular só
// quando a combinação muda (e reaproveitar entre cards do mesmo estilo) é
// suficiente — sem precisar de debounce nem de estado assíncrono.
const cacheFundoCard = new Map<string, SombraCardAssada>();
const isBrowser = typeof document !== 'undefined';

function fundoCard(w: number, h: number, raio: number, blur: number, offsetY: number, opacidade: number, cor: string): SombraCardAssada {
  if (!isBrowser) return { url: '', pad: 0 };
  const chave = `${w}|${h}|${raio}|${blur}|${offsetY}|${opacidade}|${cor}`;
  const emCache = cacheFundoCard.get(chave);
  if (emCache) return emCache;
  const resultado = criarFundoCard(w, h, raio, blur, offsetY, opacidade, cor);
  cacheFundoCard.set(chave, resultado);
  return resultado;
}

// offsetY baixo (quase 0) de propósito: um offset grande empurra a sombra
// pra baixo e deixa em cima quase sem nada — parecia sombra "só na metade"
// do card. Blur bem maior + sombra praticamente centrada dá o efeito
// ambiente, suave e por igual nos 4 lados que foi pedido.
function FundoSombraCard({ destaque, raio, cor }: { destaque?: boolean; raio: number; cor: string }) {
  const { url, pad } = destaque
    ? fundoCard(CARD_W * 2.2, 128, raio, 38, 5, 0.24, cor)
    : fundoCard(CARD_W, 128, raio, 34, 4, 0.22, cor);
  if (!url) return null;
  return (
    <img
      aria-hidden
      src={url}
      className="pointer-events-none select-none absolute"
      style={{
        top: -pad,
        left: -pad,
        // `maxWidth: none` desfaz o reset global do Tailwind (`img{max-width:100%}`)
        // — sem isso o `width` abaixo (maior que 100% do card, de propósito, pra
        // sobrar espaço pro halo da sombra) era CLAMPADO de volta pra 100% do
        // card real, então essa imagem saía mais ESTREITA que o combinado e
        // ficava espremida (esticada só na altura, que não tem o mesmo limite)
        // dentro do espaço de `left:-pad`. Era essa distorção horizontal —
        // não a sombra em si — a causa real da borda preta na lateral esquerda
        // em toda a série de tentativas anteriores (a altura nunca teve esse
        // problema, só a largura, por isso o defeito só aparecia de um lado).
        maxWidth: 'none',
        maxHeight: 'none',
        width: `calc(100% + ${pad * 2}px)`,
        height: `calc(100% + ${pad * 2}px)`,
        zIndex: -1,
      }}
    />
  );
}

/**
 * Sombra da foto do produto — MESMA técnica do editor de plaquinhas
 * (`CanvasPreview.tsx`: `<KonvaImage shadowColor shadowBlur shadowOffsetY>`,
 * que desenha a sombra no Canvas 2D nativo do navegador). Aqui não tem Konva
 * — em vez de aplicar a sombra "ao vivo" via CSS (impossível: `filter` não
 * existe no html2canvas-pro), a gente ASSA a sombra nos pixels da própria
 * imagem usando esse MESMO Canvas 2D nativo (`ctx.shadowBlur`/`shadowColor`/
 * `shadowOffsetY`) como pré-processamento, uma vez por foto, e usa o
 * resultado como uma imagem comum. Sai igual na tela e no export porque os
 * dois só exibem/capturam uma imagem estática — nenhum dos dois depende de
 * o html2canvas entender sombra de imagem, ela já vem pronta no arquivo.
 */
const cacheFotoComSombra = new Map<string, Promise<string>>();

function fotoComSombra(src: string): Promise<string> {
  const emCache = cacheFotoComSombra.get(src);
  if (emCache) return emCache;
  const promise = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error('imagem sem dimensões'));
        return;
      }
      // Blur/offset proporcionais à largura da foto (mesma proporção do
      // shadowBlur=16/shadowOffsetY=10 da plaquinha, calibrados lá pra fotos
      // de produto no mesmo estilo) — assim fica consistente em fotos de
      // qualquer resolução, não só a de referência.
      const blur = Math.max(6, w * 0.045);
      const offsetY = w * 0.028;
      // Preenchimento assimétrico: a sombra só desce (sem offsetX), então só
      // precisa de espaço extra de verdade embaixo. Padding igual nos 4 lados
      // desperdiçaria área e encolheria a foto visível mais do que precisa.
      const padX = Math.ceil(blur + 2);
      const padTop = Math.ceil(blur + 2);
      const padBottom = Math.ceil(blur + offsetY + 2);
      const canvas = document.createElement('canvas');
      canvas.width = w + padX * 2;
      canvas.height = h + padTop + padBottom;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('sem contexto 2d'));
        return;
      }
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = blur;
      ctx.shadowOffsetY = offsetY;
      ctx.drawImage(img, padX, padTop, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('falha ao carregar imagem pra assar sombra'));
    img.src = src;
  });
  cacheFotoComSombra.set(src, promise);
  return promise;
}

// Quanto a foto solta pode encolher (%, relativo ao card) e passar da borda
// do card ao mover/redimensionar — o usuário pode querer ela bem maior que
// o card ou deslocada pra fora dele de propósito (ver AjusteFotoProduto).
const MIN_FOTO_PCT = 8;
const SANGRIA_FOTO_PCT = 150;

interface FotoDragState {
  tipo: 'mover' | 'resize';
  canto?: Canto;
  pointerId: number;
  startX: number;
  startY: number;
  orig: AjusteFotoProduto;
}

/**
 * Foto do produto solta do lugar padrão do card — duplo clique nela (ver
 * `iniciarAjusteFoto` em `EncarteProductCard`) tira ela do fluxo normal e
 * passa a desenhar aqui, por cima de tudo, com posição/tamanho próprios
 * (mesmo esquema de arraste/redimensionamento das imagens livres do
 * canvas, só que em % relativas ao CARD em vez do canvas inteiro).
 */
function FotoAjustavel({
  ajuste,
  foto,
  selecionada,
  wrapperRef,
  onSelecionar,
  onAjustar,
  onResetar,
}: {
  ajuste: AjusteFotoProduto;
  foto: React.ReactNode;
  selecionada: boolean;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  onSelecionar: () => void;
  /** `chaveCoalesce` identifica o GESTO (mover, ou redimensionar por um canto
   * específico) — agrupa toda a rajada de um mesmo arraste num passo só de
   * desfazer, sem juntar um arraste com o próximo. */
  onAjustar: (ajuste: AjusteFotoProduto, chaveCoalesce: string) => void;
  onResetar: () => void;
}) {
  const dragRef = useRef<FotoDragState | null>(null);

  const iniciar = (e: React.PointerEvent<HTMLDivElement>, tipo: 'mover' | 'resize', canto?: Canto) => {
    e.stopPropagation();
    onSelecionar();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { tipo, canto, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, orig: ajuste };
  };

  const mover = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!st || !rect || e.pointerId !== st.pointerId) return;
    const dxPct = ((e.clientX - st.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - st.startY) / rect.height) * 100;
    const o = st.orig;
    const chaveCoalesce = st.tipo === 'mover' ? 'mover' : `resize-${st.canto}`;

    if (st.tipo === 'mover') {
      onAjustar(
        {
          ...o,
          xPct: clamp(o.xPct + dxPct, -SANGRIA_FOTO_PCT, 100 + SANGRIA_FOTO_PCT - o.wPct),
          yPct: clamp(o.yPct + dyPct, -SANGRIA_FOTO_PCT, 100 + SANGRIA_FOTO_PCT - o.hPct),
        },
        chaveCoalesce,
      );
      return;
    }

    let { xPct, yPct, wPct, hPct } = o;
    const oesteMax = o.xPct + o.wPct - MIN_FOTO_PCT;
    const norteMax = o.yPct + o.hPct - MIN_FOTO_PCT;
    if (st.canto === 'nw' || st.canto === 'sw') {
      xPct = clamp(o.xPct + dxPct, -SANGRIA_FOTO_PCT, oesteMax);
      wPct = o.xPct + o.wPct - xPct;
    }
    if (st.canto === 'ne' || st.canto === 'se') {
      wPct = clamp(o.wPct + dxPct, MIN_FOTO_PCT, 100 + SANGRIA_FOTO_PCT - o.xPct);
    }
    if (st.canto === 'nw' || st.canto === 'ne') {
      yPct = clamp(o.yPct + dyPct, -SANGRIA_FOTO_PCT, norteMax);
      hPct = o.yPct + o.hPct - yPct;
    }
    if (st.canto === 'sw' || st.canto === 'se') {
      hPct = clamp(o.hPct + dyPct, MIN_FOTO_PCT, 100 + SANGRIA_FOTO_PCT - o.yPct);
    }
    onAjustar({ xPct, yPct, wPct, hPct }, chaveCoalesce);
  };

  const soltar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  return (
    <div
      // marca pro EncarteCanvas reconhecer clique "dentro de alguma foto solta"
      // vs. clique fora — ver onPointerDownCapture no container do canvas.
      data-foto-overlay="true"
      className="absolute touch-none"
      // z-10 é a camada da etiqueta de preço (e do texto) nos 4 modelos de
      // card — abaixo disso de propósito, pra foto solta redimensionada
      // nunca cobrir a etiqueta, mesmo passando por cima dela.
      style={{ left: `${ajuste.xPct}%`, top: `${ajuste.yPct}%`, width: `${ajuste.wPct}%`, height: `${ajuste.hPct}%`, zIndex: 5 }}
    >
      <div
        className={cn('w-full h-full cursor-grab active:cursor-grabbing', selecionada && 'outline outline-1 outline-emerald-400/70')}
        onPointerDown={(e) => iniciar(e, 'mover')}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onClick={(e) => e.stopPropagation()}
      >
        {foto}
      </div>

      {selecionada && (
        <button
          onClick={(e) => { e.stopPropagation(); onResetar(); }}
          onPointerDown={(e) => e.stopPropagation()}
          data-html2canvas-ignore="true"
          title="Restaurar a foto pro lugar padrão do card"
          className="absolute -top-8 right-0 flex items-center justify-center w-6 h-6 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/50 shadow-lg transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}

      {selecionada &&
        (['nw', 'ne', 'sw', 'se'] as Canto[]).map((canto) => (
          <div
            key={canto}
            onPointerDown={(e) => iniciar(e, 'resize', canto)}
            onPointerMove={mover}
            onPointerUp={soltar}
            onPointerCancel={soltar}
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
    </div>
  );
}

export default function EncarteProductCard({
  produto,
  estilo,
  selecionado,
  fotoSelecionada,
  onSelecionarFoto,
  onAjustarFoto,
}: EncarteProductCardProps) {
  const { product } = produto;
  const medida = [produto.medidaQtd, produto.medidaUnidade].filter(Boolean).join(' ').trim();

  // Sem thumbnail aqui de propósito: o card é exportado em alta qualidade
  // (scale alto no download), e a miniatura de 400px ficaria borrada ampliada.
  const fotoSrc = getProxyUrl(product.image || product.thumb_image);
  const [fotoSombraUrl, setFotoSombraUrl] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    setFotoSombraUrl(null);
    if (fotoSrc) {
      fotoComSombra(fotoSrc)
        .then((url) => {
          if (ativo) setFotoSombraUrl(url);
        })
        .catch(() => {
          /* fica na foto sem sombra (fotoSrc) se a sombra falhar */
        });
    }
    return () => {
      ativo = false;
    };
  }, [fotoSrc]);
  const foto = product.image ? (
    <img
      src={fotoSombraUrl ?? fotoSrc}
      className="w-full h-full object-contain"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
    />
  ) : (
    <Package className="w-6 h-6 text-zinc-300" />
  );

  const largura = produto.emDestaque ? CARD_W * 2.2 : CARD_W;

  // A foto solta (fora do fluxo normal, ver FotoAjustavel) precisa medir o
  // card real pra converter posição/tamanho em % relativas a ele.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const temAjusteFoto = !!produto.fotoAjuste;

  /**
   * Duplo clique na foto (só quando ainda no lugar padrão): mede a caixa
   * onde ela está agora (relativa ao card) e usa isso como ponto de partida
   * do ajuste manual — a foto "solta" nasce exatamente onde já estava, sem
   * pulo, e passa a poder ser arrastada/redimensionada livremente.
   */
  const iniciarAjusteFoto = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!product.image || temAjusteFoto || !onAjustarFoto) return;
    e.stopPropagation();
    const wrapperEl = wrapperRef.current;
    if (!wrapperEl) return;
    const wRect = wrapperEl.getBoundingClientRect();
    const sRect = e.currentTarget.getBoundingClientRect();
    if (!wRect.width || !wRect.height) return;
    onAjustarFoto({
      xPct: ((sRect.left - wRect.left) / wRect.width) * 100,
      yPct: ((sRect.top - wRect.top) / wRect.height) * 100,
      wPct: (sRect.width / wRect.width) * 100,
      hPct: (sRect.height / wRect.height) * 100,
    });
    onSelecionarFoto?.();
  };
  // Enquanto a foto ainda está no lugar padrão, o slot onde ela mora dentro
  // do modelo de card escuta o duplo clique — mas não pode deixar o
  // pointerdown subir até o card (senão o card inteiro começa a ser
  // arrastado, ou abre os Detalhes do produto no soltar do dedo/mouse).
  const podeAjustarFoto = !!product.image && !temAjusteFoto && !!onAjustarFoto;
  const onFotoSlotPointerDown = podeAjustarFoto ? (e: React.PointerEvent<HTMLDivElement>) => e.stopPropagation() : undefined;
  const onFotoSlotDoubleClick = podeAjustarFoto ? iniciarAjusteFoto : undefined;
  // Com a foto solta, o slot original fica vazio (mas do MESMO tamanho) —
  // é assim que o texto/preço do card não mudam de lugar (ver nota em
  // FotoAjustavel): a foto de verdade passa a ser desenhada por cima, solta.
  const fotoNoSlot = temAjusteFoto ? null : foto;

  // Renderizada DENTRO de cada modelo de card (não como irmã aqui fora) de
  // propósito: Padrão/Clean/"em destaque" têm zIndex:0 na raiz (contém o
  // vazamento da sombra assada, ver FundoSombraCard) — isso cria um
  // contexto de empilhamento PRÓPRIO que isola a etiqueta de preço (z-10
  // lá dentro) de qualquer coisa FORA dele. Uma foto solta irmã aqui fora,
  // mesmo com z-index bem maior, nunca conseguia ficar atrás dessa etiqueta
  // (o card inteiro pinta como bloco único primeiro) — só sobra atrás dela
  // desenhando a foto DENTRO do mesmo contexto, disputando o mesmo z-10.
  const fotoAjustavelNode =
    temAjusteFoto && produto.fotoAjuste && onAjustarFoto ? (
      <FotoAjustavel
        ajuste={produto.fotoAjuste}
        foto={foto}
        selecionada={!!fotoSelecionada}
        wrapperRef={wrapperRef}
        onSelecionar={() => onSelecionarFoto?.()}
        onAjustar={(ajuste, chaveCoalesce) => onAjustarFoto(ajuste, { coalesce: `ajustar-foto-${chaveCoalesce}-${produto.product.id}` })}
        onResetar={() => onAjustarFoto(null)}
      />
    ) : null;

  return (
    <div
      ref={wrapperRef}
      className="relative select-none"
      style={{ width: largura, transform: `scale(${estilo.escalaCard})`, transformOrigin: 'top left' }}
    >
      {produto.emDestaque ? (
        <CardProdutoDestaque
          produto={produto}
          estilo={estilo}
          medida={medida}
          foto={fotoNoSlot}
          onFotoSlotPointerDown={onFotoSlotPointerDown}
          onFotoSlotDoubleClick={onFotoSlotDoubleClick}
          fotoAjustavelNode={fotoAjustavelNode}
        />
      ) : estilo.modeloCard === 'destaque' ? (
        <CardDestaque
          produto={produto}
          estilo={estilo}
          medida={medida}
          foto={fotoNoSlot}
          onFotoSlotPointerDown={onFotoSlotPointerDown}
          onFotoSlotDoubleClick={onFotoSlotDoubleClick}
          fotoAjustavelNode={fotoAjustavelNode}
        />
      ) : estilo.modeloCard === 'clean' ? (
        <CardClean
          produto={produto}
          estilo={estilo}
          medida={medida}
          foto={fotoNoSlot}
          onFotoSlotPointerDown={onFotoSlotPointerDown}
          onFotoSlotDoubleClick={onFotoSlotDoubleClick}
          fotoAjustavelNode={fotoAjustavelNode}
        />
      ) : (
        <CardPadrao
          produto={produto}
          estilo={estilo}
          medida={medida}
          foto={fotoNoSlot}
          onFotoSlotPointerDown={onFotoSlotPointerDown}
          onFotoSlotDoubleClick={onFotoSlotDoubleClick}
          fotoAjustavelNode={fotoAjustavelNode}
        />
      )}

      {selecionado && (
        <div
          data-html2canvas-ignore="true"
          className="pointer-events-none absolute -inset-0.5 rounded-2xl ring-2 ring-emerald-400"
        />
      )}
    </div>
  );
}

interface CardProps {
  produto: EncarteProduto;
  estilo: EstiloEncarte;
  medida: string;
  foto: React.ReactNode;
  onFotoSlotPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onFotoSlotDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Foto solta (ver nota acima de `fotoAjustavelNode`) — cada modelo desenha
   * isso DENTRO da própria raiz, pra disputar o mesmo contexto de
   * empilhamento da etiqueta de preço em vez de ficar isolado fora dele. */
  fotoAjustavelNode?: React.ReactNode;
}

/**
 * Encolhe o conteúdo só o quanto precisar pra caber no espaço disponível
 * (largura e altura) — o texto aparece inteiro, sem "..." e sem cortar, e
 * a etiqueta nunca estoura a caixa.
 */
function AutoAjuste({
  sig,
  origem = 'top left',
  min = 0.4,
  transbordar = false,
  className,
  children,
}: {
  sig: string;
  origem?: string;
  min?: number;
  /**
   * Quando `true`: NUNCA corta e NUNCA encolhe pela largura. Serve pra
   * etiqueta de preço — o usuário aumenta ela no slider "Etiqueta" e quer ela
   * inteira, passando por cima da foto / pra fora do card se precisar
   * (`overflow-visible` + z-index acima da foto no card). A altura ainda é
   * respeitada só como trava de segurança.
   */
  transbordar?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const medir = () => {
      // dimensões naturais do conteúdo (o transform não afeta scroll*)
      const dh = wrap.clientHeight;
      const nh = inner.scrollHeight;
      const dw = wrap.clientWidth;
      const nw = inner.scrollWidth;
      const rH = dh > 0 && nh > dh + 0.5 ? dh / nh : 1;
      const rW = transbordar ? 1 : dw > 0 && nw > dw + 0.5 ? dw / nw : 1;
      const alvo = Math.max(min, Math.min(rH, rW));
      setEscala((p) => (Math.abs(p - alvo) > 0.02 ? alvo : p));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [sig, min, transbordar]);

  return (
    <div ref={wrapRef} className={cn(transbordar ? 'overflow-visible' : 'overflow-hidden', className)}>
      <div ref={innerRef} style={{ transformOrigin: origem, transform: escala < 1 ? `scale(${escala})` : undefined }}>
        {children}
      </div>
    </div>
  );
}

/** Preço: "R$" pequeno + inteiro grande + centavos sobrescrito. */
function Preco({
  valor,
  tamanho,
  variante,
  cor,
}: {
  valor: string;
  tamanho: number;
  variante: 'etiqueta' | 'texto';
  cor?: string;
}) {
  const { inteiro, centavos } = partesPreco(valor);
  const style =
    variante === 'texto'
      ? cor
        ? { color: cor }
        : PRECO_LARANJA
      : { color: cor || '#ffffff' };
  return (
    <span
      className="inline-flex items-start font-black leading-none"
      style={{ fontSize: tamanho, ...style }}
    >
      <span className="font-bold" style={{ fontSize: '0.42em', marginTop: '0.25em', marginRight: '0.1em' }}>
        R$
      </span>
      <span>{inteiro}</span>
      {centavos && (
        <span className="font-bold" style={{ fontSize: '0.42em', marginTop: '0.18em' }}>
          ,{centavos}
        </span>
      )}
    </span>
  );
}

/**
 * Preço da etiqueta no arranjo do encarte (igual ao modelo impresso):
 *
 *   POR            2 4  , ⁶⁹
 *   R$                     UNI
 *
 * Coluna "POR / R$" à esquerda (POR no topo, R$ colado na base do número),
 * número inteiro grande dominante, vírgula na base + centavos elevados,
 * e "UNI" colado na base à direita. Sempre com POR e UNI.
 */
function PrecoEtiqueta({
  valor,
  tamanho,
  cor,
  dourado = false,
  escalaRotulos = 1,
  escalaCentavos = 0.54,
  textoProduto,
  escalaTextoProduto,
  corTextoProduto,
}: {
  valor: string;
  tamanho: number;
  cor?: string;
  /** Preço em degradê dourado com efeito (o mesmo do preço em texto). Ignora `cor`. */
  dourado?: boolean;
  /** Multiplica o tamanho de POR / R$ / UNI. < 1 diminui os rótulos e deixa o preço em evidência. */
  escalaRotulos?: number;
  /** Tamanho dos centavos em `em` (relativo ao inteiro). Padrão 0.54. */
  escalaCentavos?: number;
  /** Texto solto (ex.: "LEVE 3 PAGUE 2") como uma faixa própria no TOPO da
   * etiqueta, centralizada e ocupando a largura toda da caixa — a linha
   * POR/R$/preço/UN fica embaixo, encolhida na mesma proporção pra caber
   * na MESMA altura de sempre, sem a etiqueta crescer. */
  textoProduto?: string;
  escalaTextoProduto?: number;
  corTextoProduto?: string;
}) {
  const { inteiro, centavos } = partesPreco(valor);
  const temTexto = !!textoProduto?.trim();
  // "15%" (qualquer número seguido de %) no preço de oferta vira etiqueta de
  // desconto — "POR"/"R$" saem e entra um único rótulo "COM".
  const ehPercentual = /^\d+([.,]\d+)?\s*%$/.test((valor || '').trim());
  // O preço encolhe uma vez, só por TER texto prod (abre espaço pra faixa
  // no topo sem a etiqueta crescer) — mas fica FIXO nesse tamanho depois
  // disso. Quem cresce/encolhe com o slider "Tamanho" é só a faixa do
  // texto prod; o preço não fica menor conforme o texto aumenta.
  const fracaoBanner = temTexto ? 0.3 * (escalaTextoProduto ?? 1) : 0;
  const tamanhoEfetivo = temTexto ? tamanho * 0.72 : tamanho;
  return (
    <span className="inline-flex flex-col items-start" style={{ fontSize: tamanho }}>
      {temTexto && (
        <span
          className="font-black uppercase leading-none whitespace-nowrap text-left"
          style={{ fontSize: `${fracaoBanner}em`, color: corTextoProduto, marginBottom: '0.08em' }}
        >
          {textoProduto}
        </span>
      )}
      <span
        className="inline-flex items-stretch font-black uppercase leading-none"
        style={dourado ? { fontSize: tamanhoEfetivo, ...PRECO_LARANJA } : { fontSize: tamanhoEfetivo, color: cor }}
      >
        {/* POR + R$ (padrão) — ou só "COM" quando o preço de oferta é um percentual (ex.: "15%") */}
        <span
          className={cn(
            'self-stretch flex flex-col items-start leading-none pr-[0.06em] gap-[0.02em]',
            ehPercentual ? 'justify-center' : 'justify-start',
          )}
        >
          {ehPercentual ? (
            <span className="leading-none" style={{ fontSize: `${0.28 * escalaRotulos}em`, letterSpacing: '0.02em' }}>COM</span>
          ) : (
            <>
              <span className="leading-none" style={{ fontSize: `${0.36 * escalaRotulos}em`, letterSpacing: '0.02em' }}>POR</span>
              <span className="leading-none" style={{ fontSize: `${0.34 * escalaRotulos}em` }}>R$</span>
            </>
          )}
        </span>

        {/* número inteiro — dominante (levemente menor no percentual, ex.: "15%") */}
        <span className="leading-none" style={ehPercentual ? { fontSize: '0.92em' } : undefined}>{inteiro}</span>

        {/* vírgula (meio) + centavos elevados */}
        {centavos && (
          <span className="self-stretch flex leading-none" style={{ fontSize: `${escalaCentavos}em` }}>
            <span className="self-center">,</span>
            <span className="self-start">{centavos}</span>
          </span>
        )}

        {/* UNI — colado na base, puxado pra esquerda (bem perto dos centavos); no
            percentual não tem centavos empurrando ele, então afasta um pouco do "%" */}
        <span
          className="self-stretch flex flex-col items-start justify-end leading-none"
          style={{ marginLeft: ehPercentual ? '0.1em' : '-0.16em' }}
        >
          <span className="leading-none" style={{ fontSize: `${0.24 * escalaRotulos}em`, letterSpacing: '0.04em' }}>UN</span>
        </span>
      </span>
    </span>
  );
}

// ── Etiqueta de preço — formas + acabamentos ────────────────────────

function EtiquetaPreco({
  estilo,
  precoOferta,
  precoDe,
  tamanho,
  alinharDireita,
  textoProduto,
  escalaTextoProduto,
  corTextoProduto,
}: {
  estilo: EstiloEncarte;
  precoOferta: string;
  precoDe: string;
  tamanho: number;
  alinharDireita?: boolean;
  textoProduto?: string;
  escalaTextoProduto?: number;
  corTextoProduto?: string;
}) {
  const forma: FormaEtiqueta = estilo.formaEtiqueta ?? 'retangulo';
  const acab = estilo.acabamentoEtiqueta ?? 'solida';
  const cor = estilo.corEtiqueta;
  const contorno = acab === 'contorno';
  const corTexto = contorno ? cor : '#ffffff';
  const svgPath = SVG_ETIQUETA[forma];
  const compacta = forma === 'selo' || forma === 'circulo';

  const wrapCls = alinharDireita
    ? 'inline-flex flex-col items-end gap-0.5'
    : 'inline-flex flex-col items-start gap-0.5';
  const origem = alinharDireita ? 'bottom right' : 'bottom left';

  // "Só preço" — sem caixa
  if (forma === 'nenhuma') {
    return (
      <span className={wrapCls} style={{ transform: `scale(${estilo.escalaEtiqueta})`, transformOrigin: origem }}>
        <TextoProduto texto={textoProduto} escala={escalaTextoProduto} origem={origem} cor={corTextoProduto} />
        <PrecoDe valor={precoDe} />
        <Preco valor={precoOferta} tamanho={tamanho + 8} variante="texto" cor={cor} />
      </span>
    );
  }

  // padding mínimo: o preço preenche a etiqueta (igual ao modelo impresso)
  const padX = compacta ? 12 : forma === 'arredondada' ? 9 : forma === 'fita' ? 13 : forma === 'retangulo' ? 5 : 7;
  const padY = compacta ? 10 : 1;
  const padLeft = forma === 'tag' ? 17 : forma === 'fita' ? 15 : padX;

  const estiloCaixa: React.CSSProperties = {
    paddingTop: padY,
    paddingBottom: padY,
    paddingLeft: padLeft,
    paddingRight: padX,
    minWidth: compacta ? 56 : undefined,
  };

  if (!svgPath) {
    // retângulo / pílula / círculo → só border-radius
    estiloCaixa.borderRadius = forma === 'retangulo' ? 6 : 9999;
    if (contorno) {
      estiloCaixa.border = `2px solid ${cor}`;
      estiloCaixa.background = 'transparent';
    } else if (acab === 'degrade') {
      estiloCaixa.backgroundImage = `linear-gradient(160deg, ${cor}, ${escureceHex(cor)})`;
    } else {
      estiloCaixa.backgroundColor = cor;
    }
  }

  const gid = `etq-grad-${forma}`;

  return (
    <span className={wrapCls} style={{ transform: `scale(${estilo.escalaEtiqueta})`, transformOrigin: origem }}>
      <PrecoDe valor={precoDe} />
      <span className="relative inline-flex items-center justify-center" style={estiloCaixa}>
        {svgPath && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
            {acab === 'degrade' && (
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cor} />
                  <stop offset="100%" stopColor={escureceHex(cor)} />
                </linearGradient>
              </defs>
            )}
            <path
              d={svgPath}
              fill={contorno ? 'none' : acab === 'degrade' ? `url(#${gid})` : cor}
              stroke={contorno ? cor : 'none'}
              strokeWidth={contorno ? 4 : 0}
              strokeLinejoin="round"
            />
            {forma === 'tag' && <circle cx="14" cy="50" r="4.5" fill="#ffffff" />}
          </svg>
        )}
        <span className="relative" style={{ zIndex: 1 }}>
          <PrecoEtiqueta
            valor={precoOferta}
            tamanho={tamanho}
            cor={corTexto}
            textoProduto={textoProduto}
            escalaTextoProduto={escalaTextoProduto}
            corTextoProduto={corTextoProduto ?? corTexto}
          />
        </span>
      </span>
    </span>
  );
}

/** Texto livre dentro da etiqueta, acima do "POR" (ex.: "LEVE 3 PAGUE 2") — cor e escala próprias. */
function TextoProduto({
  texto,
  escala,
  origem,
  cor,
}: {
  texto?: string;
  escala?: number;
  origem: string;
  cor?: string;
}) {
  if (!texto?.trim()) return null;
  return (
    <span
      className="font-black uppercase leading-none whitespace-nowrap"
      style={{ fontSize: '0.42em', color: cor, transform: `scale(${escala ?? 1})`, transformOrigin: origem }}
    >
      {texto}
    </span>
  );
}

function PrecoDe({ valor, className }: { valor: string; className?: string }) {
  if (!valor.trim()) return null;
  return (
    <span
      className={className}
      style={{
        fontSize: '0.62em',
        fontWeight: 700,
        color: '#e8a86b',
        textDecoration: 'line-through',
        textDecorationColor: '#e07d0a',
      }}
    >
      R$ {valor}
    </span>
  );
}

/** Modelo Padrão — card branco, texto à esquerda, foto à direita, preço em etiqueta. */
function CardPadrao({ produto, estilo, medida, foto, onFotoSlotPointerDown, onFotoSlotDoubleClick, fotoAjustavelNode }: CardProps) {
  const sigT = `${produto.nome}|${produto.descricao}|${medida}`;
  const sigE = `${produto.precoOferta}|${estilo.formaEtiqueta}|${estilo.acabamentoEtiqueta}|${estilo.escalaEtiqueta}`;
  return (
    <div className="relative h-32" style={{ zIndex: 0 }}>
      <FundoSombraCard raio={12} cor={estilo.corFundo} />
      {fotoAjustavelNode}
      {/* sem fundo próprio — quem pinta a cor de verdade é o PNG assado
          acima (fundo + sombra assados juntos, ver nota em FundoSombraCard) */}
      <div className="relative rounded-xl flex h-32">
        {/* z-10: a etiqueta ampliada passa por cima da foto (irmã posterior no DOM) */}
        <div className="relative z-10 flex-1 min-w-0 p-2.5 flex flex-col gap-1">
          <AutoAjuste sig={sigT} className="flex-1 min-h-0">
            <p className="text-[11px] font-black uppercase leading-[1.1] break-normal" style={{ color: estilo.corNome }}>
              {protegerMedidaNoTexto(produto.nome)}
            </p>
            {produto.descricao && (
              <p className="text-[8px] font-semibold leading-[1.15] mt-0.5 break-normal" style={{ color: estilo.corDescricao }}>
                {protegerMedidaNoTexto(produto.descricao)}
              </p>
            )}
            {medida && <p className="text-[8px] font-semibold mt-0.5 whitespace-nowrap" style={{ color: estilo.corDescricao }}>C/ {medida}</p>}
          </AutoAjuste>
          <AutoAjuste sig={sigE} origem="bottom left" min={0.5} transbordar className="flex-shrink-0 relative z-10">
            <EtiquetaPreco
              estilo={estilo}
              precoOferta={produto.precoOferta}
              precoDe={produto.precoDe}
              tamanho={34}
              textoProduto={produto.textoProduto}
              escalaTextoProduto={produto.escalaTextoProduto}
              corTextoProduto={produto.corTextoProduto}
            />
          </AutoAjuste>
        </div>
        <div
          className="w-24 flex-shrink-0 flex items-center justify-center p-1"
          onPointerDown={onFotoSlotPointerDown}
          onDoubleClick={onFotoSlotDoubleClick}
        >
          {foto}
        </div>
      </div>
    </div>
  );
}

/** Modelo Tradicional — sem fundo, nome grande, foto à direita, etiqueta grande com POR / UNI. */
function CardDestaque({ produto, estilo, medida, foto, onFotoSlotPointerDown, onFotoSlotDoubleClick, fotoAjustavelNode }: CardProps) {
  const sigT = `${produto.nome}|${produto.descricao}|${medida}`;
  const sigE = `${produto.precoOferta}|${estilo.formaEtiqueta}|${estilo.acabamentoEtiqueta}|${estilo.escalaEtiqueta}`;
  return (
    <div className="relative flex h-32 gap-1.5">
      {fotoAjustavelNode}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col gap-1">
        <AutoAjuste sig={sigT} className="flex-1 min-h-0">
          {/* `text-shadow` em vez de `filter: drop-shadow` (Tailwind `drop-shadow-sm`)
              — o html2canvas-pro renderiza `filter` mais forte que o Chrome, igual
              acontecia com a sombra da foto (ver `foto` acima). `text-shadow` sai
              igual na tela e no export. */}
          <p
            className="text-[13px] font-black uppercase leading-[1.15] break-normal"
            style={{ color: estilo.corNome, textShadow: '0 1px 1px rgb(0 0 0 / 0.05)' }}
          >
            {protegerMedidaNoTexto(produto.nome)}
          </p>
          {produto.descricao && (
            <p className="text-[9px] font-black uppercase leading-[1.15] mt-0.5 break-normal" style={{ color: estilo.corDescricao }}>
              {protegerMedidaNoTexto(produto.descricao)}
            </p>
          )}
          {medida && <p className="text-[9px] font-black uppercase leading-[1.1] whitespace-nowrap" style={{ color: estilo.corDescricao }}>C/ {medida}</p>}
        </AutoAjuste>
        <AutoAjuste sig={sigE} origem="bottom left" min={0.5} transbordar className="flex-shrink-0 relative z-10">
          <EtiquetaPreco
            estilo={estilo}
            precoOferta={produto.precoOferta}
            precoDe={produto.precoDe}
            tamanho={44}
            textoProduto={produto.textoProduto}
            escalaTextoProduto={produto.escalaTextoProduto}
            corTextoProduto={produto.corTextoProduto}
          />
        </AutoAjuste>
      </div>
      <div
        className="w-24 flex-shrink-0 flex items-center justify-center p-1"
        onPointerDown={onFotoSlotPointerDown}
        onDoubleClick={onFotoSlotDoubleClick}
      >
        {foto}
      </div>
    </div>
  );
}

/** Modelo Clean — card branco arredondado, foto à esquerda, texto suave à direita, preço em laranja. */
function CardClean({ produto, estilo, medida, foto, onFotoSlotPointerDown, onFotoSlotDoubleClick, fotoAjustavelNode }: CardProps) {
  const sigT = `${produto.nome}|${produto.descricao}|${medida}`;
  return (
    <div className="relative h-32" style={{ zIndex: 0 }}>
      <FundoSombraCard raio={16} cor={estilo.corFundo} />
      {fotoAjustavelNode}
      <div className="relative rounded-2xl overflow-hidden flex h-32">
        <div
          className="w-24 flex-shrink-0 flex items-center justify-center p-1.5"
          onPointerDown={onFotoSlotPointerDown}
          onDoubleClick={onFotoSlotDoubleClick}
        >
          {foto}
        </div>
        <div className="flex-1 min-w-0 p-2.5 flex flex-col gap-1">
          <AutoAjuste sig={sigT} className="flex-1 min-h-0">
            <p className="text-[11px] font-semibold leading-[1.15] break-normal" style={{ color: estilo.corNome }}>
              {protegerMedidaNoTexto(produto.nome)}
            </p>
            {produto.descricao && (
              <p className="text-[8px] font-medium leading-[1.15] mt-0.5 break-normal" style={{ color: estilo.corDescricao }}>
                {protegerMedidaNoTexto(produto.descricao)}
              </p>
            )}
            {medida && <p className="text-[8px] font-medium mt-0.5 whitespace-nowrap" style={{ color: estilo.corDescricao }}>C/ {medida}</p>}
          </AutoAjuste>
          <div
            className="relative z-10 flex-shrink-0 flex flex-col items-end origin-bottom-right"
            style={{ transform: `scale(${estilo.escalaEtiqueta})` }}
          >
            <PrecoDe valor={produto.precoDe} />
            <Preco valor={produto.precoOferta} tamanho={26} variante="texto" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Card em evidência — banner largo. Foto grande ancorada no chão do card e
 * transbordando pra cima (sai da caixa branca), nome + descrição completa
 * alinhados à esquerda no centro, e preço grande à direita com POR / R$ / UNI.
 */
function CardProdutoDestaque({ produto, estilo, medida, foto, onFotoSlotPointerDown, onFotoSlotDoubleClick, fotoAjustavelNode }: CardProps) {
  const sigT = `${produto.nome}|${produto.descricao}|${medida}`;
  return (
    <div className="relative" style={{ zIndex: 0 }}>
      <FundoSombraCard destaque raio={16} cor={estilo.corFundo} />
      {fotoAjustavelNode}
      {/* sem fundo próprio — quem pinta a cor de verdade é o PNG assado
          acima (fundo + sombra assados juntos, ver nota em FundoSombraCard) */}
      <div
        className="relative rounded-2xl grid items-center gap-2.5 pl-2.5 pr-4 py-3"
        style={{ gridTemplateColumns: '134px minmax(0,1fr) auto' }}
      >
        {/* Foto: maior, encostada na base e saindo pra cima do card */}
        <div
          className="relative z-10 self-end flex items-end justify-center"
          style={{ height: 160, marginTop: -58, marginBottom: -6 }}
          onPointerDown={onFotoSlotPointerDown}
          onDoubleClick={onFotoSlotDoubleClick}
        >
          {foto}
        </div>

        {/* Nome + descrição completa, alinhados à esquerda */}
        <AutoAjuste sig={sigT} className="self-center max-h-[92px]">
          <p className="text-[15px] font-black uppercase leading-[1.12] break-normal" style={{ color: estilo.corNome }}>
            {protegerMedidaNoTexto(produto.nome)}
          </p>
          {produto.descricao && (
            <p className="text-[10px] font-semibold leading-[1.2] mt-1 break-normal" style={{ color: estilo.corDescricao }}>
              {protegerMedidaNoTexto(produto.descricao)}
            </p>
          )}
          {medida && (
            <p className="text-[10px] font-semibold leading-[1.2] mt-0.5 whitespace-nowrap" style={{ color: estilo.corDescricao }}>C/ {medida}</p>
          )}
        </AutoAjuste>

        {/* Preço grande dourado com efeito: POR / R$ / número / centavos / UNI */}
        <div
          className="relative z-10 flex flex-col items-end origin-right"
          style={{ transform: `scale(${estilo.escalaEtiqueta})` }}
        >
          <PrecoDe valor={produto.precoDe} />
          {/* rótulos (POR / R$ / UNI) menores, preço e centavos em evidência */}
          <PrecoEtiqueta
            valor={produto.precoOferta}
            tamanho={58}
            dourado
            escalaRotulos={0.58}
            escalaCentavos={0.6}
            textoProduto={produto.textoProduto}
            escalaTextoProduto={produto.escalaTextoProduto}
            corTextoProduto={produto.corTextoProduto ?? PRECO_LARANJA.color}
          />
        </div>
      </div>
    </div>
  );
}
