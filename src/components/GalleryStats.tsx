import React, { useState, useEffect } from 'react';
import { HardDrive, RefreshCw } from 'lucide-react';

interface Stats {
  usedGB: number;
  totalGB: number;
  fileCount: number;
  usedBytes: number;
}

const GalleryStats: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/gallery/stats', {
        headers: { 'x-api-token': 'smartprice-api-2026' }
      });
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Erro ao carregar estatísticas:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Atualiza a cada 30s
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div className="text-gray-500">Carregando...</div>;

  const percentUsed = (stats.usedGB / stats.totalGB) * 100;

  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-bold text-black dark:text-white">Espaço da Galeria</h3>
        </div>
        <button onClick={fetchStats} disabled={isLoading} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-zinc-600 dark:text-zinc-400">{stats.usedGB} GB / {stats.totalGB} GB</span>
            <span className="font-bold text-black dark:text-white">{percentUsed.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all ${percentUsed > 80 ? 'bg-red-500' : percentUsed > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(percentUsed, 100)}%` }}
            />
          </div>
        </div>

        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <p>{stats.fileCount} arquivos</p>
          <p>{(stats.usedBytes / 1024 / 1024).toFixed(2)} MB</p>
        </div>
      </div>
    </div>
  );
};

export default GalleryStats;
