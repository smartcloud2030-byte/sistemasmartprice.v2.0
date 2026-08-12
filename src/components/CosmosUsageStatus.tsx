import React, { useEffect, useState } from 'react';
import { Barcode, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { getUsageState, COSMOS_DAILY_LIMIT, CosmosUsageState } from '../lib/cosmosUsage';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

interface CosmosUsageValue {
  date: string;
  count: number;
}

const CosmosUsageStatus: React.FC = () => {
  const [data, setData] = useState<CosmosUsageValue | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/settings/cosmos_usage_daily', { headers: { 'x-api-token': API_SECRET } });
        const json = await res.json();
        setData(json?.value || null);
      } catch (e) {
        console.error('Erro ao carregar uso da Cosmos:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-sm text-zinc-400">
        Carregando uso da Cosmos...
      </div>
    );
  }

  const count = data?.count ?? 0;
  const state = getUsageState(count, COSMOS_DAILY_LIMIT);

  const config: Record<CosmosUsageState, { icon: React.ElementType; color: string; bg: string; bar: string; label: string }> = {
    ok: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', bar: 'bg-emerald-500', label: 'Cota tranquila' },
    warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', bar: 'bg-amber-500', label: 'Perto do limite' },
    critical: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', bar: 'bg-red-500', label: 'Cota esgotada' },
  };
  const { icon: Icon, color, bg, bar, label } = config[state];
  const percent = Math.min((count / COSMOS_DAILY_LIMIT) * 100, 100);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
        <Icon className={cn('w-5 h-5', color)} />
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2">
          <Barcode className="w-3.5 h-3.5 text-zinc-400" />
          <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Consultas de código de barras (Cosmos)</p>
        </div>
        <p className={cn('text-sm font-bold mt-0.5', color)}>{label} — {count}/{COSMOS_DAILY_LIMIT} hoje</p>
        <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 mt-2">
          <div className={cn('h-1.5 rounded-full transition-all', bar)} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
};

export default CosmosUsageStatus;
