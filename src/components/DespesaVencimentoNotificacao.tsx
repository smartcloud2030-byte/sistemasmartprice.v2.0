import React, { useState } from 'react';
import { Clock, X } from 'lucide-react';
import { useStore } from '../store';
import { despesasAVencer } from '../lib/despesas';
import { cn } from '../lib/utils';

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  onVerDespesas: () => void;
}

/** Toast no canto que aparece sozinho quando o admin abre o painel, se tiver
 * despesa vencida ou a vencer nos próximos dias — não depende de abrir o
 * Financeiro pra saber disso. Fecha por sessão (some ao clicar X ou "Ver
 * despesas"); reaparece na próxima vez que o painel for aberto/recarregado. */
export default function DespesaVencimentoNotificacao({ onVerDespesas }: Props) {
  const { despesas } = useStore();
  const [dispensada, setDispensada] = useState(false);

  const alertas = despesasAVencer(despesas);
  if (alertas.length === 0 || dispensada) return null;

  const temVencida = alertas.some((a) => a.status === 'vencida');
  const total = alertas.reduce((sum, a) => sum + a.despesa.valor, 0);
  const primeiras = alertas.slice(0, 3);

  return (
    <div className="fixed bottom-6 right-6 z-40 w-full max-w-sm no-print">
      <div className={cn(
        'rounded-2xl shadow-2xl border p-4 bg-white dark:bg-zinc-900',
        temVencida ? 'border-red-300 dark:border-red-800' : 'border-amber-300 dark:border-amber-800',
      )}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
              temVencida ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
            )}>
              <Clock className="w-4 h-4" />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-black dark:text-white">
              {alertas.length === 1 ? 'Despesa' : `${alertas.length} despesas`} {temVencida ? 'vencida ou a vencer' : 'a vencer'}
            </p>
          </div>
          <button
            onClick={() => setDispensada(true)}
            aria-label="Dispensar notificação"
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          {primeiras.map((a) => (
            <div key={`${a.despesa.id}-${a.ano}-${a.mes}`} className="flex items-center justify-between text-xs">
              <span className={cn('font-bold truncate', a.status === 'vencida' ? 'text-red-600' : 'text-amber-600')}>
                {a.despesa.descricao}
              </span>
              <span className="text-zinc-400 flex-shrink-0 ml-2">{currency(a.despesa.valor)}</span>
            </div>
          ))}
          {alertas.length > primeiras.length && (
            <p className="text-[11px] text-zinc-400">+ {alertas.length - primeiras.length} outra(s)</p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-400">Total: <span className="font-bold text-black dark:text-white">{currency(total)}</span></p>
          <button
            onClick={() => { setDispensada(true); onVerDespesas(); }}
            className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-700 text-white transition-colors"
          >
            Ver despesas
          </button>
        </div>
      </div>
    </div>
  );
}
