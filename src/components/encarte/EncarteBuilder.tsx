import { ArrowLeft, LayoutTemplate } from 'lucide-react';
import { useStore } from '../../store';

export default function EncarteBuilder() {
  const { setView } = useStore();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center gap-4 px-6 sticky top-0 z-40">
        <button onClick={() => setView('editor')} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-black tracking-tighter uppercase">Encarte Online</h1>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center gap-3 text-center px-6">
        <LayoutTemplate className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
        <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Em construção</p>
      </main>
    </div>
  );
}
