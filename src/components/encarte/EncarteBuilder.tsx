import { useState } from 'react';
import { ArrowLeft, Image, ShoppingCart, Shapes, Tag, Rows3, Building2, LayoutGrid } from 'lucide-react';
import { useStore, Product } from '../../store';
import { cn } from '../../lib/utils';
import TemasTab from './TemasTab';
import ProdutosTab from './ProdutosTab';
import FormatosTab from './FormatosTab';
import ProdutoDetalhes from './ProdutoDetalhes';
import EncarteCanvas from './EncarteCanvas';
import { Formato, FORMATO_PADRAO } from './formatos';
import { EncarteProduto, criarEncarteProduto } from './encarteProduto';

type MenuItem = 'temas' | 'produtos' | 'elementos' | 'tags' | 'formatos' | 'marca' | 'encartes';

const MENU_ITEMS: { id: MenuItem; label: string; icon: React.ElementType }[] = [
  { id: 'temas', label: 'Temas', icon: Image },
  { id: 'produtos', label: 'Produtos', icon: ShoppingCart },
  { id: 'elementos', label: 'Elementos', icon: Shapes },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'formatos', label: 'Formatos', icon: Rows3 },
  { id: 'marca', label: 'Marca', icon: Building2 },
  { id: 'encartes', label: 'Encartes', icon: LayoutGrid },
];

export default function EncarteBuilder() {
  const { setView } = useStore();
  const [activeMenu, setActiveMenu] = useState<MenuItem>('temas');
  const [temaSelecionado, setTemaSelecionado] = useState<string | null>(null);
  const [produtosSelecionados, setProdutosSelecionados] = useState<EncarteProduto[]>([]);
  const [formato, setFormato] = useState<Formato>(FORMATO_PADRAO);
  const [produtoDetalhadoId, setProdutoDetalhadoId] = useState<string | number | null>(null);

  const activeLabel = MENU_ITEMS.find((m) => m.id === activeMenu)?.label;

  const adicionarProduto = (product: Product) => {
    setProdutosSelecionados((prev) =>
      prev.some((ep) => ep.product.id === product.id) ? prev : [...prev, criarEncarteProduto(product)],
    );
  };

  const removerProduto = (id?: string | number) => {
    setProdutosSelecionados((prev) => prev.filter((ep) => ep.product.id !== id));
    setProdutoDetalhadoId((atual) => (atual === id ? null : atual));
  };

  const atualizarProduto = (id: string | number | undefined, patch: Partial<EncarteProduto>) => {
    setProdutosSelecionados((prev) => prev.map((ep) => (ep.product.id === id ? { ...ep, ...patch } : ep)));
  };

  const produtoDetalhado = produtosSelecionados.find((ep) => ep.product.id === produtoDetalhadoId) ?? null;

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <header className="h-16 flex-shrink-0 border-b border-zinc-800 bg-zinc-900 flex items-center gap-4 px-6 z-40">
        <button onClick={() => setView('editor')} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-black tracking-tighter uppercase">Encarte Online</h1>
      </header>

      <div className="flex-grow flex min-h-0">
        <nav className="w-20 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-4 gap-1">
          {MENU_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveMenu(id); setProdutoDetalhadoId(null); }}
              className={cn(
                'w-16 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-colors',
                activeMenu === id
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                  : 'text-zinc-400 border border-transparent hover:bg-zinc-800 hover:text-zinc-200'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </nav>

        <aside className="w-72 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
          {produtoDetalhado ? (
            <ProdutoDetalhes
              produto={produtoDetalhado}
              onAtualizar={(patch) => atualizarProduto(produtoDetalhado.product.id, patch)}
              onRemover={() => removerProduto(produtoDetalhado.product.id)}
              onVoltar={() => setProdutoDetalhadoId(null)}
            />
          ) : activeMenu === 'temas' ? (
            <TemasTab selecionada={temaSelecionado} onSelecionar={setTemaSelecionado} />
          ) : activeMenu === 'produtos' ? (
            <ProdutosTab
              selecionados={produtosSelecionados}
              onSelecionar={adicionarProduto}
              onRemover={removerProduto}
              onAbrirDetalhes={setProdutoDetalhadoId}
            />
          ) : activeMenu === 'formatos' ? (
            <FormatosTab selecionado={formato.id} onSelecionar={setFormato} />
          ) : (
            <div className="p-6 flex flex-col items-center justify-center gap-3 text-center h-full">
              <LayoutGrid className="w-8 h-8 text-zinc-700" />
              <p className="text-xs font-semibold text-zinc-500">{activeLabel} — em construção</p>
            </div>
          )}
        </aside>

        <EncarteCanvas
          backgroundUrl={temaSelecionado}
          produtos={produtosSelecionados}
          formato={formato}
          produtoDetalhadoId={produtoDetalhadoId}
          onAdicionarProdutos={() => setActiveMenu('produtos')}
          onAbrirDetalhes={setProdutoDetalhadoId}
        />
      </div>
    </div>
  );
}
