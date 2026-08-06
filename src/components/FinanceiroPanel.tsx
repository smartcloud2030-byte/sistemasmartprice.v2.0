import React, { useState } from 'react';
import { X, CreditCard, AlertTriangle, Search, Wallet, Info } from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { totalDespesasDoMes, mesAnterior, mesSeguinte } from '../lib/despesas';
import FinanceiroDespesasTab from './FinanceiroDespesasTab';

interface Props {
  onClose: () => void;
}

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function FinanceiroPanel({ onClose }: Props) {
  const { allowedStores, togglePaymentBlock, despesas } = useStore();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'receitas' | 'despesas'>('receitas');
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const withSubscription = allowedStores.filter((s) => s.asaasSubscriptionId);
  const mrr = withSubscription.reduce((sum, s) => sum + (s.subscriptionValue || 0), 0);
  const despesasDoMesTotal = totalDespesasDoMes(despesas, selectedYear, selectedMonth);
  const resultado = mrr - despesasDoMesTotal;

  const handlePrevMonth = () => {
    const { ano, mes } = mesAnterior(selectedYear, selectedMonth);
    setSelectedYear(ano);
    setSelectedMonth(mes);
  };
  const handleNextMonth = () => {
    const { ano, mes } = mesSeguinte(selectedYear, selectedMonth);
    setSelectedYear(ano);
    setSelectedMonth(mes);
  };

  const filtered = withSubscription.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.cnpj.toLowerCase().includes(q) || s.bandeira?.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-600 rounded-lg text-white">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-black dark:text-white">Financeiro</h3>
              <p className="text-xs text-black dark:text-white opacity-60">Receitas, despesas e resultado do sistema</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-3 gap-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4">
            <div className="flex items-center gap-1.5">
              <p className="text-2xl font-black text-black dark:text-white tracking-tighter">{currency(mrr)}</p>
              <Info className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400" title="Receita atual (MRR) — sem histórico por mês">Receita Atual</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4">
            <p className="text-2xl font-black text-red-600 tracking-tighter">{currency(despesasDoMesTotal)}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Despesas do Mês</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4">
            <p className={cn('text-2xl font-black tracking-tighter', resultado >= 0 ? 'text-emerald-600' : 'text-red-600')}>{currency(resultado)}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Resultado</p>
          </div>
        </div>

        <div className="px-6 pt-4 flex gap-2">
          <button
            onClick={() => setActiveTab('receitas')}
            className={cn(
              'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors',
              activeTab === 'receitas' ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            )}
          >
            Receitas
          </button>
          <button
            onClick={() => setActiveTab('despesas')}
            className={cn(
              'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors',
              activeTab === 'despesas' ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            )}
          >
            Despesas
          </button>
        </div>

        {activeTab === 'receitas' ? (
          <>
            <div className="px-6 pt-4">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por CNPJ ou bandeira..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-black dark:text-white"
                />
              </div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar p-6 pt-4 space-y-2">
              {withSubscription.length === 0 ? (
                <p className="text-center text-xs font-bold uppercase tracking-widest text-zinc-400 py-10">
                  Nenhum CNPJ com assinatura ainda — crie uma em "Gerenciar Usuários".
                </p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-xs font-bold uppercase tracking-widest text-zinc-400 py-10">Nenhum resultado.</p>
              ) : (
                filtered.map((s) => (
                  <div key={s.cnpj} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                        s.isPaymentBlocked ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                      )}>
                        {s.isPaymentBlocked ? <AlertTriangle className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-black dark:text-white truncate">{s.cnpj} <span className="text-zinc-400 font-normal">· {s.bandeira}</span></p>
                        <p className="text-[11px] text-zinc-400">{currency(s.subscriptionValue || 0)}/mês · vence dia {s.subscriptionDueDay}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => togglePaymentBlock(s.cnpj)}
                      className={cn(
                        'px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm flex-shrink-0',
                        s.isPaymentBlocked
                          ? 'bg-orange-600 border-orange-600 text-white'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-400'
                      )}
                    >
                      {s.isPaymentBlocked ? 'Bloqueado' : 'Em dia'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <FinanceiroDespesasTab
            year={selectedYear}
            month={selectedMonth}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
          />
        )}
      </div>
    </div>
  );
}
