import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, Server, HardDrive, MemoryStick, Cpu, RefreshCw, AlertTriangle, Save } from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { Gauge } from './ui/Gauge';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

interface MachineData {
  id: number;
  machineName: string;
  role: 'server' | 'workstation';
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  lastSeenAt: string | null;
  alertState: 'ok' | 'disk_alert' | 'mem_alert' | 'offline';
}

interface StoreOverview {
  cnpj: string;
  servers: MachineData[];
  workstations: MachineData[];
}

interface OverviewResponse {
  serverOnline: number;
  serverTotal: number;
  machineOnline: number;
  machineTotal: number;
  hasActiveAlert: boolean;
  stores: StoreOverview[];
}

interface HistoryPoint {
  timestamp: string;
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
}

const ALERT_BADGE: Record<MachineData['alertState'], { label: string; className: string }> = {
  ok: { label: 'Normal', className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' },
  disk_alert: { label: 'Disco crítico', className: 'bg-red-100 dark:bg-red-900/30 text-red-600' },
  mem_alert: { label: 'Memória crítica', className: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' },
  offline: { label: 'Offline', className: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500' },
};

function MachineTile({ machine, onClick }: { machine: MachineData; onClick: () => void }) {
  const badge = ALERT_BADGE[machine.alertState];
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-1.5 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition-all text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-black dark:text-white truncate">{machine.machineName}</span>
        <span className={cn('px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wide flex-shrink-0', badge.className)}>{badge.label}</span>
      </div>
      <p className="text-[10px] text-zinc-400">
        CPU {machine.cpuPercent?.toFixed(0) ?? '-'}% · RAM {machine.memPercent?.toFixed(0) ?? '-'}% · Disco {machine.diskPercent?.toFixed(0) ?? '-'}%
      </p>
    </button>
  );
}

// ── Gráfico de histórico (CPU/RAM/Disco) ──────────────────────────────────
// Construído seguindo a skill `dataviz`:
// - Paleta: os 3 primeiros slots categóricos do palette.md (blue/orange/aqua),
//   validados via scripts/validate_palette.js (ALL CHECKS PASS, tanto claro
//   quanto escuro — worst-case CVD ΔE 9.2 light / 9.4 dark, normal-vision
//   ΔE 27.6 light / 26.5 dark). Cores expostas como CSS vars com variante
//   `dark:` (padrão de arbitrary properties do Tailwind) em vez de hex fixo,
//   pra trocar de step junto com o tema.
// - O aqua (disco) fica abaixo de 3:1 de contraste no fundo claro — por isso
//   a legenda e o rótulo do valor final usam sempre texto em tinta neutra
//   (nunca a cor da série), com um traço curto da cor ao lado como chave de
//   identidade (regra "texto nunca veste a cor da série").
// - Marcas: linha 2px, marcador final ≥8px com anel de 2px na cor da
//   superfície, grid/eixo em cinza recessivo hairline.
// - Interação: crosshair + tooltip com as 3 séries no ponto mais próximo do
//   ponteiro, e navegação por teclado (setas) equivalente ao hover.
// - Acessibilidade: tabela oculta visualmente (sr-only) com os mesmos dados,
//   já que o tooltip só deve reforçar — nunca ser o único jeito de ler o
//   valor.
const SERIES_CHART_WIDTH = 640;
const SERIES_CHART_HEIGHT = 220;
const CHART_PADDING = { top: 10, right: 12, bottom: 22, left: 32 };

const HISTORY_SERIES = [
  { key: 'cpuPercent' as const, label: 'CPU', varName: '--series-cpu' },
  { key: 'memPercent' as const, label: 'RAM', varName: '--series-ram' },
  { key: 'diskPercent' as const, label: 'Disco', varName: '--series-disk' },
];

function formatHistoryTimestamp(ts: string, range: '24h' | '7d'): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return range === '24h'
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function HistoryLineChart({ points, range }: { points: HistoryPoint[]; range: '24h' | '7d' }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const innerWidth = SERIES_CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = SERIES_CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const xForIndex = (i: number) =>
    points.length <= 1 ? CHART_PADDING.left + innerWidth / 2 : CHART_PADDING.left + (i / (points.length - 1)) * innerWidth;
  const yForValue = (v: number) => CHART_PADDING.top + innerHeight - (Math.min(Math.max(v, 0), 100) / 100) * innerHeight;

  // Constrói o path pulando valores nulos (abre um novo subpercurso em vez
  // de interpolar através de um buraco nos dados).
  const buildPath = (key: 'cpuPercent' | 'memPercent' | 'diskPercent') => {
    let d = '';
    let started = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) {
        started = false;
        return;
      }
      d += `${started ? 'L' : 'M'} ${xForIndex(i).toFixed(1)} ${yForValue(v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  };

  const yTicks = [0, 25, 50, 75, 100];
  const lastIndex = points.length - 1;
  const xTickIndices = Array.from(
    new Set([0, Math.round(lastIndex / 3), Math.round((lastIndex * 2) / 3), lastIndex])
  ).filter((i) => i >= 0);

  const moveHover = (clientX: number, rect: DOMRect) => {
    const relX = ((clientX - rect.left) / rect.width) * SERIES_CHART_WIDTH;
    let nearest = 0;
    let minDist = Infinity;
    points.forEach((_, i) => {
      const dist = Math.abs(xForIndex(i) - relX);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  };

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const tooltipX = hoverIndex != null ? xForIndex(hoverIndex) : 0;
  const tooltipFlipLeft = tooltipX > SERIES_CHART_WIDTH * 0.6;
  const tooltipWidth = 118;
  const tooltipBoxX = tooltipFlipLeft ? tooltipX - tooltipWidth - 8 : tooltipX + 8;

  return (
    <div
      className={cn(
        'space-y-3',
        '[--series-cpu:#2a78d6] dark:[--series-cpu:#3987e5]',
        '[--series-ram:#eb6834] dark:[--series-ram:#d95926]',
        '[--series-disk:#1baf7a] dark:[--series-disk:#199e70]',
        '[--chart-grid:#e1e0d9] dark:[--chart-grid:#2c2c2a]',
        '[--chart-axis:#c3c2b7] dark:[--chart-axis:#383835]',
        '[--chart-muted:#898781] dark:[--chart-muted:#898781]',
        '[--chart-surface:#fcfcfb] dark:[--chart-surface:#1a1a19]',
        '[--chart-ink:#0b0b0b] dark:[--chart-ink:#ffffff]'
      )}
    >
      <div>
        <svg
          viewBox={`0 0 ${SERIES_CHART_WIDTH} ${SERIES_CHART_HEIGHT}`}
          className="w-full h-auto touch-none"
          tabIndex={0}
          aria-label={`Gráfico de uso de CPU, memória e disco no período de ${range === '24h' ? 'últimas 24 horas' : 'últimos 7 dias'}. Use as setas do teclado para navegar pelos pontos; os valores completos também estão na tabela abaixo.`}
          onMouseMove={(e) => moveHover(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHoverIndex(null)}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) moveHover(t.clientX, e.currentTarget.getBoundingClientRect());
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (t) moveHover(t.clientX, e.currentTarget.getBoundingClientRect());
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              setHoverIndex((prev) => Math.min((prev ?? -1) + 1, lastIndex));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setHoverIndex((prev) => Math.max((prev ?? lastIndex + 1) - 1, 0));
            } else if (e.key === 'Escape') {
              setHoverIndex(null);
            }
          }}
        >
          {/* Gridlines + rótulos do eixo Y (0-100%, hairline, tinta recessiva) */}
          {yTicks.map((t) => {
            const y = yForValue(t);
            return (
              <g key={t}>
                <line x1={CHART_PADDING.left} x2={SERIES_CHART_WIDTH - CHART_PADDING.right} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={CHART_PADDING.left - 6} y={y} textAnchor="end" dominantBaseline="middle" className="fill-[var(--chart-muted)] text-[9px]">
                  {t}%
                </text>
              </g>
            );
          })}

          {/* Eixo X (linha de base) + rótulos de timestamp */}
          <line
            x1={CHART_PADDING.left}
            x2={SERIES_CHART_WIDTH - CHART_PADDING.right}
            y1={CHART_PADDING.top + innerHeight}
            y2={CHART_PADDING.top + innerHeight}
            stroke="var(--chart-axis)"
            strokeWidth={1}
          />
          {xTickIndices.map((i) => (
            <text key={i} x={xForIndex(i)} y={SERIES_CHART_HEIGHT - 6} textAnchor="middle" className="fill-[var(--chart-muted)] text-[9px]">
              {formatHistoryTimestamp(points[i].timestamp, range)}
            </text>
          ))}

          {/* Crosshair (segue o ponteiro/teclado, ancora no X mais próximo) */}
          {hovered && (
            <line
              x1={tooltipX}
              x2={tooltipX}
              y1={CHART_PADDING.top}
              y2={CHART_PADDING.top + innerHeight}
              stroke="var(--chart-axis)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Séries — linha 2px, join/cap arredondado */}
          {HISTORY_SERIES.map((s) => (
            <path key={s.key} d={buildPath(s.key)} fill="none" stroke={`var(${s.varName})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {/* Marcador final de cada série — ≥8px, com anel de 2px na cor da superfície */}
          {HISTORY_SERIES.map((s) => {
            const lastValue = [...points].reverse().find((p) => p[s.key] != null)?.[s.key];
            if (lastValue == null) return null;
            const idx = points.length - 1 - [...points].reverse().findIndex((p) => p[s.key] != null);
            return (
              <circle
                key={s.key}
                cx={xForIndex(idx)}
                cy={yForValue(lastValue)}
                r={4}
                fill={`var(${s.varName})`}
                stroke="var(--chart-surface)"
                strokeWidth={2}
              />
            );
          })}

          {/* Marcador do ponto sob hover/foco, por série */}
          {hovered &&
            hoverIndex != null &&
            HISTORY_SERIES.map((s) => {
              const v = hovered[s.key];
              if (v == null) return null;
              return (
                <circle key={s.key} cx={tooltipX} cy={yForValue(v)} r={4} fill={`var(${s.varName})`} stroke="var(--chart-surface)" strokeWidth={2} />
              );
            })}

          {/* Tooltip — uma leitura só, com todas as séries no ponto */}
          {hovered && hoverIndex != null && (
            <g>
              <rect
                x={tooltipBoxX}
                y={CHART_PADDING.top + 2}
                width={tooltipWidth}
                height={70}
                rx={8}
                className="fill-[var(--chart-surface)]"
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text x={tooltipBoxX + 8} y={CHART_PADDING.top + 16} className="fill-[var(--chart-ink)] text-[9px] font-bold">
                {formatHistoryTimestamp(hovered.timestamp, range)}
              </text>
              {HISTORY_SERIES.map((s, i) => (
                <g key={s.key}>
                  <line
                    x1={tooltipBoxX + 8}
                    x2={tooltipBoxX + 18}
                    y1={CHART_PADDING.top + 30 + i * 14}
                    y2={CHART_PADDING.top + 30 + i * 14}
                    stroke={`var(${s.varName})`}
                    strokeWidth={2}
                  />
                  <text x={tooltipBoxX + 24} y={CHART_PADDING.top + 33 + i * 14} className="fill-[var(--chart-muted)] text-[9px]">
                    {s.label}
                  </text>
                  <text x={tooltipBoxX + tooltipWidth - 8} y={CHART_PADDING.top + 33 + i * 14} textAnchor="end" className="fill-[var(--chart-ink)] text-[9px] font-bold">
                    {hovered[s.key] != null ? `${hovered[s.key]!.toFixed(0)}%` : '-'}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* Legenda — sempre presente com ≥2 séries; texto em tinta neutra (nunca
          na cor da série) com um traço curto da cor como chave de identidade,
          e o valor mais recente como rótulo direto (evita depender só da cor
          quando a série é o aqua, que fica sob 3:1 de contraste no claro). */}
      <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
        {HISTORY_SERIES.map((s) => {
          const lastValue = [...points].reverse().find((p) => p[s.key] != null)?.[s.key];
          return (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: `var(${s.varName})` }} />
              {s.label} {lastValue != null ? `· ${lastValue.toFixed(0)}%` : ''}
            </span>
          );
        })}
      </div>

      {/* Tabela oculta visualmente — mesmos dados do gráfico, pra quem usa
          leitor de tela (tooltip só reforça, nunca é a única forma de ler). */}
      <table className="sr-only">
        <caption>Histórico de uso de CPU, memória e disco</caption>
        <thead>
          <tr>
            <th scope="col">Horário</th>
            <th scope="col">CPU</th>
            <th scope="col">RAM</th>
            <th scope="col">Disco</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{formatHistoryTimestamp(p.timestamp, range)}</td>
              <td>{p.cpuPercent != null ? `${p.cpuPercent.toFixed(0)}%` : 'sem dado'}</td>
              <td>{p.memPercent != null ? `${p.memPercent.toFixed(0)}%` : 'sem dado'}</td>
              <td>{p.diskPercent != null ? `${p.diskPercent.toFixed(0)}%` : 'sem dado'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MachineHistoryPanel({ machine, onClose }: { machine: MachineData; onClose: () => void }) {
  const [range, setRange] = useState<'24h' | '7d'>('24h');
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetch(`/api/monitoring/machines/${machine.id}/history?range=${range}`, { headers: { 'x-api-token': API_SECRET } })
      .then((res) => {
        if (!res.ok) throw new Error(`Falha ao carregar histórico (status ${res.status})`);
        return res.json();
      })
      .then((data) => setPoints(data.points || []))
      .catch(() => {
        setPoints([]);
        setError('Erro ao carregar histórico — tente novamente.');
      })
      .finally(() => setIsLoading(false));
  }, [machine.id, range]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-black dark:text-white">{machine.machineName}</h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">✕</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRange('24h')} className={cn('px-3 py-1.5 rounded-full text-[10px] font-black uppercase', range === '24h' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400')}>24h</button>
          <button onClick={() => setRange('7d')} className={cn('px-3 py-1.5 rounded-full text-[10px] font-black uppercase', range === '7d' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400')}>7 dias</button>
        </div>
        {isLoading ? (
          <p className="text-sm text-zinc-400">Carregando histórico...</p>
        ) : error ? (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        ) : points.length === 0 ? (
          <p className="text-sm text-zinc-400">Sem dados suficientes ainda para este período.</p>
        ) : (
          <HistoryLineChart points={points} range={range} />
        )}
      </div>
    </div>
  );
}

function StoreSection({ store, onOpenMachine }: { store: StoreOverview; onOpenMachine: (m: MachineData) => void }) {
  const [expanded, setExpanded] = useState(false);
  const server = store.servers[0];

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
        <div className="flex items-center gap-3">
          <Server className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-bold text-black dark:text-white">Loja {store.cnpj}</span>
          <span className="text-xs text-zinc-400">
            {store.workstations.filter((m) => m.alertState !== 'offline').length}/{store.workstations.length} máquinas online
          </span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="p-4 space-y-4 border-t border-zinc-200 dark:border-zinc-700">
          {server && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
              <Gauge label="CPU (Servidor)" icon={Cpu} percent={server.cpuPercent || 0} detail={server.alertState === 'offline' ? 'Servidor offline' : 'Ao vivo'} />
              <Gauge label="RAM (Servidor)" icon={MemoryStick} percent={server.memPercent || 0} detail={server.alertState === 'offline' ? 'Servidor offline' : 'Ao vivo'} />
              <Gauge label="Disco (Servidor)" icon={HardDrive} percent={server.diskPercent || 0} detail={server.alertState === 'offline' ? 'Servidor offline' : 'Ao vivo'} />
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {store.workstations.map((m) => (
              <MachineTile key={m.id} machine={m} onClick={() => onOpenMachine(m)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MonitoringDashboard() {
  const { setView, monitoringThresholds, loadMonitoringThresholds, saveMonitoringThresholds } = useStore();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null);
  const [thresholdsForm, setThresholdsForm] = useState(monitoringThresholds);

  const fetchOverview = () => {
    fetch('/api/monitoring/overview', { headers: { 'x-api-token': API_SECRET } })
      .then((res) => {
        if (!res.ok) throw new Error(`Falha ao carregar visão geral (status ${res.status})`);
        return res.json();
      })
      .then((data: OverviewResponse) => {
        setOverview(data);
        setOverviewError(null);
      })
      .catch(() => setOverviewError('Erro ao carregar dados de monitoramento — tente novamente.'));
  };

  useEffect(() => {
    loadMonitoringThresholds();
    fetchOverview();
    const interval = setInterval(fetchOverview, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setThresholdsForm(monitoringThresholds);
  }, [monitoringThresholds]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('smarthelp')} className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:shadow-md transition-all text-black dark:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white">Monitoramento</h1>
            <p className="text-black dark:text-white opacity-60 text-sm font-medium">Servidores e máquinas das lojas, em tempo real</p>
          </div>
          <button onClick={fetchOverview} className="ml-auto p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
            <RefreshCw className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Limites de Alerta</h2>
          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] text-zinc-400">Disco (%)</span>
              <input type="number" value={thresholdsForm.diskPercent} onChange={(e) => setThresholdsForm({ ...thresholdsForm, diskPercent: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-black dark:text-white" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-zinc-400">Memória (%)</span>
              <input type="number" value={thresholdsForm.memPercent} onChange={(e) => setThresholdsForm({ ...thresholdsForm, memPercent: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-black dark:text-white" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-zinc-400">Offline após (min)</span>
              <input type="number" value={thresholdsForm.offlineMinutes} onChange={(e) => setThresholdsForm({ ...thresholdsForm, offlineMinutes: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-black dark:text-white" />
            </label>
          </div>
          <button onClick={() => saveMonitoringThresholds(thresholdsForm)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors">
            <Save className="w-3.5 h-3.5" /> Salvar limites
          </button>
        </div>

        {overviewError && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-red-600">{overviewError}</p>
          </div>
        )}

        {!overview ? (
          overviewError ? null : <p className="text-sm text-zinc-400">Carregando...</p>
        ) : overview.stores.length === 0 ? (
          <p className="text-sm text-zinc-400">Nenhuma máquina reportou ainda. Instale o agente nas lojas para começar a ver dados aqui.</p>
        ) : (
          <div className="space-y-3">
            {overview.stores.map((s) => (
              <StoreSection key={s.cnpj} store={s} onOpenMachine={setSelectedMachine} />
            ))}
          </div>
        )}
      </div>

      {selectedMachine && <MachineHistoryPanel machine={selectedMachine} onClose={() => setSelectedMachine(null)} />}
    </div>
  );
}
