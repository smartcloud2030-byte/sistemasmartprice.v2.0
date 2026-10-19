import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Files, Loader2, CheckCircle2, AlertTriangle, Download, Mail, Plus, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../store';
import { fetchCnpjDataEstruturado } from '../lib/cnpjLookup';
import { formatCnpj } from '../lib/notaFiscalPdf';
import { cn } from '../lib/utils';

const AUTH_HEADERS = { 'Content-Type': 'application/json' };
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 10;

interface Props {
  onClose: () => void;
  onEmitted: () => void;
}

type StatusItem = 'pendente' | 'buscando' | 'emitindo' | 'autorizada' | 'transmitindo' | 'erro';

interface ItemLote {
  cnpj: string;
  nome: string;
  valor: string;
  marcado: boolean;
  status: StatusItem;
  notaId?: number;
  numero?: string;
  erro?: string;
}

interface CnaeOpcao { codigo: string; descricao: string }

// Alvo do lote: um grupo de lojas (Grupo Piauí...) ou uma bandeira.
// A chave identifica o lote salvo e o agendamento ("grupo:<id>" / "bandeira:<nome>").
interface AlvoLote { chave: string; nome: string; cnpjs: string[] }

interface Agendamento { id: number; chave: string; dia: number; ativo: boolean }

interface ModeloLote {
  itens: { cnpj: string; valor: number }[];
  descricao: string;
  servicoCodigo: string;
  cnae: string;
  email: string;
}

const formatarCnae = (c: string) => c.replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3');
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const inputCls = 'w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-zinc-400';

const STATUS_TEXTO: Record<StatusItem, string> = {
  pendente: 'Aguardando',
  buscando: 'Buscando dados...',
  emitindo: 'Emitindo...',
  autorizada: 'Autorizada',
  transmitindo: 'Prefeitura processando',
  erro: 'Erro',
};

