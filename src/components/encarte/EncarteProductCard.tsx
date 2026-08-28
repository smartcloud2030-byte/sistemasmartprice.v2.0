import { Package } from 'lucide-react';
import { getProxyUrl } from '../../lib/utils';
import { EncarteProduto } from './encarteProduto';

interface EncarteProductCardProps {
  produto: EncarteProduto;
  selecionado?: boolean;
  onClick?: () => void;
}

export default function EncarteProductCard({ produto, selecionado, onClick }: EncarteProductCardProps) {
  const { product } = produto;
  const medida = [produto.medidaQtd, produto.medidaUnidade].filter(Boolean).join(' ').trim();
  const legenda = medida || product.subtitle;

  return (
    <div className="relative">
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl overflow-hidden flex h-28 shadow-md"
        style={{ backgroundColor: produto.corFundo }}
      >
        <div className="flex-1 min-w-0 p-2.5 flex flex-col justify-between">
          <div>
            <p className="text-[11px] font-black uppercase leading-tight text-red-600 line-clamp-2">{produto.nome}</p>
            {legenda && <p className="text-[9px] font-semibold text-zinc-500 mt-0.5">C/ {legenda}</p>}
          </div>
          <div
            className="inline-flex items-baseline gap-0.5 rounded-lg px-2 py-1 w-fit origin-bottom-left"
            style={{ backgroundColor: produto.corEtiqueta, transform: `scale(${produto.escalaEtiqueta})` }}
          >
            <span className="text-[8px] font-bold text-white/80">R$</span>
            <span className="text-sm font-black text-white">{produto.precoOferta}</span>
          </div>
        </div>
        <div className="w-20 flex-shrink-0 bg-zinc-100 flex items-center justify-center overflow-hidden">
          {product.image ? (
            <img
              src={getProxyUrl(product.image, { thumbnail: true })}
              className="w-full h-full object-contain"
              style={{ transform: `scale(${produto.escalaProduto})` }}
            />
          ) : (
            <Package className="w-6 h-6 text-zinc-300" />
          )}
        </div>
      </button>

      {selecionado && (
        <div
          data-html2canvas-ignore="true"
          className="pointer-events-none absolute -inset-0.5 rounded-xl ring-2 ring-emerald-400"
        />
      )}
    </div>
  );
}
