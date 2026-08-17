import { Package } from 'lucide-react';
import { Product } from '../../store';
import { getProxyUrl } from '../../lib/utils';

interface EncarteProductCardProps {
  product: Product;
}

export default function EncarteProductCard({ product }: EncarteProductCardProps) {
  return (
    <div className="bg-white rounded-xl overflow-hidden flex h-28 shadow-md">
      <div className="flex-1 min-w-0 p-2.5 flex flex-col justify-between">
        <div>
          <p className="text-[11px] font-black uppercase leading-tight text-red-600 line-clamp-2">{product.name}</p>
          {product.subtitle && (
            <p className="text-[9px] font-semibold text-zinc-500 mt-0.5">C/ {product.subtitle}</p>
          )}
        </div>
        <div className="inline-flex items-baseline gap-0.5 bg-emerald-600 rounded-lg px-2 py-1 w-fit">
          <span className="text-[8px] font-bold text-white/80">R$</span>
          <span className="text-sm font-black text-white">{product.price.replace('R$', '').trim()}</span>
        </div>
      </div>
      <div className="w-20 flex-shrink-0 bg-zinc-100 flex items-center justify-center">
        {product.image ? (
          <img src={getProxyUrl(product.image, { thumbnail: true })} className="w-full h-full object-contain" />
        ) : (
          <Package className="w-6 h-6 text-zinc-300" />
        )}
      </div>
    </div>
  );
}
