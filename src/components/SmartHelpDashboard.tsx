import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { ArrowLeft, LifeBuoy, Server, Printer, Wifi, CreditCard, HardDrive, CheckCircle2, AlertTriangle, HelpCircle, ExternalLink, Landmark, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import NotaFiscalModal from './NotaFiscalModal';
import NotaFiscalHistorico from './NotaFiscalHistorico';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

type Indicator = 'none' | 'minor' | 'major' | 'critical' | 'unknown';

interface TefDay {
  date: string;
  hasIncident: boolean;
}

interface TefProviderStatus {
  ok: boolean;
  label: string;
  indicator: Indicator;
  description: string;
  updatedAt?: string | null;
  days: TefDay[];
}

interface TefStatusResponse {
  checkedAt: string;
  providers: Record<string, TefProviderStatus>;
}

const INDICATOR_CONFIG: Record<Indicator, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  none: { label: 'Operando normalmente', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: CheckCircle2 },
  minor: { label: 'Instabilidade leve', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: AlertTriangle },
  major: { label: 'Instabilidade', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', icon: AlertTriangle },
  critical: { label: 'Fora do ar', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', icon: AlertTriangle },
  unknown: { label: 'Status indisponível', color: 'text-zinc-400', bg: 'bg-zinc-100 dark:bg-zinc-800', icon: HelpCircle },
};

function useTefStatus() {
  const [data, setData] = useState<TefStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/tef-status', { headers: { 'x-api-token': API_SECRET } });
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error('Erro ao carregar status TEF:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { data, isLoading };
}

// Alerta destacado no topo — só aparece quando alguma operadora não está
// "operando normalmente". Some sozinho quando volta ao normal.
function TefAlertBanner({ data }: { data: TefStatusResponse | null }) {
  if (!data) return null;
  const affected = Object.values(data.providers).filter((p) => p.ok && p.indicator !== 'none');
  if (affected.length === 0) return null;

  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-black text-red-600 uppercase tracking-wide">
          {affected.length === 1 ? `${affected[0].label} com instabilidade` : 'Instabilidade em operadoras de cartão'}
        </p>
        <p className="text-xs text-red-600/80 mt-0.5">
          {affected.map((p) => `${p.label}: ${p.description}`).join(' · ')}
        </p>
      </div>
    </div>
  );
}

// Barra de 30 dias no estilo "histórico de disponibilidade" das próprias
// páginas de status (GitHub, Stripe etc.): um retângulo por dia, vermelho
// nos dias em que houve algum incidente registrado.
function DayHistoryBar({ days }: { days: TefDay[] }) {
  if (!days || days.length === 0) return null;
  return (
    <div className="flex items-center gap-[3px]">
      {days.map((d) => (
        <div
          key={d.date}
          title={`${new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR')} — ${d.hasIncident ? 'incidente registrado' : 'sem incidentes'}`}
          className={cn(
            'flex-1 h-5 rounded-[3px]',
            d.hasIncident ? 'bg-red-500' : 'bg-emerald-500/40'
          )}
        />
      ))}
    </div>
  );
}

function TefStatusCard({ data, isLoading }: { data: TefStatusResponse | null; isLoading: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-4">
      <div className="flex items-center gap-2 text-zinc-400">
        <CreditCard className="w-5 h-5" />
        <span className="text-[10px] font-black uppercase tracking-widest">TEF / Cartão / Banco — status ao vivo</span>
      </div>

      {isLoading ? (
        <p className="text-xs text-zinc-400">Consultando status...</p>
      ) : !data ? (
        <p className="text-xs text-red-500">Falha ao consultar o status das operadoras.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(data.providers).map(([key, p]) => {
            const cfg = INDICATOR_CONFIG[p.indicator] || INDICATOR_CONFIG.unknown;
            const Icon = cfg.icon;
            return (
              <div key={key} className="space-y-2">
                <div className={cn('flex items-center gap-3 p-3 rounded-xl', cfg.bg)}>
                  <Icon className={cn('w-5 h-5 flex-shrink-0', cfg.color)} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-black dark:text-white">{p.label}</p>
                    <p className={cn('text-xs font-medium', cfg.color)}>{p.ok ? cfg.label : p.description}</p>
                  </div>
                </div>
                {p.days?.length > 0 && (
                  <div className="space-y-1">
                    <DayHistoryBar days={p.days} />
                    <div className="flex justify-between text-[9px] text-zinc-400">
                      <span>{p.days.length} dias atrás</span>
                      <span>Hoje</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[10px] text-zinc-400 pt-1">
            Fonte: página de status oficial de cada operadora · atualizado {new Date(data.checkedAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  );
}

// Atalhos pro Downdetector — não dá pra puxar o status pra dentro do app
// porque o site fica atrás de proteção anti-bot da Cloudflare (bloqueia até
// navegador automatizado). Em vez disso, abre a página real numa nova aba.
const DOWNDETECTOR_LINKS = [
  { label: 'Banco do Brasil', slug: 'banco-do-brasil', color: '#F8D117' },
  { label: 'Itaú', slug: 'itau', color: '#EC7000' },
  { label: 'Santander', slug: 'santander', color: '#EC0000' },
  { label: 'Caixa', slug: 'caixa-economica-federal', color: '#0070B8' },
  { label: 'PIX', slug: 'pix', color: '#32BCAD' },
];

function DowndetectorLinks() {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-4 md:col-span-2">
      <div className="flex items-center gap-2 text-zinc-400">
        <Landmark className="w-5 h-5" />
        <span className="text-[10px] font-black uppercase tracking-widest">Bancos e PIX — Downdetector</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {DOWNDETECTOR_LINKS.map(({ label, slug, color }) => (
          <a
            key={slug}
            href={`https://downdetector.com.br/fora-do-ar/${slug}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between gap-3 bg-white rounded-2xl border border-zinc-200 p-3 h-24 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">{label}</span>
              <ExternalLink className="w-3 h-3 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-base font-black tracking-tight leading-none" style={{ color }}>{label}</span>
            <div className="h-1 rounded-full" style={{ backgroundColor: color, opacity: 0.35 }} />
          </a>
        ))}
      </div>
      <p className="text-[10px] text-zinc-400">
        Não puxa dado pro app — abre a página real do Downdetector (protegida contra automação) pra você conferir na hora.
      </p>
    </div>
  );
}

const SmartHelpDashboard: React.FC = () => {
  const { setView } = useStore();
  const { data: tefData, isLoading: tefLoading } = useTefStatus();
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

        <TefAlertBanner data={tefData} />

        {/* Content */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DowndetectorLinks />
            <TefStatusCard data={tefData} isLoading={tefLoading} />
            <button
              onClick={() => setShowNotaFiscal(true)}
              className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-emerald-500/50 hover:shadow-md transition-all"
            >
              <FileText className="w-6 h-6 text-emerald-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white">Emitir Nota Fiscal</span>
            </button>
            {[
              { icon: Server, label: 'Servidor' },
              { icon: HardDrive, label: 'Máquinas' },
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
