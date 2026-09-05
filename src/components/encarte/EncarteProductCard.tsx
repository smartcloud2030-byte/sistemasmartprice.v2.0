import { Package } from 'lucide-react';
import { getProxyUrl } from '../../lib/utils';
import { EncarteProduto, EstiloEncarte, CARD_W, partesPreco } from './encarteProduto';

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
  // (scale 3x no download), e a miniatura de 400px ficaria borrada ampliada.
  const foto = product.image ? (
    <img
      src={getProxyUrl(product.image || product.thumb_image)}
      className="w-full h-full object-contain"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
    />
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
        <CardProdutoDestaque produto={produto} estilo={estilo} foto={foto} />
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
      : { color: '#ffffff' };
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
  return (
    <div className="rounded-xl overflow-hidden flex h-32 shadow-md" style={{ backgroundColor: estilo.corFundo }}>
      <div className="flex-1 min-w-0 p-2.5 flex flex-col justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase leading-[1.1] text-red-600 line-clamp-2 break-words">
            {produto.nome}
          </p>
          {produto.descricao && (
            <p className="text-[8px] font-semibold text-zinc-600 leading-[1.15] mt-0.5 line-clamp-2 break-words">
              {produto.descricao}
            </p>
          )}
          {medida && <p className="text-[8px] font-semibold text-zinc-500 mt-0.5 truncate">C/ {medida}</p>}
        </div>
        <div className="flex flex-col items-start gap-0.5 origin-bottom-left" style={{ transform: `scale(${estilo.escalaEtiqueta})` }}>
          <PrecoDe valor={produto.precoDe} />
          <span className="inline-flex rounded-lg px-2 py-1" style={{ backgroundColor: estilo.corEtiqueta }}>
            <Preco valor={produto.precoOferta} tamanho={16} variante="etiqueta" />
          </span>
        </div>
      </div>
      <div className="w-24 flex-shrink-0 flex items-center justify-center overflow-hidden p-1">{foto}</div>
    </div>
  );
}

/** Modelo Destaque — sem fundo, nome grande, foto à direita, etiqueta grande com POR / UNI. */
function CardDestaque({ produto, estilo, medida, foto }: CardProps) {
  return (
    <div className="flex h-32 gap-1.5">
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div className="min-w-0">
          <p className="text-[13px] font-black uppercase leading-[1] text-red-600 line-clamp-2 break-words drop-shadow-sm">
            {produto.nome}
          </p>
          {produto.descricao && (
            <p className="text-[9px] font-black uppercase text-zinc-900 leading-[1.1] mt-0.5 line-clamp-1 break-words">
              {produto.descricao}
            </p>
          )}
          {medida && <p className="text-[9px] font-black uppercase text-zinc-900 leading-[1.1] truncate">C/ {medida}</p>}
        </div>
        <div className="flex flex-col items-start gap-0.5 origin-bottom-left mt-1" style={{ transform: `scale(${estilo.escalaEtiqueta})` }}>
          <PrecoDe valor={produto.precoDe} />
          <span
            className="inline-flex items-center gap-1 rounded-xl px-2 py-1"
            style={{ backgroundColor: estilo.corEtiqueta }}
          >
            <span className="text-[7px] font-bold text-white/80 leading-none">POR</span>
            <Preco valor={produto.precoOferta} tamanho={20} variante="etiqueta" />
            <span className="text-[7px] font-bold text-white/80 self-end">UNI</span>
          </span>
        </div>
      </div>
      <div className="w-24 flex-shrink-0 flex items-center justify-center overflow-hidden p-1">{foto}</div>
    </div>
  );
}

/** Modelo Clean — card branco arredondado, foto à esquerda, texto suave à direita, preço em laranja. */
function CardClean({ produto, estilo, medida, foto }: CardProps) {
  return (
    <div className="rounded-2xl overflow-hidden flex h-32 shadow-md" style={{ backgroundColor: estilo.corFundo }}>
      <div className="w-24 flex-shrink-0 flex items-center justify-center overflow-hidden p-1.5">{foto}</div>
      <div className="flex-1 min-w-0 p-2.5 flex flex-col justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-zinc-700 leading-[1.15] line-clamp-3 break-words">
            {produto.nome}
          </p>
          {produto.descricao && (
            <p className="text-[8px] font-medium text-zinc-400 leading-[1.15] mt-0.5 line-clamp-2 break-words">
              {produto.descricao}
            </p>
          )}
          {medida && <p className="text-[8px] font-medium text-zinc-400 mt-0.5 truncate">C/ {medida}</p>}
        </div>
        <div
          className="flex flex-col items-end origin-bottom-right"
          style={{ transform: `scale(${estilo.escalaEtiqueta})` }}
        >
          <PrecoDe valor={produto.precoDe} />
          <Preco valor={produto.precoOferta} tamanho={26} variante="texto" />
        </div>
      </div>
    </div>
  );
}

/** Card em evidência — largo, foto à esquerda, nome ao centro, preço à direita. */
function CardProdutoDestaque({ produto, estilo, foto }: Omit<CardProps, 'medida'>) {
  return (
    <div
      className="rounded-2xl overflow-hidden grid items-center gap-3 shadow-lg px-4 py-3"
      style={{ backgroundColor: estilo.corFundo, gridTemplateColumns: '96px 1fr auto' }}
    >
      <div className="h-20 flex items-center justify-center overflow-hidden">{foto}</div>
      <p className="text-[15px] font-bold text-zinc-600 leading-[1.15] line-clamp-3 break-words">{produto.nome}</p>
      <div className="flex flex-col items-end origin-right" style={{ transform: `scale(${estilo.escalaEtiqueta})` }}>
        <PrecoDe valor={produto.precoDe} />
        <Preco valor={produto.precoOferta} tamanho={40} variante="texto" />
      </div>
    </div>
  );
}
