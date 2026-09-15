import React, { useState } from 'react';
import { X, Wallet, Clock } from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { totalDespesasDoMes, mesAnterior, mesSeguinte, formatMesAno, despesasAVencer } from '../lib/despesas';
import FinanceiroDespesasTab from './FinanceiroDespesasTab';
import FinanceiroSaldoTab from './FinanceiroSaldoTab';
import DespesasViagemModal from './DespesasViagemModal';

interface Props {
  onClose: () => void;
  initialTab?: 'despesas' | 'saldo' | 'viagens';
}

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function FinanceiroPanel({ onClose, initialTab = 'despesas' }: Props) {
  const { despesas, saldoEmConta } = useStore();
  const [activeTab, setActiveTab] = useState<'despesas' | 'saldo' | 'viagens'>(initialTab);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const despesasDoMesTotal = totalDespesasDoMes(despesas, selectedYear, selectedMonth);
  const devedor = (saldoEmConta || 0) < 0;
  const alertasVencimento = despesasAVencer(despesas);
  const totalAVencer = alertasVencimento.reduce((sum, a) => sum + a.despesa.valor, 0);

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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-600 rounded-lg text-white">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-black dark:text-white">Financeiro</h3>
              <p className="text-xs text-black dark:text-white opacity-60">Despesas e saldo do sistema</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className={cn('p-6 grid grid-cols-2 md:grid-cols-3 gap-4 border-b border-zinc-200 dark:border-zinc-800', activeTab === 'viagens' && 'hidden')}>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4">
            <p className="text-2xl font-black text-red-600 tracking-tighter">{currency(despesasDoMesTotal)}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Despesas · {formatMesAno(selectedYear, selectedMonth)}</p>
          </div>
          <button
            onClick={() => setActiveTab('saldo')}
            className={cn(
              'rounded-2xl p-4 text-left transition-colors',
              devedor ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30' : 'bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            )}
          >
            <p className={cn('text-2xl font-black tracking-tighter', devedor ? 'text-red-600' : 'text-black dark:text-white')}>
              {currency(Math.abs(saldoEmConta || 0))}
            </p>
            <p className={cn('text-[10px] font-black uppercase tracking-widest', devedor ? 'text-red-500' : 'text-zinc-400')}>
              {devedor ? 'Saldo devedor' : 'Saldo em conta'}
            </p>
          </button>
          <button
            onClick={() => setActiveTab('despesas')}
            className={cn(
              'rounded-2xl p-4 text-left transition-colors',
              alertasVencimento.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30' : 'bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            )}
          >
            <p className={cn('text-2xl font-black tracking-tighter', alertasVencimento.length > 0 ? 'text-amber-600' : 'text-black dark:text-white')}>
              {currency(totalAVencer)}
            </p>
            <p className={cn('text-[10px] font-black uppercase tracking-widest flex items-center gap-1', alertasVencimento.length > 0 ? 'text-amber-600' : 'text-zinc-400')}>
              {alertasVencimento.length > 0 && <Clock className="w-3 h-3" />}
              Despesas a vencer{alertasVencimento.length > 0 && ` · ${alertasVencimento.length}`}
            </p>
          </button>
        </div>

        <div className="px-6 pt-4 flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('despesas')}
            className={cn(
              'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors',
              activeTab === 'despesas' ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            )}
          >
            Despesas
          </button>
          <button
            onClick={() => setActiveTab('saldo')}
            className={cn(
              'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors',
              activeTab === 'saldo' ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            )}
          >
            Saldo
          </button>
          <button
            onClick={() => setActiveTab('viagens')}
            className={cn(
              'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors',
              activeTab === 'viagens' ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            )}
          >
            Viagens
          </button>
        </div>

        {activeTab === 'viagens' ? (
          <div className="flex-grow overflow-hidden">
            <DespesasViagemModal />
          </div>
        ) : activeTab === 'saldo' ? (
          <FinanceiroSaldoTab />
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
