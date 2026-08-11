import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { ArrowLeft, LifeBuoy, Server, Printer, Wifi, HardDrive, AlertTriangle, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import NotaFiscalModal from './NotaFiscalModal';
import NotaFiscalHistorico from './NotaFiscalHistorico';
import { getSocket } from '../hooks/useSupportSocket';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

function useMonitoringOverview() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await fetch('/api/monitoring/overview', { headers: { 'x-api-token': API_SECRET } });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (e) {
        console.error('Erro ao carregar visão geral do monitoramento:', e);
        setError('Erro ao carregar dados de monitoramento — tente novamente.');
      }
    };
    fetchOverview();
    const interval = setInterval(fetchOverview, 30 * 1000);

    // Além do polling a cada 30s, escuta o mesmo evento que sweepAlerts()
    // emite pra sala admin_room (src/monitoring.ts) — assim que um alerta
    // muda de estado, refaz a busca na hora em vez de esperar o próximo tick.
    const socket = getSocket();
    const onMonitoringAlert = () => fetchOverview();
    socket.on('monitoring:alert', onMonitoringAlert);

    return () => {
      clearInterval(interval);
      socket.off('monitoring:alert', onMonitoringAlert);
    };
  }, []);

  return { data, error };
}

interface MonitoringMachineAlert {
  machineName: string;
  cnpj: string;
  alertState: 'disk_alert' | 'mem_alert' | 'offline';
}

const MONITORING_ALERT_LABEL: Record<MonitoringMachineAlert['alertState'], string> = {
  disk_alert: 'disco crítico',
  mem_alert: 'memória crítica',
  offline: 'offline',
};

// Alerta destacado no topo — fonte de verdade é o overview já
// poll(30s)/socket-refresh pelo useMonitoringOverview
// — assim o banner já sai correto num carregamento novo da página, sem
// depender de estar conectado ao socket no instante em que o alerta disparou.
function MonitoringAlertBanner({ overview }: { overview: any }) {
  if (!overview?.stores) return null;

  const alerting: MonitoringMachineAlert[] = [];
  for (const store of overview.stores) {
    for (const m of [...(store.servers || []), ...(store.workstations || [])]) {
      if (m.alertState && m.alertState !== 'ok') {
        alerting.push({ machineName: m.machineName, cnpj: store.cnpj, alertState: m.alertState });
      }
    }
  }
  if (alerting.length === 0) return null;

  const storesAffected = new Set(alerting.map((a) => a.cnpj)).size;
  const summary = alerting.length === 1
    ? `${alerting[0].machineName} (loja ${alerting[0].cnpj}) com alerta`
    : `${alerting.length} máquinas com alerta em ${storesAffected} loja${storesAffected === 1 ? '' : 's'}`;
  const detail = alerting
    .slice(0, 5)
    .map((a) => `${a.machineName}: ${MONITORING_ALERT_LABEL[a.alertState]}`)
    .join(' · ');

  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-black text-red-600 uppercase tracking-wide">{summary}</p>
        <p className="text-xs text-red-600/80 mt-0.5">
          {detail}{alerting.length > 5 ? ' · ...' : ''}
        </p>
      </div>
    </div>
  );
}

const SmartHelpDashboard: React.FC = () => {
  const { setView } = useStore();
  const { data: monitoringOverview, error: monitoringError } = useMonitoringOverview();
  const [showNotaFiscal, setShowNotaFiscal] = useState(false);
  const [historicoKey, setHistoricoKey] = useState(0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('dashboard')}
            className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500/50 hover:shadow-md transition-all text-black dark:text-white"
            title="Voltar ao painel"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-lg shadow-emerald-500/20">
            <LifeBuoy className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white">SmartHelp</h1>
            <p className="text-black dark:text-white opacity-60 text-sm font-medium">
              Suporte de infraestrutura das lojas do Grupo Fênix
            </p>
          </div>
        </div>

        <MonitoringAlertBanner overview={monitoringOverview} />
        {monitoringError && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-red-600">{monitoringError}</p>
          </div>
        )}

        {/* Content */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setShowNotaFiscal(true)}
              className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-emerald-500/50 hover:shadow-md transition-all"
            >
              <FileText className="w-6 h-6 text-emerald-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white">Emitir Nota Fiscal</span>
            </button>
            <button
              onClick={() => setView('monitoring')}
              className={cn(
                "flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border transition-all hover:shadow-md",
                monitoringOverview?.hasActiveAlert ? "border-red-300 dark:border-red-900/50" : "border-zinc-200 dark:border-zinc-700"
              )}
            >
              <Server className={cn("w-6 h-6", monitoringOverview?.hasActiveAlert ? "text-red-600" : "text-emerald-600")} />
              <span className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white">Servidores</span>
              <span className="text-[9px] text-zinc-400">
                {monitoringOverview ? `${monitoringOverview.serverOnline}/${monitoringOverview.serverTotal} online` : 'Carregando...'}
              </span>
            </button>
            <button
              onClick={() => setView('monitoring')}
              className={cn(
                "flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border transition-all hover:shadow-md",
                monitoringOverview?.hasActiveAlert ? "border-red-300 dark:border-red-900/50" : "border-zinc-200 dark:border-zinc-700"
              )}
            >
              <HardDrive className={cn("w-6 h-6", monitoringOverview?.hasActiveAlert ? "text-red-600" : "text-emerald-600")} />
              <span className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white">Máquinas</span>
              <span className="text-[9px] text-zinc-400">
                {monitoringOverview ? `${monitoringOverview.machineOnline}/${monitoringOverview.machineTotal} online` : 'Carregando...'}
              </span>
            </button>
            {[
              { icon: Printer, label: 'Impressoras' },
              { icon: Wifi, label: 'Provedor' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 text-zinc-400">
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                <span className="text-[9px] text-zinc-400">Em construção</span>
              </div>
            ))}
            <NotaFiscalHistorico key={historicoKey} />
          </div>
        </div>
      </div>

      {showNotaFiscal && (
        <NotaFiscalModal
          onClose={() => setShowNotaFiscal(false)}
          onEmitted={() => setHistoricoKey((k) => k + 1)}
        />
      )}
    </div>
  );
};

export default SmartHelpDashboard;
