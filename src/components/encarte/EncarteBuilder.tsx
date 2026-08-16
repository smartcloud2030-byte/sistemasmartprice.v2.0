import { useState } from 'react';
import { ArrowLeft, Image, ShoppingCart, Shapes, Tag, Rows3, Building2, LayoutGrid } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';
import TemasTab from './TemasTab';
import ProdutosTab from './ProdutosTab';
import EncarteCanvas from './EncarteCanvas';

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

  const activeLabel = MENU_ITEMS.find((m) => m.id === activeMenu)?.label;

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
              onClick={() => setActiveMenu(id)}
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
          {activeMenu === 'temas' ? (
            <TemasTab selecionada={temaSelecionado} onSelecionar={setTemaSelecionado} />
          ) : activeMenu === 'produtos' ? (
            <ProdutosTab />
          ) : (
            <div className="p-6 flex flex-col items-center justify-center gap-3 text-center h-full">
              <LayoutGrid className="w-8 h-8 text-zinc-700" />
              <p className="text-xs font-semibold text-zinc-500">{activeLabel} — em construção</p>
            </div>
          )}
        </aside>

        <EncarteCanvas backgroundUrl={temaSelecionado} onAdicionarProdutos={() => setActiveMenu('produtos')} />
      </div>
    </div>
  );
}
