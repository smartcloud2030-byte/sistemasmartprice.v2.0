import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, RefreshCw } from 'lucide-react';
import {
  centavosParaBRL, reaisParaCentavos, resumoPorCategoria, rotuloCategoria,
  CATEGORIAS_VALIDAS, type ItemDespesa,
} from '../lib/despesasViagemReport';
import {
  listarViagens, criarViagem, getViagem, atualizarViagem, excluirViagem,
  criarDespesa, atualizarDespesa, excluirDespesa,
} from '../lib/despesasViagemApi';
import type {
  ViagemResumo, ViagemDetalhe, DespesaViagem,
  PatchViagemInput, NovaDespesaInput,
} from '../lib/despesasViagemApi';

const STATUS_ORDEM = ['aberta', 'fechada', 'enviada'] as const;
const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', fechada: 'Fechada', enviada: 'Enviada' };
const STATUS_BADGE: Record<string, string> = {
  aberta: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  fechada: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  enviada: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
};

const inputCls =
  'w-full mt-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white';
const labelCls = 'text-xs font-semibold text-zinc-500 dark:text-zinc-400';

const brDate = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
const hoje = () => new Date().toISOString().slice(0, 10);

function periodoLabel(v: { data_inicio: string | null; data_fim: string | null }) {
  const a = brDate(v.data_inicio);
  const b = brDate(v.data_fim);
  if (a && b) return `${a} – ${b}`;
  return a || b || 'sem período';
}
function toItem(d: DespesaViagem): ItemDespesa {
  return {
    categoria: d.categoria,
    descricao: d.descricao,
    valorCentavos: Number(d.valor_centavos),
    dataDespesa: d.data_despesa,
    estabelecimento: d.estabelecimento,
  };
}

// ── Formulário de despesa (criar/editar) ──────────────────────────
interface DespesaFormValue {
  categoria: string;
  valor: string;
  data_despesa: string;
  estabelecimento: string;
  descricao: string;
  documento_numero: string;
}
const despesaFormVazio = (): DespesaFormValue => ({
  categoria: 'combustivel', valor: '', data_despesa: hoje(),
  estabelecimento: '', descricao: '', documento_numero: '',
});
function despesaParaForm(d: DespesaViagem): DespesaFormValue {
  return {
    categoria: d.categoria,
    valor: centavosParaBRL(Number(d.valor_centavos)).replace('R$ ', ''),
    data_despesa: d.data_despesa.slice(0, 10),
    estabelecimento: d.estabelecimento ?? '',
    descricao: d.descricao ?? '',
    documento_numero: d.documento_numero ?? '',
  };
}

