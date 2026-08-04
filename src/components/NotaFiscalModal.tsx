import React, { useEffect, useRef, useState } from 'react';
import { X, FileText, Loader2, ExternalLink, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../store';
import { fetchCnpjDataEstruturado, EnderecoEstruturado } from '../lib/cnpjLookup';
import { cn } from '../lib/utils';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const AUTH_HEADERS = { 'x-api-token': API_SECRET, 'Content-Type': 'application/json' };

interface Props {
  onClose: () => void;
  onEmitted: () => void;
}

interface Nota {
  id: number;
  status: 'transmitindo' | 'autorizada' | 'rejeitada';
  numero_nota: string | null;
  chave_acesso: string | null;
  erro_detalhe: string | null;
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 10;

export default function NotaFiscalModal({ onClose, onEmitted }: Props) {
  const allowedStores = useStore((s) => s.allowedStores);

  const [tomadorCnpj, setTomadorCnpj] = useState('');
  const [tomadorNome, setTomadorNome] = useState('');
  const [tomadorTelefone, setTomadorTelefone] = useState('');
  const [tomadorEndereco, setTomadorEndereco] = useState<EnderecoEstruturado | null>(null);
  const [tomadorEmail, setTomadorEmail] = useState('');
  const [servicoCodigo, setServicoCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState<Nota | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleSelecionarCnpj = async (cnpj: string) => {
    setTomadorCnpj(cnpj);
    setTomadorNome('');
    setTomadorEndereco(null);
    setTomadorTelefone('');
    if (!cnpj) return;

    setBuscandoCnpj(true);
    try {
      const dados = await fetchCnpjDataEstruturado(cnpj);
      if (dados) {
        setTomadorNome(dados.nome);
        setTomadorEndereco(dados.endereco);
        setTomadorTelefone(dados.telefone);
        if (dados.email) setTomadorEmail(dados.email);
      } else {
        toast.error('Não foi possível buscar os dados desse CNPJ automaticamente.');
      }
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const pararPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const consultarNota = async (id: number) => {
    const res = await fetch(`/api/notafiscal/${id}`, { headers: AUTH_HEADERS });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao consultar nota.');
    return data as Nota;
  };

  const iniciarPolling = (id: number) => {
    pollAttempts.current = 0;
    pollRef.current = setInterval(async () => {
      pollAttempts.current += 1;
      try {
        const atual = await consultarNota(id);
        if (atual.status === 'autorizada') {
          pararPolling();
          setNota(atual);
          setEmitindo(false);
          onEmitted();
        } else if (atual.status === 'rejeitada') {
          pararPolling();
          setErro(atual.erro_detalhe || 'NFS-e rejeitada pela Receita Federal.');
          setEmitindo(false);
        } else if (pollAttempts.current >= POLL_MAX_ATTEMPTS) {
          pararPolling();
          setErro('A prefeitura ainda está processando a nota. Confira o histórico em alguns minutos.');
          setEmitindo(false);
        }
      } catch (err: any) {
        pararPolling();
        setErro(err.message);
        setEmitindo(false);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleEmitir = async () => {
    if (!tomadorEndereco) {
      setErro('Selecione um CNPJ válido e aguarde o preenchimento automático do endereço.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tomadorEmail.trim())) {
      setErro('Informe um e-mail válido do cliente (a busca automática nem sempre encontra um).');
      return;
    }
    setErro(null);
    setEmitindo(true);

    try {
      const res = await fetch('/api/notafiscal/emitir', {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          tomadorCnpj,
          tomadorNome,
          tomadorEmail,
          tomadorTelefone,
          tomadorEndereco,
          servicoCodigo,
          descricao,
          valor: Number(valor),
          adminPassword,
        }),
      });
      const data = await res.json();

      if (res.status === 200) {
        setNota(data);
        if (data.status === 'autorizada') {
          setEmitindo(false);
          onEmitted();
        } else {
          iniciarPolling(data.id);
        }
      } else if (res.status === 202) {
        setNota(data);
        iniciarPolling(data.id);
      } else {
        setErro(data.error || 'Erro ao emitir nota fiscal.');
        setEmitindo(false);
      }
    } catch (err: any) {
      setErro(err.message || 'Erro ao emitir nota fiscal.');
      setEmitindo(false);
    }
  };

  const handleEnviarEmail = async () => {
    if (!nota) return;
    setEnviandoEmail(true);
    try {
      const res = await fetch(`/api/notafiscal/${nota.id}/email`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ email: tomadorEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar e-mail.');
      toast.success('E-mail enviado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar e-mail.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const notaAutorizada = nota?.status === 'autorizada';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200 no-print">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-black uppercase tracking-tighter text-black dark:text-white">Emitir Nota Fiscal</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {notaAutorizada ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-black dark:text-white">Nota emitida com sucesso!</p>
                  <p className="text-xs text-zinc-500">Nº {nota?.numero_nota} · Chave: {nota?.chave_acesso}</p>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">E-mail de destino</label>
                <input
                  type="email"
                  value={tomadorEmail}
                  onChange={(e) => setTomadorEmail(e.target.value)}
                  placeholder="cliente@exemplo.com.br"
                  className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                />
              </div>
              <div className="flex gap-3">
                <a
                  href="https://www.nfse.gov.br/consultapublica"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-black dark:text-white hover:border-emerald-500/50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Ver DANFSe
                </a>
                <button
                  onClick={handleEnviarEmail}
                  disabled={enviandoEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tomadorEmail.trim())}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {enviandoEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Enviar por E-mail
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Cliente (tomador)</label>
                <select
                  value={tomadorCnpj}
                  onChange={(e) => handleSelecionarCnpj(e.target.value)}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                >
                  <option value="">Selecione um CNPJ...</option>
                  {allowedStores.map((s) => (
                    <option key={s.cnpj} value={s.cnpj}>{s.bandeira} · {s.cnpj}</option>
                  ))}
                </select>
              </div>

              {buscandoCnpj && <p className="text-xs text-zinc-400 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Buscando dados do CNPJ...</p>}

              {tomadorEndereco && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl text-xs text-zinc-500 space-y-0.5">
                  <p className="font-bold text-black dark:text-white">{tomadorNome}</p>
                  <p>{tomadorEndereco.xLgr}, {tomadorEndereco.nro} - {tomadorEndereco.xBairro} - {tomadorEndereco.uf}</p>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">E-mail do cliente</label>
                <input
                  type="email"
                  value={tomadorEmail}
                  onChange={(e) => setTomadorEmail(e.target.value)}
                  placeholder="cliente@exemplo.com.br"
                  className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Código de serviço (6 dígitos)</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={servicoCodigo}
                    onChange={(e) => setServicoCodigo(e.target.value.replace(/\D/g, ''))}
                    placeholder="010101"
                    className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="150.00"
                    className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Descrição do serviço</label>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Confirme sua senha de admin</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Sua senha de administrador"
                  className="w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
                />
              </div>

              {erro && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-xs text-red-600">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {erro}
                </div>
              )}

              <button
                onClick={handleEmitir}
                disabled={emitindo || !tomadorCnpj}
                className={cn(
                  'w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-colors',
                  emitindo || !tomadorCnpj ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                )}
              >
                {emitindo ? 'Emitindo...' : 'Emitir Nota Fiscal'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
