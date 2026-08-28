import { Package } from 'lucide-react';
import { getProxyUrl } from '../../lib/utils';
import { EncarteProduto, EstiloEncarte, CARD_W } from './encarteProduto';

interface EncarteProductCardProps {
  produto: EncarteProduto;
  estilo: EstiloEncarte;
  selecionado?: boolean;
}

export default function EncarteProductCard({ produto, estilo, selecionado }: EncarteProductCardProps) {
  const { product } = produto;
  const medida = [produto.medidaQtd, produto.medidaUnidade].filter(Boolean).join(' ').trim();

  const foto = product.image ? (
    <img
      src={getProxyUrl(product.thumb_image || product.image, { thumbnail: true })}
      className="w-full h-full object-contain"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
    />
  ) : (
    <Package className="w-6 h-6 text-zinc-300" />
  );

  return (
    <div
      className="relative select-none"
      style={{ width: CARD_W, transform: `scale(${estilo.escalaCard})`, transformOrigin: 'top left' }}
    >
      {estilo.modeloCard === 'destaque' ? (
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
        <div
          className="inline-flex items-baseline gap-0.5 rounded-lg px-2 py-1 w-fit origin-bottom-left flex-shrink-0"
          style={{ backgroundColor: estilo.corEtiqueta, transform: `scale(${estilo.escalaEtiqueta})` }}
        >
          <span className="text-[8px] font-bold text-white/80">R$</span>
          <span className="text-sm font-black text-white">{produto.precoOferta}</span>
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
        <div
          className="flex items-center gap-1 rounded-xl px-2 py-1 w-fit origin-bottom-left flex-shrink-0 mt-1"
          style={{ backgroundColor: estilo.corEtiqueta, transform: `scale(${estilo.escalaEtiqueta})` }}
        >
          <div className="flex flex-col items-center leading-none">
            <span className="text-[6px] font-bold text-white/80">POR</span>
            <span className="text-[7px] font-bold text-white/80">R$</span>
          </div>
          <span className="text-lg font-black text-white leading-none">{produto.precoOferta}</span>
          <span className="text-[6px] font-bold text-white/80 self-end">UNI</span>
        </div>
      </div>
      <div className="w-24 flex-shrink-0 flex items-center justify-center overflow-hidden p-1">{foto}</div>
    </div>
  );
}

/** Modelo Clean — card branco arredondado, foto à esquerda, texto suave à direita, preço em texto colorido. */
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
          className="flex items-baseline justify-end gap-0.5 origin-bottom-right flex-shrink-0"
          style={{ transform: `scale(${estilo.escalaEtiqueta})` }}
        >
          <span className="text-[9px] font-black" style={{ color: estilo.corEtiqueta }}>R$</span>
          <span className="text-lg font-black leading-none" style={{ color: estilo.corEtiqueta }}>
            {produto.precoOferta}
          </span>
        </div>
      </div>
    </div>
  );
}
