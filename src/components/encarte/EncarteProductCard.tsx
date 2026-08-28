import { Package } from 'lucide-react';
import { getProxyUrl } from '../../lib/utils';
import { EncarteProduto, EstiloEncarte } from './encarteProduto';

/** largura base do card (px, na escala de exibição do canvas) */
export const CARD_W = 200;

interface EncarteProductCardProps {
  produto: EncarteProduto;
  estilo: EstiloEncarte;
  selecionado?: boolean;
}

export default function EncarteProductCard({ produto, estilo, selecionado }: EncarteProductCardProps) {
  const { product } = produto;
  const medida = [produto.medidaQtd, produto.medidaUnidade].filter(Boolean).join(' ').trim();

  return (
    <div
      className="relative select-none"
      style={{ width: CARD_W, transform: `scale(${estilo.escalaCard})`, transformOrigin: 'top left' }}
    >
      <div
        className="rounded-xl overflow-hidden flex h-32 shadow-md"
        style={{ backgroundColor: estilo.corFundo }}
      >
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
        <div className="w-24 flex-shrink-0 flex items-center justify-center overflow-hidden p-1">
          {product.image ? (
            <img
              src={getProxyUrl(product.thumb_image || product.image, { thumbnail: true })}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
          ) : (
            <Package className="w-6 h-6 text-zinc-300" />
          )}
        </div>
      </div>

      {selecionado && (
        <div
          data-html2canvas-ignore="true"
          className="pointer-events-none absolute -inset-0.5 rounded-xl ring-2 ring-emerald-400"
        />
      )}
    </div>
  );
}
