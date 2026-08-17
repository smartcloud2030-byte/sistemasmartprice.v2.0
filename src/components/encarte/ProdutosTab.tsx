import { X, ShoppingCart } from 'lucide-react';
import ProductSelector from '../ProductSelector';
import { Product } from '../../store';
import { getProxyUrl } from '../../lib/utils';

interface ProdutosTabProps {
  selecionados: Product[];
  onSelecionar: (product: Product) => void;
  onRemover: (id?: string | number) => void;
}

export default function ProdutosTab({ selecionados, onSelecionar, onRemover }: ProdutosTabProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-emerald-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Produtos</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Busque e selecione os produtos</p>
        </div>
      </div>

      <ProductSelector onSelect={onSelecionar} />

      {selecionados.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-zinc-800">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Selecionados ({selecionados.length})
          </h3>
          <div className="space-y-1.5">
            {selecionados.map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-2 py-1.5">
                <div className="w-7 h-7 rounded bg-zinc-700 flex-shrink-0 overflow-hidden">
                  {p.image && <img src={getProxyUrl(p.image, { thumbnail: true })} className="w-full h-full object-cover" />}
                </div>
                <span className="text-xs text-zinc-200 truncate flex-grow">{p.name}</span>
                <button onClick={() => onRemover(p.id)} className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
