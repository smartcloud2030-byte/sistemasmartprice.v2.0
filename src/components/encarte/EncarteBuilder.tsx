import React, { useState } from 'react';
import { useStore } from '../../store';
import { ArrowLeft, Store, LayoutTemplate, ShoppingBag } from 'lucide-react';
import StoreProfileManager from './StoreProfileManager';
import MoldeList from './MoldeList';
import EncarteWeekly from './EncarteWeekly';

type Tab = 'lojas' | 'moldes' | 'semanal';

export default function EncarteBuilder() {
  const { setView } = useStore();
  const [tab, setTab] = useState<Tab>('semanal');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('editor')} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-black tracking-tighter uppercase">Encarte Online</h1>
        </div>

        <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
          <button
            onClick={() => setTab('semanal')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'semanal' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" /> Montar encarte
          </button>
          <button
            onClick={() => setTab('moldes')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'moldes' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
          >
            <LayoutTemplate className="w-3.5 h-3.5" /> Moldes
          </button>
          <button
            onClick={() => setTab('lojas')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'lojas' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
          >
            <Store className="w-3.5 h-3.5" /> Lojas
          </button>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto">
        {tab === 'semanal' && <EncarteWeekly />}
        {tab === 'moldes' && <MoldeList />}
        {tab === 'lojas' && <StoreProfileManager />}
      </main>
    </div>
  );
}