function DespesaForm({ inicial, salvando, onSalvar, onCancelar }: {
  inicial: DespesaFormValue;
  salvando: boolean;
  onSalvar: (p: NovaDespesaInput) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<DespesaFormValue>(inicial);
  const set = (k: keyof DespesaFormValue, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const centavos = reaisParaCentavos(f.valor);
    if (centavos === null) { toast.error('Valor inválido. Ex.: 250,00 ou 1.234,56'); return; }
    if (!f.data_despesa) { toast.error('Informe a data da despesa'); return; }
    onSalvar({
      categoria: f.categoria,
      valor_centavos: centavos,
      data_despesa: f.data_despesa,
      descricao: f.descricao.trim() || undefined,
      estabelecimento: f.estabelecimento.trim() || undefined,
      documento_numero: f.documento_numero.trim() || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
      <label className={labelCls}>
        Categoria
        <select className={inputCls} value={f.categoria} onChange={(e) => set('categoria', e.target.value)}>
          {CATEGORIAS_VALIDAS.map((c) => <option key={c} value={c}>{rotuloCategoria(c)}</option>)}
        </select>
      </label>
      <label className={labelCls}>
        Valor (R$)
        <input className={inputCls} inputMode="decimal" placeholder="250,00" value={f.valor} onChange={(e) => set('valor', e.target.value)} />
      </label>
      <label className={labelCls}>
        Data
        <input type="date" className={inputCls} value={f.data_despesa} onChange={(e) => set('data_despesa', e.target.value)} />
      </label>
      <label className={labelCls}>
        Estabelecimento
        <input className={inputCls} value={f.estabelecimento} onChange={(e) => set('estabelecimento', e.target.value)} />
      </label>
      <label className={`${labelCls} col-span-2`}>
        Descrição
        <input className={inputCls} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} />
      </label>
      <label className={`${labelCls} col-span-2`}>
        Nº do documento (opcional)
        <input className={inputCls} value={f.documento_numero} onChange={(e) => set('documento_numero', e.target.value)} />
      </label>
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-black dark:text-white">Cancelar</button>
        <button type="submit" disabled={salvando} className="px-3 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

// ── Formulário de cabeçalho da viagem ─────────────────────────────
interface ViagemFormValue {
  titulo: string; destino: string; motivo: string;
  data_inicio: string; data_fim: string; observacoes: string;
}
function ViagemForm({ inicial, salvando, textoBotao, onSalvar, onCancelar }: {
  inicial: ViagemFormValue;
  salvando: boolean;
  textoBotao: string;
  onSalvar: (v: ViagemFormValue) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<ViagemFormValue>(inicial);
  const set = (k: keyof ViagemFormValue, v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.titulo.trim()) { toast.error('Dê um título à viagem'); return; }
    onSalvar(f);
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
      <label className={`${labelCls} col-span-2`}>
        Título
        <input className={inputCls} value={f.titulo} placeholder="Bacabal → São Luís" onChange={(e) => set('titulo', e.target.value)} />
      </label>
      <label className={labelCls}>
        Destino
        <input className={inputCls} value={f.destino} onChange={(e) => set('destino', e.target.value)} />
      </label>
      <label className={labelCls}>
        Motivo
        <input className={inputCls} value={f.motivo} onChange={(e) => set('motivo', e.target.value)} />
      </label>
      <label className={labelCls}>
        Início
        <input type="date" className={inputCls} value={f.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} />
      </label>
      <label className={labelCls}>
        Fim
        <input type="date" className={inputCls} value={f.data_fim} onChange={(e) => set('data_fim', e.target.value)} />
      </label>
      <label className={`${labelCls} col-span-2`}>
        Observações
        <textarea className={inputCls} rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
      </label>
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-black dark:text-white">Cancelar</button>
        <button type="submit" disabled={salvando} className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50">
          {salvando ? 'Salvando…' : textoBotao}
        </button>
      </div>
    </form>
  );
}

// ── Componente principal ──────────────────────────────────────────
export default function DespesasViagemModal() {
  const [viagens, setViagens] = useState<ViagemResumo[]>([]);
  const [filtro, setFiltro] = useState<string>('');
  const [selId, setSelId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ViagemDetalhe | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [novaViagemAberta, setNovaViagemAberta] = useState(false);
  const [editandoCabecalho, setEditandoCabecalho] = useState(false);
  const [addDespesaAberta, setAddDespesaAberta] = useState(false);
  const [editDespesaId, setEditDespesaId] = useState<string | null>(null);
  const [confirmDelViagem, setConfirmDelViagem] = useState(false);
  const [confirmDelDespesa, setConfirmDelDespesa] = useState<string | null>(null);
  const [soPendentes, setSoPendentes] = useState(false);

  const carregarLista = useCallback(async () => {
    setCarregandoLista(true);
    try {
      setViagens(await listarViagens(filtro || undefined));
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar viagens');
    } finally {
      setCarregandoLista(false);
    }
  }, [filtro]);

  const carregarDetalhe = useCallback(async (id: string) => {
    setCarregandoDetalhe(true);
    try {
      setDetalhe(await getViagem(id));
    } catch (e: any) {
      toast.error(e.message || 'Erro ao abrir a viagem');
      setDetalhe(null);
    } finally {
      setCarregandoDetalhe(false);
    }
  }, []);

  useEffect(() => { carregarLista(); }, [carregarLista]);
  useEffect(() => {
    if (selId) carregarDetalhe(selId);
    else setDetalhe(null);
    setEditandoCabecalho(false);
    setAddDespesaAberta(false);
    setEditDespesaId(null);
    setConfirmDelViagem(false);
    setConfirmDelDespesa(null);
  }, [selId, carregarDetalhe]);

  const recarregar = async () => {
    await carregarLista();
    if (selId) await carregarDetalhe(selId);
  };

  const handleNovaViagem = async (v: ViagemFormValue) => {
    setSalvando(true);
    try {
      const nova = await criarViagem({
        titulo: v.titulo.trim(),
        destino: v.destino.trim() || undefined,
        motivo: v.motivo.trim() || undefined,
        data_inicio: v.data_inicio || undefined,
        data_fim: v.data_fim || undefined,
        observacoes: v.observacoes.trim() || undefined,
      });
      setNovaViagemAberta(false);
      await carregarLista();
      setSelId(nova.id);
      toast.success('Viagem criada');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar viagem');
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarCabecalho = async (v: ViagemFormValue) => {
    if (!selId) return;
    setSalvando(true);
    try {
      const patch: PatchViagemInput = {
        titulo: v.titulo.trim(),
        destino: v.destino.trim(),
        motivo: v.motivo.trim(),
        data_inicio: v.data_inicio,
        data_fim: v.data_fim,
        observacoes: v.observacoes.trim(),
      };
      await atualizarViagem(selId, patch);
      setEditandoCabecalho(false);
      await recarregar();
      toast.success('Viagem atualizada');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const handleStatus = async (status: string) => {
    if (!selId || detalhe?.status === status) return;
    try {
      await atualizarViagem(selId, { status });
      await recarregar();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao mudar status');
    }
  };

  const handleExcluirViagem = async () => {
    if (!selId) return;
    try {
      await excluirViagem(selId);
      setSelId(null);
      await carregarLista();
      toast.success('Viagem excluída');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir viagem');
    }
  };

  const handleSalvarDespesa = async (p: NovaDespesaInput) => {
    if (!selId) return;
    setSalvando(true);
    try {
      if (editDespesaId) {
        await atualizarDespesa(editDespesaId, p);
        setEditDespesaId(null);
        toast.success('Despesa atualizada');
      } else {
        await criarDespesa(selId, p);
        setAddDespesaAberta(false);
        toast.success('Despesa lançada');
      }
      await recarregar();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar despesa');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirDespesa = async (id: string) => {
    try {
      await excluirDespesa(id);
      setConfirmDelDespesa(null);
      await recarregar();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir despesa');
    }
  };

  const despesas = detalhe?.despesas ?? [];
  const resumo = resumoPorCategoria(despesas.map(toItem));
  const totalNum = despesas.reduce((s, d) => s + Number(d.valor_centavos), 0);
  const despesasVisiveis = soPendentes
    ? despesas.filter((d) => d.ia_status === 'pendente' || d.ia_status === 'extraido' || d.ia_confianca === 'baixa')
    : despesas;

  return (
    <div className="flex h-[75vh] min-h-0">
      {/* ── Coluna esquerda: lista ── */}
      <div className="w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col min-h-0">
        <div className="p-3 space-y-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => { setNovaViagemAberta(true); setSelId(null); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Nova viagem
          </button>
          <div className="flex gap-1">
            {['', ...STATUS_ORDEM].map((s) => (
              <button
                key={s || 'todas'}
                onClick={() => setFiltro(s)}
                className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
                  filtro === s
                    ? 'bg-zinc-800 text-white dark:bg-white dark:text-black'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                }`}
              >
                {s ? STATUS_LABEL[s] : 'Todas'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
          {carregandoLista && <p className="text-xs text-zinc-400 px-2 py-4">Carregando…</p>}
          {!carregandoLista && viagens.length === 0 && (
            <p className="text-xs text-zinc-400 px-2 py-4">Nenhuma viagem{filtro ? ' com esse status' : ''}.</p>
          )}
          {viagens.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelId(v.id)}
              className={`w-full text-left rounded-lg p-2.5 border ${
                selId === v.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-black dark:text-white truncate">{v.titulo}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${STATUS_BADGE[v.status] || ''}`}>
                  {STATUS_LABEL[v.status] || v.status}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 truncate">{v.destino || '—'} · {periodoLabel(v)}</p>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {centavosParaBRL(Number(v.total_centavos))} <span className="font-normal text-zinc-400">· {v.qtd_despesas} item(ns)</span>
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Coluna direita: detalhe ── */}
      <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-5">
        {novaViagemAberta && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-black dark:text-white">Nova viagem</p>
            <ViagemForm
              inicial={{ titulo: '', destino: '', motivo: '', data_inicio: hoje(), data_fim: '', observacoes: '' }}
              salvando={salvando}
              textoBotao="Criar viagem"
              onSalvar={handleNovaViagem}
              onCancelar={() => setNovaViagemAberta(false)}
            />
          </div>
        )}

        {!novaViagemAberta && !selId && (
          <div className="h-full flex items-center justify-center text-sm text-zinc-400">
            Selecione uma viagem à esquerda ou crie uma nova.
          </div>
        )}

        {!novaViagemAberta && selId && carregandoDetalhe && !detalhe && (
          <p className="text-sm text-zinc-400">Carregando viagem…</p>
        )}

        {!novaViagemAberta && detalhe && (
          <div className="space-y-5">
            {/* Cabeçalho */}
            {editandoCabecalho ? (
              <ViagemForm
                inicial={{
                  titulo: detalhe.titulo,
                  destino: detalhe.destino ?? '',
                  motivo: detalhe.motivo ?? '',
                  data_inicio: detalhe.data_inicio ?? '',
                  data_fim: detalhe.data_fim ?? '',
                  observacoes: detalhe.observacoes ?? '',
                }}
                salvando={salvando}
                textoBotao="Salvar"
                onSalvar={handleSalvarCabecalho}
                onCancelar={() => setEditandoCabecalho(false)}
              />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-black dark:text-white truncate">{detalhe.titulo}</h3>
                  <p className="text-xs text-zinc-500">
                    {[detalhe.destino, detalhe.motivo].filter(Boolean).join(' · ') || 'sem destino/motivo'}
                  </p>
                  <p className="text-xs text-zinc-500">{periodoLabel(detalhe)} · {detalhe.empresa}</p>
                  {detalhe.observacoes && <p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap">{detalhe.observacoes}</p>}
                </div>
                <button
                  onClick={() => setEditandoCabecalho(true)}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-black dark:hover:text-white"
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar dados
                </button>
              </div>
            )}

            {/* Status + excluir */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-1">
                {STATUS_ORDEM.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      detalhe.status === s
                        ? 'bg-zinc-800 text-white dark:bg-white dark:text-black'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-black dark:hover:text-white'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              {confirmDelViagem ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-red-500 font-semibold">Excluir a viagem e todas as despesas?</span>
                  <button onClick={handleExcluirViagem} className="px-2 py-1 rounded-md bg-red-600 text-white font-bold">Sim, excluir</button>
                  <button onClick={() => setConfirmDelViagem(false)} className="px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700">Não</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelViagem(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir viagem
                </button>
              )}
            </div>

            {/* Totais */}
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Total da viagem</span>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{centavosParaBRL(totalNum)}</span>
              </div>
              {resumo.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {resumo.map((r) => (
                    <span key={r.categoria} className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
                      {r.rotulo}: {centavosParaBRL(r.totalCentavos)} ({r.qtd})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Despesas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-black dark:text-white">Despesas</p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-zinc-500">
                    <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
                    Só pendências
                  </label>
                  <button onClick={recarregar} className="text-zinc-400 hover:text-black dark:hover:text-white" title="Recarregar">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setAddDespesaAberta(true); setEditDespesaId(null); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar despesa
                  </button>
                </div>
              </div>

              {addDespesaAberta && (
                <DespesaForm
                  inicial={despesaFormVazio()}
                  salvando={salvando}
                  onSalvar={handleSalvarDespesa}
                  onCancelar={() => setAddDespesaAberta(false)}
                />
              )}

              {despesasVisiveis.length === 0 && !addDespesaAberta && (
                <p className="text-xs text-zinc-400 py-3">
                  {soPendentes ? 'Nenhuma pendência.' : 'Nenhuma despesa nesta viagem ainda.'}
                </p>
              )}

              <div className="space-y-1.5">
                {despesasVisiveis.map((d) =>
                  editDespesaId === d.id ? (
                    <DespesaForm
                      key={d.id}
                      inicial={despesaParaForm(d)}
                      salvando={salvando}
                      onSalvar={handleSalvarDespesa}
                      onCancelar={() => setEditDespesaId(null)}
                    />
                  ) : (
                    <div key={d.id} className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-black dark:text-white truncate">
                          <span className="font-semibold">{rotuloCategoria(d.categoria)}</span>
                          {d.estabelecimento ? ` · ${d.estabelecimento}` : ''}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {brDate(d.data_despesa)}{d.descricao ? ` · ${d.descricao}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-black dark:text-white shrink-0">{centavosParaBRL(Number(d.valor_centavos))}</span>
                      <button onClick={() => { setEditDespesaId(d.id); setAddDespesaAberta(false); }} className="text-zinc-400 hover:text-black dark:hover:text-white shrink-0" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {confirmDelDespesa === d.id ? (
                        <button onClick={() => handleExcluirDespesa(d.id)} className="text-[11px] font-bold text-red-600 shrink-0">confirmar</button>
                      ) : (
                        <button onClick={() => setConfirmDelDespesa(d.id)} className="text-red-400 hover:text-red-600 shrink-0" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
