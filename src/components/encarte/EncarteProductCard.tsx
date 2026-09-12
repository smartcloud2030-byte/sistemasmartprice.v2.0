import { useLayoutEffect, useRef, useState } from 'react';
import { Package } from 'lucide-react';
import { getProxyUrl, cn } from '../../lib/utils';
import {
  EncarteProduto,
  EstiloEncarte,
  FormaEtiqueta,
  CARD_W,
  partesPreco,
  escureceHex,
  SVG_ETIQUETA,
} from './encarteProduto';

interface EncarteProductCardProps {
  produto: EncarteProduto;
  estilo: EstiloEncarte;
  selecionado?: boolean;
}

/** degradê laranja → dourado, assinatura visual do preço em texto */
const PRECO_LARANJA: React.CSSProperties = {
  backgroundImage: 'linear-gradient(180deg,#f6c453 0%,#ef9d1c 55%,#e07d0a 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

export default function EncarteProductCard({ produto, estilo, selecionado }: EncarteProductCardProps) {
  const { product } = produto;
  const medida = [produto.medidaQtd, produto.medidaUnidade].filter(Boolean).join(' ').trim();

  // Sem thumbnail aqui de propósito: o card é exportado em alta qualidade
  // (scale alto no download), e a miniatura de 400px ficaria borrada ampliada.
  //
  // Sombra: em vez de `filter: drop-shadow` (que o html2canvas-pro renderiza
  // mais forte/dura que o Chrome no PNG/PDF), usamos uma CÓPIA da própria foto
  // borrada + escurecida atrás dela. `blur`+`brightness`+`opacity` saem iguais
  // na tela e no export — a sombra fica fiel.
  const fotoSrc = getProxyUrl(product.image || product.thumb_image);
  const foto = product.image ? (
    <span className="relative block w-full h-full">
      <img
        src={fotoSrc}
        aria-hidden
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        style={{ filter: 'blur(4px) brightness(0)', opacity: 0.33, transform: 'translateY(4px)' }}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
      />
      <img
        src={fotoSrc}
        className="relative w-full h-full object-contain"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
      />
    </span>
  ) : (
    <Package className="w-6 h-6 text-zinc-300" />
  );

  const largura = produto.emDestaque ? CARD_W * 2.2 : CARD_W;

  return (
    <div
      className="relative select-none"
      style={{ width: largura, transform: `scale(${estilo.escalaCard})`, transformOrigin: 'top left' }}
    >
      {produto.emDestaque ? (
        <CardProdutoDestaque produto={produto} estilo={estilo} medida={medida} foto={foto} />
      ) : estilo.modeloCard === 'destaque' ? (
        <CardDestaque produto={produto} estilo={estilo} medida={medida} foto={foto} />
      ) : estilo.modeloCard === 'clean' ? (
        <CardClean produto={produto} estilo={estilo} medida={medida} foto={foto} />
      ) : (
        <CardPadrao produto={produto} estilo={estilo} medida={medida} foto={foto} />
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
}) {
  const { inteiro, centavos } = partesPreco(valor);
  return (
    <span
      className="inline-flex items-stretch font-black uppercase leading-none"
      style={dourado ? { fontSize: tamanho, ...PRECO_LARANJA } : { fontSize: tamanho, color: cor }}
    >
      {/* POR + R$ juntos, no topo à esquerda */}
      <span className="self-stretch flex flex-col items-start justify-start leading-none pr-[0.06em] gap-[0.03em]">
        <span className="leading-none" style={{ fontSize: `${0.36 * escalaRotulos}em`, letterSpacing: '0.02em' }}>POR</span>
        <span className="leading-none" style={{ fontSize: `${0.34 * escalaRotulos}em` }}>R$</span>
      </span>

      {/* número inteiro — dominante */}
      <span className="leading-none">{inteiro}</span>

      {/* vírgula (meio) + centavos elevados */}
      {centavos && (
        <span className="self-stretch flex leading-none" style={{ fontSize: `${escalaCentavos}em` }}>
          <span className="self-center">,</span>
          <span className="self-start">{centavos}</span>
        </span>
      )}

      {/* UNI colado na base, puxado pra esquerda (bem perto dos centavos) */}
      <span
        className="self-stretch flex flex-col items-start justify-end leading-none"
        style={{ marginLeft: '-0.16em' }}
      >
        <span className="leading-none" style={{ fontSize: `${0.24 * escalaRotulos}em`, letterSpacing: '0.04em' }}>UN</span>
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
}: {
  estilo: EstiloEncarte;
  precoOferta: string;
  precoDe: string;
  tamanho: number;
  alinharDireita?: boolean;
}) {
  const forma: FormaEtiqueta = estilo.formaEtiqueta ?? 'retangulo';
  const acab = estilo.acabamentoEtiqueta ?? 'solida';
  const cor = estilo.corEtiqueta;
  const contorno = acab === 'contorno';
  const corTexto = contorno ? cor : '#ffffff';
  const svgPath = SVG_ETIQUETA[forma];
  const compacta = forma === 'selo' || forma === 'explosao' || forma === 'circulo';

  const wrapCls = alinharDireita
    ? 'inline-flex flex-col items-end gap-0.5'
    : 'inline-flex flex-col items-start gap-0.5';
  const origem = alinharDireita ? 'bottom right' : 'bottom left';

  // "Só preço" — sem caixa
  if (forma === 'nenhuma') {
    return (
      <span className={wrapCls} style={{ transform: `scale(${estilo.escalaEtiqueta})`, transformOrigin: origem }}>
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
          <PrecoEtiqueta valor={precoOferta} tamanho={tamanho} cor={corTexto} />
        </span>
      </span>
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
function CardPadrao({ produto, estilo, medida, foto }: CardProps) {
  const sigT = `${produto.nome}|${produto.descricao}|${medida}`;
  const sigE = `${produto.precoOferta}|${estilo.formaEtiqueta}|${estilo.acabamentoEtiqueta}|${estilo.escalaEtiqueta}`;
  return (
    <div className="relative rounded-xl flex h-32 shadow-md" style={{ backgroundColor: estilo.corFundo }}>
      {/* z-10: a etiqueta ampliada passa por cima da foto (irmã posterior no DOM) */}
      <div className="relative z-10 flex-1 min-w-0 p-2.5 flex flex-col gap-1">
        <AutoAjuste sig={sigT} className="flex-1 min-h-0">
          <p className="text-[11px] font-black uppercase leading-[1.1] break-words" style={{ color: estilo.corNome }}>
            {produto.nome}
          </p>
          {produto.descricao && (
            <p className="text-[8px] font-semibold leading-[1.15] mt-0.5 break-words" style={{ color: estilo.corDescricao }}>
              {produto.descricao}
            </p>
          )}
          {medida && <p className="text-[8px] font-semibold mt-0.5 break-words" style={{ color: estilo.corDescricao }}>C/ {medida}</p>}
        </AutoAjuste>
        <AutoAjuste sig={sigE} origem="bottom left" min={0.5} transbordar className="flex-shrink-0 relative z-10">
          <EtiquetaPreco estilo={estilo} precoOferta={produto.precoOferta} precoDe={produto.precoDe} tamanho={34} />
        </AutoAjuste>
      </div>
      <div className="w-24 flex-shrink-0 flex items-center justify-center p-1">{foto}</div>
    </div>
  );
}

/** Modelo Tradicional — sem fundo, nome grande, foto à direita, etiqueta grande com POR / UNI. */
function CardDestaque({ produto, estilo, medida, foto }: CardProps) {
  const sigT = `${produto.nome}|${produto.descricao}|${medida}`;
  const sigE = `${produto.precoOferta}|${estilo.formaEtiqueta}|${estilo.acabamentoEtiqueta}|${estilo.escalaEtiqueta}`;
  return (
    <div className="relative flex h-32 gap-1.5">
      <div className="relative z-10 flex-1 min-w-0 flex flex-col gap-1">
        <AutoAjuste sig={sigT} className="flex-1 min-h-0">
          {/* `text-shadow` em vez de `filter: drop-shadow` (Tailwind `drop-shadow-sm`)
              — o html2canvas-pro renderiza `filter` mais forte que o Chrome, igual
              acontecia com a sombra da foto (ver `foto` acima). `text-shadow` sai
              igual na tela e no export. */}
          <p
            className="text-[13px] font-black uppercase leading-[1.15] break-words"
            style={{ color: estilo.corNome, textShadow: '0 1px 1px rgb(0 0 0 / 0.05)' }}
          >
            {produto.nome}
          </p>
          {produto.descricao && (
            <p className="text-[9px] font-black uppercase leading-[1.15] mt-0.5 break-words" style={{ color: estilo.corDescricao }}>
              {produto.descricao}
            </p>
          )}
          {medida && <p className="text-[9px] font-black uppercase leading-[1.1] break-words" style={{ color: estilo.corDescricao }}>C/ {medida}</p>}
        </AutoAjuste>
        <AutoAjuste sig={sigE} origem="bottom left" min={0.5} transbordar className="flex-shrink-0 relative z-10">
          <EtiquetaPreco estilo={estilo} precoOferta={produto.precoOferta} precoDe={produto.precoDe} tamanho={44} />
        </AutoAjuste>
      </div>
      <div className="w-24 flex-shrink-0 flex items-center justify-center p-1">{foto}</div>
    </div>
  );
}

/** Modelo Clean — card branco arredondado, foto à esquerda, texto suave à direita, preço em laranja. */
function CardClean({ produto, estilo, medida, foto }: CardProps) {
  const sigT = `${produto.nome}|${produto.descricao}|${medida}`;
  return (
    <div className="rounded-2xl overflow-hidden flex h-32 shadow-md" style={{ backgroundColor: estilo.corFundo }}>
      <div className="w-24 flex-shrink-0 flex items-center justify-center p-1.5">{foto}</div>
      <div className="flex-1 min-w-0 p-2.5 flex flex-col gap-1">
        <AutoAjuste sig={sigT} className="flex-1 min-h-0">
          <p className="text-[11px] font-semibold leading-[1.15] break-words" style={{ color: estilo.corNome }}>
            {produto.nome}
          </p>
          {produto.descricao && (
            <p className="text-[8px] font-medium leading-[1.15] mt-0.5 break-words" style={{ color: estilo.corDescricao }}>
              {produto.descricao}
            </p>
          )}
          {medida && <p className="text-[8px] font-medium mt-0.5 break-words" style={{ color: estilo.corDescricao }}>C/ {medida}</p>}
        </AutoAjuste>
        <div
          className="flex-shrink-0 flex flex-col items-end origin-bottom-right"
          style={{ transform: `scale(${estilo.escalaEtiqueta})` }}
        >
          <PrecoDe valor={produto.precoDe} />
          <Preco valor={produto.precoOferta} tamanho={26} variante="texto" />
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
function CardProdutoDestaque({ produto, estilo, medida, foto }: CardProps) {
  const sigT = `${produto.nome}|${produto.descricao}|${medida}`;
  return (
    <div
      className="relative rounded-2xl grid items-center gap-2.5 shadow-lg pl-2.5 pr-4 py-3"
      style={{ backgroundColor: estilo.corFundo, gridTemplateColumns: '134px minmax(0,1fr) auto' }}
    >
      {/* Foto: maior, encostada na base e saindo pra cima do card */}
      <div
        className="relative z-10 self-end flex items-end justify-center"
        style={{ height: 160, marginTop: -58, marginBottom: -6 }}
      >
        {foto}
      </div>

      {/* Nome + descrição completa, alinhados à esquerda */}
      <AutoAjuste sig={sigT} className="self-center max-h-[92px]">
        <p className="text-[15px] font-black uppercase leading-[1.12] break-words" style={{ color: estilo.corNome }}>
          {produto.nome}
        </p>
        {produto.descricao && (
          <p className="text-[10px] font-semibold leading-[1.2] mt-1 break-words" style={{ color: estilo.corDescricao }}>
            {produto.descricao}
          </p>
        )}
        {medida && (
          <p className="text-[10px] font-semibold leading-[1.2] mt-0.5 break-words" style={{ color: estilo.corDescricao }}>C/ {medida}</p>
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
        />
      </div>
    </div>
  );
}
