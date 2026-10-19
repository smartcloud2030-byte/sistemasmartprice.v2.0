import React, { useEffect, useState } from 'react';
import { CalendarClock, Download, Send, Loader2, Pause, Play, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { formatCnpj } from '../lib/notaFiscalPdf';

const AUTH_HEADERS = { 'Content-Type': 'application/json' };

interface Agendamento {
  id: number;
  nome: string;
  dia: number;
  itens: { cnpj: string; valor: number }[];
  email_cliente: string;
  ativo: boolean;
  ultima_competencia: string | null;
}

interface Lote {
  id: number;
  nome: string;
  competencia: string;
  status: 'conferir' | 'enviado' | 'falhou';
  email_cliente: string;
  enviado_em: string | null;
  falhas: { cnpj: string; erro: string }[];
  notas: { id: number; numero_nota: string; cnpj_tomador: string; nome_tomador: string; valor: string }[];
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesAno = (comp: string) => `${comp.slice(5, 7)}/${comp.slice(0, 4)}`;

// Lotes emitidos pelo agendador (esperando conferência) + agendamentos ativos.
export default function NotaFiscalAgendamentos({ onMudou }: { onMudou: () => void }) {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = () => {
    fetch('/api/notafiscal/agendamentos', { headers: AUTH_HEADERS })
      .then((r) => r.json()).then((d) => Array.isArray(d) && setAgendamentos(d)).catch(() => {});
    fetch('/api/notafiscal/lotes', { headers: AUTH_HEADERS })
      .then((r) => r.json()).then((d) => Array.isArray(d) && setLotes(d)).catch(() => {});
  };
  useEffect(carregar, []);

  const acao = async (chave: string, fn: () => Promise<Response>, sucesso: string) => {
    setOcupado(chave);
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro.');
      toast.success(sucesso);
      carregar();
      onMudou();
    } catch (err: any) {
      toast.error(err.message || 'Erro.');
    } finally {
      setOcupado(null);
    }
  };

  const enviarLote = (lote: Lote) =>
    acao(`lote-${lote.id}`, () => fetch(`/api/notafiscal/lotes/${lote.id}/enviar`, { method: 'POST', headers: AUTH_HEADERS, body: '{}' }),
      `Notas enviadas para ${lote.email_cliente}.`);

  const alternar = (ag: Agendamento) =>
    acao(`ag-${ag.id}`, () => fetch(`/api/notafiscal/agendamentos/${ag.id}`, { method: 'PATCH', headers: AUTH_HEADERS, body: JSON.stringify({ ativo: !ag.ativo }) }),
      ag.ativo ? 'Agendamento pausado.' : 'Agendamento reativado.');

  const remover = (ag: Agendamento) =>
    acao(`ag-${ag.id}`, () => fetch(`/api/notafiscal/agendamentos/${ag.id}`, { method: 'DELETE', headers: AUTH_HEADERS }),
      'Agendamento removido.');

  const paraConferir = lotes.filter((l) => l.status === 'conferir');
  const recentes = lotes.filter((l) => l.status !== 'conferir').slice(0, 5);
  if (agendamentos.length === 0 && lotes.length === 0) return null;

  const linhaLote = (lote: Lote) => {
    const total = lote.notas.reduce((s, n) => s + Number(n.valor), 0);
    return (
      <div key={lote.id} className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-black dark:text-white">{lote.nome} · {mesAno(lote.competencia)}</p>
            <p className="text-[11px] text-zinc-400">
              {lote.notas.length} nota{lote.notas.length === 1 ? '' : 's'}
              {lote.notas.length > 0 && ` (nº ${lote.notas.map((n) => n.numero_nota).join(', ')})`} · {moeda(total)}
              {lote.status === 'enviado' && lote.enviado_em && ` · enviado ${new Date(lote.enviado_em).toLocaleDateString('pt-BR')} para ${lote.email_cliente}`}
            </p>
          </div>
          {lote.notas.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => window.open(`/api/notafiscal/lote/zip?ids=${lote.notas.map((n) => n.id).join(',')}`, '_blank')}
                title="Baixar ZIP pra conferir"
                className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/50 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-zinc-500" />
              </button>
              {lote.status === 'conferir' && (
                <button
                  onClick={() => enviarLote(lote)}
                  disabled={ocupado === `lote-${lote.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {ocupado === `lote-${lote.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar pro cliente
                </button>
              )}
            </div>
          )}
        </div>
        {lote.falhas.length > 0 && (
          <div className="flex items-start gap-2 text-[11px] text-red-600">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Não saíram: {lote.falhas.map((f) => `${formatCnpj(f.cnpj)} (${f.erro})`).join('; ')}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-4">
      <div className="flex items-center gap-2 text-zinc-400">
        <CalendarClock className="w-5 h-5" />
        <span className="text-[10px] font-black uppercase tracking-widest">Emissão mensal agendada</span>
      </div>

      {paraConferir.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-amber-600">Lotes para conferir ({paraConferir.length})</p>
          {paraConferir.map(linhaLote)}
        </div>
      )}

      {agendamentos.length > 0 && (
        <div className="space-y-2">
          {agendamentos.map((ag) => {
            const total = ag.itens.reduce((s, i) => s + Number(i.valor), 0);
            return (
              <div key={ag.id} className="flex items-center justify-between gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                <div className="min-w-0">
                  <p className={cn('text-sm font-bold truncate', ag.ativo ? 'text-black dark:text-white' : 'text-zinc-400')}>
                    {ag.nome} · todo dia {ag.dia} às 10h{!ag.ativo && ' (pausado)'}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {ag.itens.length} nota{ag.itens.length === 1 ? '' : 's'} · {moeda(total)} · {ag.email_cliente}
                    {ag.ultima_competencia && ` · último mês: ${mesAno(ag.ultima_competencia)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => alternar(ag)}
                    disabled={ocupado === `ag-${ag.id}`}
                    title={ag.ativo ? 'Pausar' : 'Reativar'}
                    className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/50 transition-colors disabled:opacity-50"
                  >
                    {ag.ativo ? <Pause className="w-3.5 h-3.5 text-zinc-500" /> : <Play className="w-3.5 h-3.5 text-zinc-500" />}
                  </button>
                  <button
                    onClick={() => remover(ag)}
                    disabled={ocupado === `ag-${ag.id}`}
                    title="Remover agendamento"
                    className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-red-500/50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Últimos lotes automáticos</p>
          {recentes.map(linhaLote)}
        </div>
      )}
    </div>
  );
}