export default function NotaFiscalLoteModal({ onClose, onEmitted }: Props) {
  const allowedStores = useStore((s) => s.allowedStores);
  const userGroups = useStore((s) => s.userGroups);

  const { grupos, bandeiras } = useMemo(() => {
    const soDigitos = (c: string) => c.replace(/\D/g, '');
    const porNome = (a: AlvoLote, b: AlvoLote) => a.nome.localeCompare(b.nome, 'pt-BR');
    const grupos: AlvoLote[] = userGroups
      .map((g) => ({
        chave: `grupo:${g.id}`,
        nome: g.name,
        cnpjs: allowedStores.filter((s) => s.groupId === g.id).map((s) => soDigitos(s.cnpj)),
      }))
      .filter((g) => g.cnpjs.length > 0)
      .sort(porNome);
    const nomesBandeira = [...new Set(allowedStores.map((s) => (s.bandeira || '').trim()).filter(Boolean))];
    const bandeiras: AlvoLote[] = nomesBandeira
      .map((b) => ({
        chave: `bandeira:${b}`,
        nome: b,
        cnpjs: allowedStores.filter((s) => (s.bandeira || '').trim() === b).map((s) => soDigitos(s.cnpj)),
      }))
      .sort(porNome);
    return { grupos, bandeiras };
  }, [allowedStores, userGroups]);

  const [alvo, setAlvo] = useState<AlvoLote | null>(null);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [diaAgendamento, setDiaAgendamento] = useState('5');
  const [agendando, setAgendando] = useState(false);
  const [querAgendar, setQuerAgendar] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<ItemLote[]>([]);
  const [valorPadrao, setValorPadrao] = useState('');
  const [novoCnpj, setNovoCnpj] = useState('');
  const [servicoCodigo, setServicoCodigo] = useState('');
  const [cnae, setCnae] = useState('');
  const [cnaes, setCnaes] = useState<CnaeOpcao[]>([]);
  const [descricao, setDescricao] = useState('');
  const [email, setEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [modelos, setModelos] = useState<Record<string, ModeloLote>>({});

  const [fase, setFase] = useState<'form' | 'emitindo' | 'fim'>('form');
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);

  useEffect(() => {
    fetch('/api/notafiscal/cnaes', { headers: AUTH_HEADERS })
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data?.cnaes)) return;
        setCnaes(data.cnaes);
        setCnae((atual) => atual || data.padrao);
      })
      .catch(() => toast.error('Erro ao carregar a lista de CNAEs.'));
    fetch('/api/notafiscal/lote/modelos', { headers: AUTH_HEADERS })
      .then((res) => res.json())
      .then((data) => { if (data && typeof data === 'object' && !data.error) setModelos(data); })
      .catch(() => { /* sem lote salvo: começa em branco */ });
    fetch('/api/notafiscal/agendamentos', { headers: AUTH_HEADERS })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setAgendamentos(data); })
      .catch(() => { /* lista de agendamentos é só informativa aqui */ });
  }, []);

  const agendamentoAtual = alvo ? agendamentos.find((a) => a.chave === alvo.chave) : undefined;
  useEffect(() => {
    setQuerAgendar(false);
    if (agendamentoAtual) setDiaAgendamento(String(agendamentoAtual.dia));
  }, [alvo?.chave]);

  // Escolher o grupo/bandeira marca todos os CNPJs dele; se já houve um lote
  // pra ele, reaproveita valores, descrição, código, CNAE e e-mail.
  const handleAlvo = (chave: string) => {
    const escolhido = [...grupos, ...bandeiras].find((a) => a.chave === chave) || null;
    setAlvo(escolhido);
    if (!escolhido) return setItens([]);
    const modelo = modelos[chave];
    const valorDoModelo = (cnpj: string) => modelo?.itens.find((i) => i.cnpj === cnpj)?.valor;
    const daBandeira = escolhido.cnpjs.filter((c, i, arr) => c.length === 14 && arr.indexOf(c) === i);
    const extrasDoModelo = (modelo?.itens || []).map((i) => i.cnpj).filter((c) => !daBandeira.includes(c));
    setItens([...daBandeira, ...extrasDoModelo].map((c) => {
      const v = valorDoModelo(c);
      return { cnpj: c, nome: '', valor: v ? String(v) : valorPadrao, marcado: true, status: 'pendente' };
    }));
    if (modelo) {
      setDescricao(modelo.descricao || '');
      setServicoCodigo(modelo.servicoCodigo || '');
      if (modelo.cnae) setCnae(modelo.cnae);
      setEmail(modelo.email || '');
    }
  };

  const aplicarValorPadrao = (v: string) => {
    setValorPadrao(v);
    setItens((atual) => atual.map((i) => ({ ...i, valor: v })));
  };

  const adicionarCnpj = () => {
    const c = novoCnpj.replace(/\D/g, '');
    if (c.length !== 14) return toast.error('CNPJ precisa ter 14 dígitos.');
    if (itens.some((i) => i.cnpj === c)) return toast.error('Esse CNPJ já está no lote.');
    setItens((atual) => [...atual, { cnpj: c, nome: '', valor: valorPadrao, marcado: true, status: 'pendente' }]);
    setNovoCnpj('');
  };

  const atualizarItem = (cnpj: string, mudanca: Partial<ItemLote>) =>
    setItens((atual) => atual.map((i) => (i.cnpj === cnpj ? { ...i, ...mudanca } : i)));

  const selecionados = itens.filter((i) => i.marcado);
  const totalLote = selecionados.reduce((soma, i) => soma + (Number(i.valor) || 0), 0);

  const validar = (): string | null => {
    if (selecionados.length === 0) return 'Marque pelo menos um CNPJ.';
    if (selecionados.some((i) => !(Number(i.valor) > 0))) return 'Todos os CNPJs marcados precisam de um valor maior que zero.';
    if (!/^\d{6}$/.test(servicoCodigo)) return 'Código de serviço precisa ter 6 dígitos.';
    if (!descricao.trim()) return 'Descrição do serviço é obrigatória.';
    if (!emailValido(email)) {
      emailRef.current?.focus();
      emailRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return 'Informe o e-mail do cliente que vai receber o ZIP (campo no topo).';
    }
    if (!adminPassword) return 'Confirme sua senha de admin.';
    return null;
  };

  // Espera a prefeitura terminar uma nota que voltou "transmitindo".
  const aguardarNota = async (id: number) => {
    for (let tentativa = 0; tentativa < POLL_MAX_ATTEMPTS; tentativa++) {
      await esperar(POLL_INTERVAL_MS);
      const res = await fetch(`/api/notafiscal/${id}`, { headers: AUTH_HEADERS });
      const nota = await res.json();
      if (nota?.status === 'autorizada' || nota?.status === 'rejeitada') return nota;
    }
    return null;
  };

  // Emite uma nota por vez (a prefeitura não gosta de rajada) e devolve os
  // ids das autorizadas. Nota já autorizada ou ainda em processamento nunca é
  // reenviada — evita emitir duas vezes pro mesmo CNPJ.
  const emitirLote = async (): Promise<number[]> => {
    const fila = itens.filter((i) => i.marcado && (i.status === 'pendente' || i.status === 'erro'));
    const autorizadas = itens.filter((i) => i.status === 'autorizada' && i.notaId).map((i) => i.notaId!);

    for (const item of fila) {
      atualizarItem(item.cnpj, { status: 'buscando', erro: undefined });
      const dados = await fetchCnpjDataEstruturado(item.cnpj).catch(() => null);
      if (!dados) {
        atualizarItem(item.cnpj, { status: 'erro', erro: 'Não achei os dados desse CNPJ na Receita.' });
        continue;
      }
      atualizarItem(item.cnpj, { status: 'emitindo', nome: dados.nome });

      try {
        const res = await fetch('/api/notafiscal/emitir', {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            tomadorCnpj: item.cnpj,
            tomadorNome: dados.nome,
            tomadorEmail: email.trim(),
            tomadorTelefone: dados.telefone,
            tomadorEndereco: dados.endereco,
            servicoCodigo,
            cnae,
            descricao,
            valor: Number(item.valor),
            adminPassword,
            enviarEmail: false,
          }),
        });
        let nota = await res.json();

        if (res.status === 403) {
          // Senha errada vale pra todas — para o lote aqui.
          atualizarItem(item.cnpj, { status: 'erro', erro: nota.error });
          setErroGeral(nota.error || 'Senha de admin incorreta.');
          return autorizadas;
        }
        if (!res.ok && res.status !== 202) {
          atualizarItem(item.cnpj, { status: 'erro', erro: nota.error || 'Erro ao emitir.' });
          continue;
        }
        if (nota.status === 'transmitindo') nota = (await aguardarNota(nota.id)) || nota;

        if (nota.status === 'autorizada') {
          autorizadas.push(nota.id);
          atualizarItem(item.cnpj, { status: 'autorizada', notaId: nota.id, numero: nota.numero_nota });
        } else if (nota.status === 'rejeitada') {
          atualizarItem(item.cnpj, { status: 'erro', notaId: nota.id, erro: nota.erro_detalhe || 'Rejeitada pela Receita Federal.' });
        } else {
          atualizarItem(item.cnpj, { status: 'transmitindo', notaId: nota.id, erro: 'Confira no histórico em alguns minutos.' });
        }
      } catch (err: any) {
        atualizarItem(item.cnpj, { status: 'erro', erro: err.message || 'Erro ao emitir.' });
      }
    }
    return autorizadas;
  };

  const enviarZip = async (ids: number[]) => {
    if (ids.length === 0) return;
    setEnviandoEmail(true);
    try {
      const res = await fetch('/api/notafiscal/lote/email', {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ ids, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar o e-mail.');
      setEmailEnviado(true);
      toast.success(`ZIP com ${data.enviadas} nota${data.enviadas === 1 ? '' : 's'} enviado para ${email.trim()}.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar o e-mail.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const salvarModelo = () => {
    if (!alvo) return;
    const modelo: ModeloLote = {
      itens: selecionados.map((i) => ({ cnpj: i.cnpj, valor: Number(i.valor) })),
      descricao, servicoCodigo, cnae, email: email.trim(),
    };
    setModelos((m) => ({ ...m, [alvo.chave]: modelo }));
    fetch('/api/notafiscal/lote/modelos', {
      method: 'PUT',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ chave: alvo.chave, modelo }),
    }).catch(() => { /* lote salvo é só conveniência */ });
  };

  const handleEmitir = async () => {
    const erro = validar();
    if (erro) return setErroGeral(erro);
    setErroGeral(null);
    setEmailEnviado(false);
    setFase('emitindo');
    salvarModelo();
    const ids = await emitirLote();
    onEmitted();
    setFase('fim');
    await enviarZip(ids);
  };

  const handleAgendar = async () => {
    const erro = validar();
    if (erro) return setErroGeral(erro);
    if (!alvo) return;
    setErroGeral(null);
    setAgendando(true);
    try {
      const res = await fetch('/api/notafiscal/agendamentos', {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          chave: alvo.chave,
          nome: alvo.nome,
          dia: Number(diaAgendamento),
          itens: selecionados.map((i) => ({ cnpj: i.cnpj, valor: Number(i.valor) })),
          descricao, servicoCodigo, cnae, email: email.trim(), adminPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao agendar.');
      salvarModelo();
      setAgendamentos((atual) => [...atual.filter((a) => a.chave !== data.chave), data]);
      onEmitted();
      toast.success(`Agendado: todo dia ${data.dia} às 10h. Você confere antes de ir pro cliente.`);
    } catch (err: any) {
      setErroGeral(err.message || 'Erro ao agendar.');
    } finally {
      setAgendando(false);
    }
  };

  const idsAutorizados = itens.filter((i) => i.status === 'autorizada' && i.notaId).map((i) => i.notaId!);
  const comFalha = itens.filter((i) => i.marcado && i.status === 'erro').length;
  const bloqueado = fase === 'emitindo';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200 no-print">
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Files className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-black uppercase tracking-tighter text-black dark:text-white">Emitir notas em lote</h3>
          </div>
          <button onClick={onClose} disabled={bloqueado} className="w-9 h-9 rounded-full flex items-center justify-center border border-zinc-300 dark:border-zinc-600 text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Cliente (grupo ou bandeira)</label>
              <select value={alvo?.chave || ''} onChange={(e) => handleAlvo(e.target.value)} disabled={fase !== 'form'} className={inputCls}>
                <option value="">Selecione...</option>
                {grupos.length > 0 && (
                  <optgroup label="Grupos">
                    {grupos.map((g) => (
                      <option key={g.chave} value={g.chave}>{g.nome} ({g.cnpjs.length}){modelos[g.chave] ? ' · lote salvo' : ''}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Bandeiras">
                  {bandeiras.map((b) => (
                    <option key={b.chave} value={b.chave}>{b.nome} ({b.cnpjs.length}){modelos[b.chave] ? ' · lote salvo' : ''}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className={labelCls}>Mesmo valor pra todos (R$)</label>
              <input type="number" step="0.01" value={valorPadrao} onChange={(e) => aplicarValorPadrao(e.target.value)} disabled={fase !== 'form'} placeholder="300.00" className={inputCls} />
            </div>
          </div>

          {fase === 'form' && (
            <>
              <div>
                <label className={labelCls}>E-mail do cliente (recebe o ZIP)</label>
                <input ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@exemplo.com.br" className={inputCls} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>CNAE</label>
                  <select value={cnae} onChange={(e) => setCnae(e.target.value)} className={inputCls}>
                    {cnaes.map((c) => (
                      <option key={c.codigo} value={c.codigo}>{formatarCnae(c.codigo)} · {c.descricao}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Código de serviço (6 dígitos)</label>
                  <input type="text" maxLength={6} value={servicoCodigo} onChange={(e) => setServicoCodigo(e.target.value.replace(/\D/g, ''))} placeholder="010301" className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Descrição do serviço (vai em todas as notas)</label>
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} />
              </div>
            </>
          )}

          {itens.length > 0 && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 max-h-72 overflow-y-auto custom-scrollbar">
              {itens.map((item) => (
                <div key={item.cnpj} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={item.marcado}
                    disabled={fase !== 'form'}
                    onChange={(e) => atualizarItem(item.cnpj, { marcado: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-mono', item.marcado ? 'text-black dark:text-white' : 'text-zinc-400')}>{formatCnpj(item.cnpj)}</p>
                    {(item.nome || item.erro || item.status !== 'pendente') && (
                      <p className={cn('text-[11px] truncate', item.status === 'erro' ? 'text-red-600' : 'text-zinc-400')}>
                        {item.nome}{item.nome && ' · '}
                        {item.status === 'autorizada' ? `Nota nº ${item.numero}` : STATUS_TEXTO[item.status]}
                        {item.erro && ` — ${item.erro}`}
                      </p>
                    )}
                  </div>
                  {item.status === 'autorizada' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : item.status === 'erro' ? (
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  ) : item.status === 'buscando' || item.status === 'emitindo' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400 flex-shrink-0" />
                  ) : null}
                  <input
                    type="number"
                    step="0.01"
                    value={item.valor}
                    disabled={fase !== 'form' || !item.marcado}
                    onChange={(e) => atualizarItem(item.cnpj, { valor: e.target.value })}
                    className="w-28 px-3 py-1.5 rounded-lg text-sm text-right border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white disabled:opacity-50"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-zinc-400">{selecionados.length} nota{selecionados.length === 1 ? '' : 's'}</span>
                <span className="font-bold text-black dark:text-white">Total {moeda(totalLote)}</span>
              </div>
            </div>
          )}

          {fase === 'form' && alvo && (
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={novoCnpj}
                onChange={(e) => setNovoCnpj(e.target.value)}
                placeholder="Adicionar outro CNPJ"
                className="flex-1 px-4 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white"
              />
              <button onClick={adicionarCnpj} className="flex items-center gap-1 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-black uppercase tracking-widest text-emerald-600 hover:border-emerald-500/50">
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
          )}

          {fase === 'form' && (
            <>

              {alvo && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-black dark:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={querAgendar} onChange={(e) => setQuerAgendar(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                    <CalendarClock className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold">Agendar pra emitir sozinho todo mês (opcional)</span>
                  </label>
                  {agendamentoAtual && !querAgendar && (
                    <p className="text-[11px] text-zinc-400">Já agendado: todo dia {agendamentoAtual.dia} às 10h{agendamentoAtual.ativo ? '' : ' (pausado)'}.</p>
                  )}
                  {querAgendar && (<>
                  <p className="text-[11px] text-zinc-400">
                    No dia escolhido, às 10h, o sistema emite estas notas e te manda o ZIP pra conferir. Só vai pro cliente quando você clicar em "Enviar pro cliente" na aba Notas Fiscais.
                    {agendamentoAtual && ` Já agendado: todo dia ${agendamentoAtual.dia}${agendamentoAtual.ativo ? '' : ' (pausado)'} — salvar de novo atualiza.`}
                  </p>
                  <div className="flex gap-2">
                    <select value={diaAgendamento} onChange={(e) => setDiaAgendamento(e.target.value)} className="px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>Dia {d}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAgendar}
                      disabled={agendando || selecionados.length === 0}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-emerald-600 text-emerald-600 text-xs font-black uppercase tracking-widest hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                    >
                      {agendando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} {agendamentoAtual ? 'Atualizar agendamento' : 'Agendar todo mês às 10h'}
                    </button>
                  </div>
                  </>)}
                </div>
              )}

              <div>
                <label className={labelCls}>Confirme sua senha de admin</label>
                <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Sua senha de administrador" className={inputCls} />
              </div>
            </>
          )}

          {erroGeral && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-xs text-red-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {erroGeral}
            </div>
          )}

          {fase === 'fim' && (
            <div className="space-y-3">
              <p className="text-sm text-black dark:text-white">
                {idsAutorizados.length} de {selecionados.length} nota{selecionados.length === 1 ? '' : 's'} autorizada{idsAutorizados.length === 1 ? '' : 's'}.
                {emailEnviado && ` ZIP enviado para ${email.trim()}.`}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => window.open(`/api/notafiscal/lote/zip?ids=${idsAutorizados.join(',')}`, '_blank')}
                  disabled={idsAutorizados.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-black dark:text-white hover:border-emerald-500/50 transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Baixar ZIP
                </button>
                <button
                  onClick={() => enviarZip(idsAutorizados)}
                  disabled={enviandoEmail || idsAutorizados.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-black dark:text-white hover:border-emerald-500/50 transition-colors disabled:opacity-50"
                >
                  {enviandoEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} {emailEnviado ? 'Reenviar ZIP' : 'Enviar ZIP por e-mail'}
                </button>
              </div>
              {comFalha > 0 && (
                <button
                  onClick={() => { setErroGeral(null); setFase('form'); }}
                  className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Corrigir e tentar de novo as {comFalha} com erro
                </button>
              )}
            </div>
          )}

          {fase !== 'fim' && (
            <button
              onClick={handleEmitir}
              disabled={bloqueado || selecionados.length === 0}
              className={cn(
                'w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-colors',
                bloqueado || selecionados.length === 0 ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400' : 'bg-emerald-600 text-white hover:bg-emerald-700'
              )}
            >
              {bloqueado
                ? 'Emitindo... não feche esta janela'
                : itens.some((i) => i.status === 'autorizada')
                  ? `Emitir as que faltam`
                  : `Emitir agora · ${selecionados.length} nota${selecionados.length === 1 ? '' : 's'} · ${moeda(totalLote)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
