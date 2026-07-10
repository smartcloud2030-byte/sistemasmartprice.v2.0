import React, { useEffect, useState } from 'react';
import { DatabaseBackup, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const STALE_HOURS = 26;

interface BackupStatusValue {
  lastRunAt: string;
  status: 'success' | 'failed';
  message?: string;
  fileName?: string;
}

const BackupStatus: React.FC = () => {
  const [data, setData] = useState<BackupStatusValue | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/settings/backup_status', { headers: { 'x-api-token': API_SECRET } });
        const json = await res.json();
        setData(json?.value || null);
      } catch (e) {
        console.error('Erro ao carregar status do backup:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-sm text-zinc-400">
        Carregando status do backup...
      </div>
    );
  }

  const hoursSince = data ? (Date.now() - new Date(data.lastRunAt).getTime()) / (1000 * 60 * 60) : Infinity;
  const isStale = hoursSince > STALE_HOURS;

  let state: 'ok' | 'stale' | 'failed' | 'none' = 'none';
  if (data) {
    if (data.status === 'failed') state = 'failed';
    else if (isStale) state = 'stale';
    else state = 'ok';
  }

  const config = {
    ok: {
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      label: 'Backup em dia',
    },
    stale: {
      icon: AlertTriangle,
      color: 'text-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      label: 'Backup atrasado',
    },
    failed: {
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50 dark:bg-red-900/20',
      label: 'Falha no último backup',
    },
    none: {
      icon: HelpCircle,
      color: 'text-zinc-400',
      bg: 'bg-zinc-100 dark:bg-zinc-800',
      label: 'Nenhum backup registrado',
    },
  }[state];

  const Icon = config.icon;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', config.bg)}>
        <Icon className={cn('w-5 h-5', config.color)} />
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2">
          <DatabaseBackup className="w-3.5 h-3.5 text-zinc-400" />
          <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Backup do Banco de Dados</p>
        </div>
        <p className={cn('text-sm font-bold mt-0.5', config.color)}>{config.label}</p>
        {data && (
          <p className="text-xs text-zinc-400 mt-0.5">
            Último: {new Date(data.lastRunAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {data.message ? ` · ${data.message}` : ''}
          </p>
        )}
      </div>
    </div>
  );
};

export default BackupStatus;
