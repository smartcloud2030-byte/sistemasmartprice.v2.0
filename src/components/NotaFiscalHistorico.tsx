import React, { useEffect, useState } from 'react';
import { ExternalLink, Mail, Loader2, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { baixarComprovanteNotaFiscalPdf } from '../lib/notaFiscalPdf';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const AUTH_HEADERS = { 'x-api-token': API_SECRET, 'Content-Type': 'application/json' };

interface NotaHistorico {
  id: number;
  cnpj_tomador: string;
  nome_tomador: string;
  email_tomador: string;
  descricao_servico: string;
  valor: string;
  numero_nota: string | null;
  chave_acesso: string | null;
  status: 'transmitindo' | 'autorizada' | 'rejeitada';
  erro_detalhe: string | null;
  created_at: string;
}

const currency = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_LABEL: Record<NotaHistorico['status'], { label: string; className: string }> = {
  autorizada: { label: 'Autorizada', className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' },
  transmitindo: { label: 'Transmitindo', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' },
  rejeitada: { label: 'Rejeitada', className: 'bg-red-100 dark:bg-red-900/30 text-red-600' },
};

export default function NotaFiscalHistorico() {
  const [notas, setNotas] = useState<NotaHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviandoId, setEnviandoId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/notafiscal', { headers: AUTH_HEADERS })
      .then((res) => res.json())
      .then((data) => setNotas(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Erro ao carregar histórico de notas fiscais.'))
      .finally(() => setLoading(false));
  }, []);

  const reenviarEmail = async (nota: NotaHistorico) => {
    if (!nota.email_tomador) {
      toast.error('Essa nota não tem e-mail de tomador salvo.');
      return;
    }
    setEnviandoId(nota.id);
    try {
      const res = await fetch(`/api/notafiscal/${nota.id}/email`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ email: nota.email_tomador }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar e-mail.');
      toast.success('E-mail reenviado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar e-mail.');
    } finally {
      setEnviandoId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-4 md:col-span-2">
      <div className="flex items-center gap-2 text-zinc-400">
        <FileText className="w-5 h-5" />
        <span className="text-[10px] font-black uppercase tracking-widest">Notas Fiscais Emitidas</span>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-400">Carregando histórico...</p>
      ) : notas.length === 0 ? (
        <p className="text-xs text-zinc-400">Nenhuma nota emitida ainda.</p>
      ) : (
        <div className="space-y-2">
          {notas.map((nota) => {
            const statusCfg = STATUS_LABEL[nota.status];
            return (
              <div key={nota.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-black dark:text-white truncate">{nota.nome_tomador} <span className="text-zinc-400 font-normal">· {currency(nota.valor)}</span></p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {nota.descricao_servico} · {new Date(nota.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn('px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest', statusCfg.className)}>
                    {statusCfg.label}
                  </span>
                  {nota.status === 'autorizada' && (
                    <>
                      <button
                        onClick={() => baixarComprovanteNotaFiscalPdf({
                          numeroNota: nota.numero_nota || '',
                          chaveAcesso: nota.chave_acesso || '',
                          cnpjTomador: nota.cnpj_tomador,
                          nomeTomador: nota.nome_tomador,
                          descricaoServico: nota.descricao_servico,
                          valor: Number(nota.valor),
                          dataEmissao: nota.created_at,
                        })}
                        title="Baixar PDF"
                        className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/50 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                      <a
                        href="https://www.nfse.gov.br/consultapublica"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver DANFSe"
                        className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/50 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                      </a>
                      <button
                        onClick={() => reenviarEmail(nota)}
                        disabled={enviandoId === nota.id}
                        title="Reenviar por e-mail"
                        className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/50 transition-colors disabled:opacity-50"
                      >
                        {enviandoId === nota.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 text-zinc-500" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
