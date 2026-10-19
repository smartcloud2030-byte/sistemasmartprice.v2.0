import React, { useEffect, useState } from 'react';
import { Globe, X } from 'lucide-react';
import { Dominio, dominiosAVencer, statusDominio, textoPrazo, DIAS_AVISO_DOMINIO } from '../lib/dominios';
import { cn } from '../lib/utils';

interface Props {
  onVerDominios: () => void;
}

/** Toast no canto quando algum domínio vence em até 30 dias (ou já venceu).
 * Mesmo jeito do aviso de despesa: fecha por sessão e volta ao recarregar. */
export default function DominioVencimentoNotificacao({ onVerDominios }: Props) {
  const [dominios, setDominios] = useState<Dominio[]>([]);
  const [dispensada, setDispensada] = useState(false);

  useEffect(() => {
    const carregar = () => {
      fetch('/api/dominios')
        .then((res) => (res.ok ? res.json() : []))
        .then(setDominios)
        .catch(() => {});
    };
    carregar();
    window.addEventListener('dominios-mudaram', carregar);
    return () => window.removeEventListener('dominios-mudaram', carregar);
  }, []);

  const alertas = dominiosAVencer(dominios);
  if (alertas.length === 0 || dispensada) return null;

  const algumVencido = alertas.some((d) => statusDominio(d.vencimento) === 'vencido');
  const primeiros = alertas.slice(0, 3);

  return (
    <div className="w-full no-print">
      <div className={cn(
        'rounded-2xl shadow-2xl border p-4 bg-white dark:bg-zinc-900',
        algumVencido ? 'border-red-300 dark:border-red-800' : 'border-amber-300 dark:border-amber-800',
      )}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
              algumVencido ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
            )}>
              <Globe className="w-4 h-4" />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-black dark:text-white">
              {alertas.length === 1 ? 'Domínio vencendo' : `${alertas.length} domínios vencendo`}
            </p>
          </div>
          <button
            onClick={() => setDispensada(true)}
            aria-label="Dispensar notificação"
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-zinc-600 dark:text-zinc-200" />
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          {primeiros.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-xs gap-2">
              <div className="min-w-0">
                <p className={cn('font-bold truncate', statusDominio(d.vencimento) === 'vencido' ? 'text-red-600' : 'text-amber-600')}>{d.dominio}</p>
                {d.registrador && <p className="text-[10px] text-zinc-400">{d.registrador}</p>}
              </div>
              <span className="text-zinc-400 flex-shrink-0">{textoPrazo(d.vencimento)}</span>
            </div>
          ))}
          {alertas.length > primeiros.length && (
            <p className="text-[11px] text-zinc-400">+ {alertas.length - primeiros.length} outro(s)</p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-400">Aviso a partir de {DIAS_AVISO_DOMINIO} dias</p>
          <button
            onClick={() => { setDispensada(true); onVerDominios(); }}
            className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-700 text-white transition-colors"
          >
            Ver domínios
          </button>
        </div>
      </div>
    </div>
  );
}
