import { X, ShoppingCart, ChevronRight } from 'lucide-react';
import ProductSelector from '../ProductSelector';
import { Product } from '../../store';
import { getProxyUrl } from '../../lib/utils';
import { EncarteProduto } from './encarteProduto';

interface ProdutosTabProps {
  selecionados: EncarteProduto[];
  onSelecionar: (product: Product) => void;
  onRemover: (id?: string | number) => void;
  onAbrirDetalhes: (id?: string | number) => void;
}

export default function ProdutosTab({ selecionados, onSelecionar, onRemover, onAbrirDetalhes }: ProdutosTabProps) {
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
            {selecionados.map((ep) => (
              <div key={ep.product.id} className="flex items-center gap-2 bg-zinc-800 rounded-lg pl-2 pr-1.5 py-1.5">
                <button
                  onClick={() => onAbrirDetalhes(ep.product.id)}
                  className="flex items-center gap-2 flex-grow min-w-0 text-left group"
                >
                  <div className="w-7 h-7 rounded bg-zinc-700 flex-shrink-0 overflow-hidden">
                    {ep.product.image && (
                      <img src={getProxyUrl(ep.product.image, { thumbnail: true })} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <span className="text-xs text-zinc-200 truncate flex-grow group-hover:text-emerald-300 transition-colors">
                    {ep.nome}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 group-hover:text-emerald-400 transition-colors" />
                </button>
                <button
                  onClick={() => onRemover(ep.product.id)}
                  className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                >
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
