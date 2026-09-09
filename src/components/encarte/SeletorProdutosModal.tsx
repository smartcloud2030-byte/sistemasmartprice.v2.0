import { X, ShoppingCart } from 'lucide-react';
import ProductSelector from '../ProductSelector';
import { Product } from '../../store';
import { getProxyUrl } from '../../lib/utils';
import { EncarteProduto } from './encarteProduto';

interface SeletorProdutosModalProps {
  /** produtos já no lado atual do encarte */
  selecionados: EncarteProduto[];
  onSelecionar: (product: Product) => void;
  onRemover: (id?: string | number) => void;
  onFechar: () => void;
}

/**
 * Atalho pra adicionar produtos sem sair pro painel lateral — abre ao clicar
 * no "Adicionar produtos no encarte" (estado vazio) ou no botão "+ Produtos".
 * Busca por nome/código, um clique adiciona; a lista de baixo mostra o que já
 * está no encarte com opção de tirar.
 */
export default function SeletorProdutosModal({
  selecionados,
  onSelecionar,
  onRemover,
  onFechar,
}: SeletorProdutosModalProps) {
  return (
    <div
      data-html2canvas-ignore="true"
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onFechar}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-4 border-b border-zinc-800 flex-shrink-0">
          <ShoppingCart className="w-4 h-4 text-emerald-500" />
          <h2 className="text-sm font-black uppercase tracking-widest flex-grow text-zinc-100">Adicionar produtos</h2>
          <button onClick={onFechar} className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          <ProductSelector onSelect={onSelecionar} />

          {selecionados.length > 0 && (
            <div className="space-y-2 pt-3 mt-3 border-t border-zinc-800">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                No encarte ({selecionados.length})
              </h3>
              <div className="space-y-1.5">
                {selecionados.map((ep) => (
                  <div key={ep.product.id} className="flex items-center gap-2 bg-zinc-800 rounded-lg pl-2 pr-1.5 py-1.5">
                    <div className="w-7 h-7 rounded bg-zinc-700 flex-shrink-0 overflow-hidden">
                      {ep.product.image && (
                        <img src={getProxyUrl(ep.product.image, { thumbnail: true })} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <span className="text-xs text-zinc-200 truncate flex-grow">{ep.nome}</span>
                    <button
                      onClick={() => onRemover(ep.product.id)}
                      className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                      title="Tirar do encarte"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-zinc-800 flex justify-end flex-shrink-0">
          <button
            onClick={onFechar}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
