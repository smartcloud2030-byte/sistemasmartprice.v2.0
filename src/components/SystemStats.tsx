import React, { useEffect, useState } from 'react';
import { HardDrive, MemoryStick, Cpu, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const CRITICAL_THRESHOLD = 85;
const WARNING_THRESHOLD = 65;

interface SystemStatsResponse {
  gallery: { usedBytes: number; fileCount: number };
  disk: { totalBytes: number; usedBytes: number; freeBytes: number; available: boolean };
  memory: { totalBytes: number; usedBytes: number; freeBytes: number };
  cpu: { cores: number; loadPercent: number };
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 GB';
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb < 1) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${gb.toFixed(1)} GB`;
}

function barColor(percent: number): string {
  if (percent >= CRITICAL_THRESHOLD) return 'bg-red-500';
  if (percent >= WARNING_THRESHOLD) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function textColor(percent: number): string {
  if (percent >= CRITICAL_THRESHOLD) return 'text-red-600';
  if (percent >= WARNING_THRESHOLD) return 'text-yellow-600';
  return 'text-emerald-600';
}

const Gauge: React.FC<{ label: string; icon: any; percent: number; detail: string }> = ({ label, icon: Icon, percent, detail }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-bold text-black dark:text-white">{label}</span>
      </div>
      <span className={cn('text-sm font-black', textColor(percent))}>{percent.toFixed(1)}%</span>
    </div>
    <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
      <div className={cn('h-full transition-all', barColor(percent))} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
    <p className="text-xs text-zinc-400">{detail}</p>
  </div>
);

const SystemStats: React.FC = () => {
  const [stats, setStats] = useState<SystemStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/system/stats', { headers: { 'x-api-token': API_SECRET } });
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Erro ao carregar estatísticas do sistema:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 text-sm text-zinc-400">
        Carregando estatísticas do sistema...
      </div>
    );
  }

  const diskUsedPercent = stats.disk.available && stats.disk.totalBytes > 0
    ? (stats.disk.usedBytes / stats.disk.totalBytes) * 100
    : 0;
  const galleryFreeBytes = Math.max(0, stats.disk.totalBytes - stats.gallery.usedBytes);
  const memPercent = stats.memory.totalBytes > 0 ? (stats.memory.usedBytes / stats.memory.totalBytes) * 100 : 0;
  const cpuPercent = stats.cpu.loadPercent;

  const alerts: string[] = [];
  if (stats.disk.available && diskUsedPercent >= CRITICAL_THRESHOLD) alerts.push(`Disco em nível crítico: ${diskUsedPercent.toFixed(0)}% utilizado`);
  if (memPercent >= CRITICAL_THRESHOLD) alerts.push(`Memória em nível crítico: ${memPercent.toFixed(0)}% utilizada`);
  if (cpuPercent >= CRITICAL_THRESHOLD) alerts.push(`Processador em nível crítico: ${cpuPercent.toFixed(0)}% de carga`);

  return (
    <div className="space-y-3">
      {alerts.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            {alerts.map(a => (
              <p key={a} className="text-sm font-bold text-red-700 dark:text-red-400">{a}</p>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400">Recursos do Servidor</h2>
          <button onClick={fetchStats} disabled={isLoading} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
            <RefreshCw className={cn('w-3.5 h-3.5 text-zinc-400', isLoading && 'animate-spin')} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Gauge
            label="Disco (Galeria de Imagens)"
            icon={HardDrive}
            percent={diskUsedPercent}
            detail={stats.disk.available
              ? `${formatBytes(stats.gallery.usedBytes)} em imagens · ${formatBytes(galleryFreeBytes)} livres de ${formatBytes(stats.disk.totalBytes)} · ${stats.gallery.fileCount} arquivos`
              : `${formatBytes(stats.gallery.usedBytes)} em imagens · ${stats.gallery.fileCount} arquivos (total do disco indisponível nesta plataforma)`}
          />
          <Gauge
            label="Memória"
            icon={MemoryStick}
            percent={memPercent}
            detail={`${formatBytes(stats.memory.usedBytes)} usados · ${formatBytes(stats.memory.freeBytes)} livres de ${formatBytes(stats.memory.totalBytes)}`}
          />
          <Gauge
            label="Processador (CPU)"
            icon={Cpu}
            percent={cpuPercent}
            detail={`${stats.cpu.cores} núcleos${cpuPercent === 0 ? ' · carga indisponível nesta plataforma' : ''}`}
          />
        </div>
      </div>
    </div>
  );
};

export default SystemStats;
