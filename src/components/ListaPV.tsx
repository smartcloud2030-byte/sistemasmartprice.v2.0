import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Download, FileSpreadsheet, Search, Trash2, CalendarClock, Loader2, X, ArrowUpDown, Columns3, Check, Percent, KeyRound, Plus, BellRing,
} from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import {
  COLUNAS_OPCIONAIS_PV, COLUNAS_PV_PADRAO, ORDEM_FAIXAS, baixarModeloPV, normalizarFaixas, rotuloFaixa, editarFaixa, intervaloFaixa,
  diasDoInicio, diasDoFim, exibirInicio, exibirFim, dataBR, diasParaVencer,
  exportarPV, importarArquivoPV, lerNumero, moedaBR, percentualBR, percentualDescontoPV, statusPV, precoComDescontoPV,
  type ColunaOpcionalPV, type ColunasPV, type DescontosPorFaixa, type ItemPV, type StatusPV, type FaixasPV, type FaixaEditavel, type UnidadeFaixa,
} from '../lib/listaPV';
import { chaveListaPV, normalizarUsuarioPV, type ModoAcessoListaPV } from '../lib/acessoListaPV';
import { avisosDeTeste, type AvisoPV } from '../lib/avisosListaPV';
import { CartaoAvisosPV, notificarSistema } from './ListaPVNotificacao';

// Lista PV — produtos próximos (ou não) do vencimento.
// Admin: lista geral em settings.lista_pv + pode abrir a de qualquer CNPJ.
// Loja liberada (CNPJ inteiro ou só alguns usuários — botão Acessos, só admin):
// lista própria em settings.lista_pv_<cnpj> (ver settingParaLoja em api.ts).

interface DadosPV {
  itens: ItemPV[];
  /** Colunas opcionais ligadas (vale pra tela e exportação, igual pra todos os admins). */
  colunas?: Partial<ColunasPV>;
  /** % de desconto por período de vencimento (Configurar descontos). */
  descontos?: DescontosPorFaixa;
  /** Limites dos períodos de vencimento (editáveis com duplo clique na janela Descontos). */
  periodos?: Partial<FaixasPV>;
}

type Filtro = 'todos' | StatusPV;

const COR_STATUS: Record<StatusPV, string> = {
  vencido: 'bg-red-700 text-white dark:bg-red-800',
  vermelho: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amareloEscuro: 'bg-amber-300 text-amber-950 dark:bg-amber-500/80 dark:text-amber-950',
  amareloClaro: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-300/20 dark:text-yellow-200',
  verde: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

// Faixa colorida na borda esquerda da linha, pra bater o olho na tabela.
const BORDA_STATUS: Record<StatusPV, string> = {
  vencido: 'border-l-red-700',
  vermelho: 'border-l-red-500',
  amareloEscuro: 'border-l-amber-500',
  amareloClaro: 'border-l-yellow-300',
  verde: 'border-l-emerald-500',
};

async function carregarPV(chave: string): Promise<DadosPV> {
  const res = await fetch(`/api/settings/${chave}`);
  if (!res.ok) throw new Error(`Falha ao carregar a lista (${res.status})`);
  const json = await res.json();
  const v = json?.value;
  return {
    itens: Array.isArray(v?.itens) ? v.itens : [],
    colunas: v?.colunas && typeof v.colunas === 'object' ? v.colunas : undefined,
    descontos: v?.descontos && typeof v.descontos === 'object' ? v.descontos : undefined,
    periodos: v?.periodos && typeof v.periodos === 'object' ? v.periodos : undefined,
  };
}

async function salvarPV(chave: string, dados: DadosPV) {
  const res = await fetch(`/api/settings/${chave}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: dados }),
  });
  if (!res.ok) throw new Error(`Falha ao salvar a lista (${res.status})`);
}

// Campo da linha: só vira editável com dois cliques; grava ao sair do campo
// ou no Enter, Esc desfaz. Fora da edição é texto comum (sem cara de formulário).
type PropsCampo = {
  rotulo: string;
  largura?: string;
  alinhar?: 'left' | 'right';
  prefixo?: string;
  sufixo?: string;
  sempreComBorda?: boolean;
} & (
  | { tipo: 'texto'; valor: string; aoSalvar: (v: string) => void }
  | { tipo: 'numero'; casas: number; valor: number | null | undefined; aoSalvar: (v: number | null) => void; max?: number }
);

function CampoLinha(p: PropsCampo) {
  const formatar = () =>
    p.tipo === 'texto'
      ? p.valor
      : p.valor == null
        ? ''
        : p.valor.toLocaleString('pt-BR', { minimumFractionDigits: p.casas === 2 && p.prefixo ? 2 : 0, maximumFractionDigits: p.casas });
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(formatar());
  useEffect(() => { if (!editando) setTexto(formatar()); }, [p.valor, editando]);
  const sair = () => setEditando(false);
  const confirmar = () => {
    sair();
    if (p.tipo === 'texto') {
      const v = texto.trim();
      if (v !== p.valor) p.aoSalvar(v);
      return;
    }
    const n = lerNumero(texto);
    if (texto.trim() && n == null) return void toast.error(`${p.rotulo}: valor inválido.`);
    if (n != null && (n < 0 || (p.max != null && n > p.max))) {
      return void toast.error(`${p.rotulo}: tem que ficar entre 0 e ${p.max ?? '∞'}.`);
    }
    const fator = 10 ** p.casas;
    const novo = n == null ? null : Math.round(n * fator) / fator;
    if (novo !== (p.valor ?? null)) p.aoSalvar(novo);
  };
  const exibido = formatar();
  return (
    <div
      onDoubleClick={() => { if (!editando) { setTexto(formatar()); setEditando(true); } }}
      title={editando ? undefined : `Dois cliques para editar ${p.rotulo.toLowerCase()}`}
      className={cn(
        'inline-flex items-center gap-1 border rounded-lg px-2 py-1 select-none',
        editando
          ? 'border-blue-500 bg-white dark:bg-zinc-900'
          : p.sempreComBorda
            ? 'border-zinc-200 dark:border-zinc-700 cursor-pointer'
            : 'border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 cursor-pointer',
      )}
    >
      {p.prefixo && (editando || exibido) && <span className="text-xs text-zinc-400">{p.prefixo}</span>}
      {editando ? (
        <input
          autoFocus
          onFocus={(e) => e.target.select()}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setTexto(formatar()); sair(); }
          }}
          inputMode={p.tipo === 'numero' ? 'decimal' : 'text'}
          aria-label={p.rotulo}
          className={cn(
            'bg-transparent text-sm text-zinc-900 dark:text-zinc-100 outline-none select-text',
            p.largura || 'w-16',
            p.alinhar === 'left' ? 'text-left' : 'text-right',
          )}
        />
      ) : (
        <span
          className={cn(
            'text-sm truncate',
            p.largura || 'w-16',
            p.alinhar === 'left' ? 'text-left' : 'text-right',
            exibido ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-300 dark:text-zinc-600',
          )}
        >
          {exibido || '—'}
        </span>
      )}
      {p.sufixo && (editando || exibido) && <span className="text-xs text-zinc-400">{p.sufixo}</span>}
    </div>
  );
}

const formatarCnpj = (c: string) => {
  const d = c.replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;
};

type LojaPV = { cnpj: string; bandeira: string; listaPVAcesso?: ModoAcessoListaPV; listaPVUsuarios?: string[]; lastUsername?: string };

// Uma loja na janela Acessos: sem acesso / todos os usuários do CNPJ / só os nomes da lista.
function LinhaAcessoPV({ loja, aoMudar }: { loja: LojaPV; aoMudar: (modo: ModoAcessoListaPV, usuarios: string[]) => void }) {
  const modo: ModoAcessoListaPV = loja.listaPVAcesso || 'nenhum';
  const usuarios = loja.listaPVUsuarios || [];
  const [novo, setNovo] = useState('');
  const adicionar = () => {
    const nome = novo.trim().replace(/\s+/g, ' ');
    if (!nome) return;
    if (usuarios.some((u) => normalizarUsuarioPV(u) === normalizarUsuarioPV(nome))) {
      toast.error(`"${nome}" já está na lista.`);
      return;
    }
    aoMudar('usuarios', [...usuarios, nome]);
    setNovo('');
  };
  const OPCOES: { valor: ModoAcessoListaPV; rotulo: string }[] = [
    { valor: 'nenhum', rotulo: 'Sem acesso' },
    { valor: 'todos', rotulo: 'Todos do CNPJ' },
    { valor: 'usuarios', rotulo: 'Só usuários' },
  ];
  return (
    <li className="py-3 space-y-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{loja.bandeira || 'Sem nome'}</div>
          <div className="text-xs text-zinc-500 font-mono">{formatarCnpj(loja.cnpj)}</div>
        </div>
        <div className="inline-flex border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden shrink-0 self-start md:self-auto">
          {OPCOES.map((o) => (
            <button
              key={o.valor}
              onClick={() => aoMudar(o.valor, usuarios)}
              className={cn(
                'px-3 py-1.5 text-xs font-bold border-l first:border-l-0 border-zinc-200 dark:border-zinc-700',
                modo === o.valor ? 'bg-blue-600 text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800',
              )}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>
      {modo === 'usuarios' && (
        <div className="flex flex-wrap items-center gap-1.5 pl-0 md:pl-3 md:border-l-2 border-blue-500/40">
          {usuarios.map((u) => (
            <span key={u} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs text-zinc-700 dark:text-zinc-200">
              {u}
              <button
                onClick={() => aoMudar('usuarios', usuarios.filter((x) => x !== u))}
                className="p-0.5 text-zinc-400 hover:text-red-600"
                title={`Tirar ${u}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <span className="inline-flex items-center border border-zinc-200 dark:border-zinc-700 rounded-md focus-within:border-blue-500">
            <input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }}
              placeholder="Nome do usuário"
              className="w-36 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
            />
            <button onClick={adicionar} className="px-1.5 text-blue-600 hover:text-blue-700" title="Adicionar usuário">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </span>
          {!usuarios.length && <span className="text-xs text-amber-600">Ninguém liberado ainda.</span>}
          {loja.lastUsername && !usuarios.some((u) => normalizarUsuarioPV(u) === normalizarUsuarioPV(loja.lastUsername)) && (
            <button onClick={() => aoMudar('usuarios', [...usuarios, loja.lastUsername!])} className="text-xs text-blue-600 hover:underline">
              + {loja.lastUsername} (último acesso)
            </button>
          )}
        </div>
      )}
    </li>
  );
}

const rotuloSituacao = (st: StatusPV, f: FaixasPV) => (st === 'vencido' ? 'Vencido' : rotuloFaixa(st, f));

// Edita o período de uma faixa (aberto com duplo clique no nome dela).
function EditorPeriodo({ faixa, periodos, aoAplicar, aoCancelar }: {
  faixa: FaixaEditavel;
  periodos: FaixasPV;
  aoAplicar: (novo: FaixasPV) => void;
  aoCancelar: () => void;
}) {
  const { de, ate } = intervaloFaixa(faixa, periodos);
  const [unidade, setUnidade] = useState<UnidadeFaixa>(periodos.unidades[faixa]);
  const [txDe, setTxDe] = useState(String(exibirInicio(de, periodos.unidades[faixa])));
  const [txAte, setTxAte] = useState(ate == null ? '' : String(exibirFim(ate, periodos.unidades[faixa])));
  const temDe = faixa !== 'vermelho';
  const temAte = faixa !== 'verde';
  const trocarUnidade = (u: UnidadeFaixa) => {
    // converte o que está digitado pra nova unidade
    const nDe = lerNumero(txDe);
    const nAte = lerNumero(txAte);
    if (nDe != null) setTxDe(String(exibirInicio(diasDoInicio(nDe, unidade), u)));
    if (nAte != null) setTxAte(String(exibirFim(diasDoFim(nAte, unidade), u)));
    setUnidade(u);
  };
  const aplicar = () => {
    const nDe = temDe ? lerNumero(txDe) : null;
    const nAte = temAte ? lerNumero(txAte) : null;
    if ((temDe && (nDe == null || !Number.isInteger(nDe))) || (temAte && (nAte == null || !Number.isInteger(nAte)))) {
      toast.error('Use números inteiros.');
      return;
    }
    if (temDe && temAte && nDe! > nAte!) {
      toast.error('O início tem que ser antes do fim.');
      return;
    }
    const r = editarFaixa(
      periodos, faixa,
      temDe ? diasDoInicio(nDe!, unidade) : null,
      temAte ? diasDoFim(nAte!, unidade) : null,
      unidade,
    );
    if (typeof r === 'string') return void toast.error(r);
    aoAplicar(r);
  };
  const campo = (valor: string, set: (v: string) => void, rotulo: string) => (
    <input
      autoFocus={rotulo === (temDe ? 'Início' : 'Fim')}
      onFocus={(e) => e.target.select()}
      value={valor}
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') aplicar(); if (e.key === 'Escape') aoCancelar(); }}
      inputMode="numeric"
      aria-label={rotulo}
      className="w-11 border border-zinc-200 dark:border-zinc-700 rounded-md px-1.5 py-1 bg-white dark:bg-zinc-900 text-right text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500"
    />
  );
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-sm text-zinc-600 dark:text-zinc-300">
      {faixa === 'vermelho' && <span>até</span>}
      {faixa === 'verde' && <span>a partir de</span>}
      {temDe && campo(txDe, setTxDe, 'Início')}
      {temDe && temAte && <span>a</span>}
      {temAte && campo(txAte, setTxAte, 'Fim')}
      <select
        value={unidade}
        onChange={(e) => trocarUnidade(e.target.value as UnidadeFaixa)}
        className="border border-zinc-200 dark:border-zinc-700 rounded-md px-1 py-1 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500"
      >
        <option value="dias">dias</option>
        <option value="meses">meses</option>
      </select>
      <button onClick={aplicar} className="p-1 text-blue-600 hover:text-blue-700" title="Aplicar"><Check className="w-4 h-4" /></button>
      <button onClick={aoCancelar} className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" title="Cancelar"><X className="w-4 h-4" /></button>
    </div>
  );
}

export default function ListaPV() {
  const { setView, userRole, currentUser, allowedStores, setListaPVAcesso } = useStore();
  const ehAdmin = userRole === 'admin';
  // Admin: '' = lista geral; senão o CNPJ (só dígitos) cuja lista está aberta.
  const [cnpjAberto, setCnpjAberto] = useState('');
  const chave = ehAdmin ? chaveListaPV(cnpjAberto) : chaveListaPV(currentUser?.cnpj);
  const [janelaAcessos, setJanelaAcessos] = useState(false);
  // Admin: prévia do aviso que o usuário liberado recebe (não grava nada).
  const [avisosTeste, setAvisosTeste] = useState<AvisoPV[] | null>(null);
  const [buscaAcessos, setBuscaAcessos] = useState('');
  const lojasOrdenadas = useMemo(
    () => [...allowedStores].sort((a, b) => (a.bandeira || '').localeCompare(b.bandeira || '') || a.cnpj.localeCompare(b.cnpj)),
    [allowedStores],
  );
  const [dados, setDados] = useState<DadosPV>({ itens: [] });
  const [carregando, setCarregando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  // true = do mais próximo do vencimento (vencidos no topo) ao mais distante
  const [maisProximoPrimeiro, setMaisProximoPrimeiro] = useState(true);
  const [pendente, setPendente] = useState<{ itens: ItemPV[]; ignoradas: number; nome: string } | null>(null);
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  const [menuColunas, setMenuColunas] = useState(false);
  const [editandoDescontos, setEditandoDescontos] = useState<Record<StatusPV, string> | null>(null);
  const [editandoPeriodos, setEditandoPeriodos] = useState<FaixasPV | null>(null);
  const [faixaEmEdicao, setFaixaEmEdicao] = useState<FaixaEditavel | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const colunas: ColunasPV = { ...COLUNAS_PV_PADRAO, ...dados.colunas };
  const alternarColuna = (chave: ColunaOpcionalPV) => gravar({ ...dados, colunas: { ...colunas, [chave]: !colunas[chave] } });
  const descontos = dados.descontos || {};
  const periodos = useMemo(() => normalizarFaixas(dados.periodos), [dados.periodos]);

  const abrirDescontos = () => {
    const t = {} as Record<StatusPV, string>;
    ORDEM_FAIXAS.forEach((f) => { t[f] = descontos[f] != null ? String(descontos[f]).replace('.', ',') : ''; });
    setEditandoDescontos(t);
    setEditandoPeriodos(periodos);
    setFaixaEmEdicao(null);
  };

  const salvarDescontos = async () => {
    if (!editandoDescontos) return;
    const novos: DescontosPorFaixa = {};
    for (const f of ORDEM_FAIXAS) {
      const n = lerNumero(editandoDescontos[f]);
      if (n == null) continue;
      if (n < 0 || n > 100) return toast.error(`Desconto de "${rotuloFaixa(f, editandoPeriodos || periodos)}" tem que ficar entre 0 e 100%.`);
      novos[f] = n;
    }
    setEditandoDescontos(null);
    setFaixaEmEdicao(null);
    await gravar({ ...dados, descontos: novos, periodos: editandoPeriodos || periodos }, 'Descontos e períodos salvos.');
  };

  const editarItem = (id: string, mudanca: Partial<ItemPV>) =>
    gravar({ ...dados, itens: dados.itens.map((i) => (i.id === id ? { ...i, ...mudanca } : i)) });

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setDados({ itens: [] });
    carregarPV(chave)
      .then((d) => { if (vivo) setDados(d); })
      .catch((e) => { if (vivo) toast.error(e.message); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [chave]);

  const gravar = async (novo: DadosPV, msg?: string) => {
    const anterior = dados;
    setDados(novo);
    try {
      await salvarPV(chave, novo);
      if (msg) toast.success(msg);
    } catch (e: any) {
      setDados(anterior);
      toast.error(e.message || 'Falha ao salvar a lista.');
    }
  };

  // Usa os produtos da lista aberta (ou exemplos, se nenhum estiver perto do
  // vencimento) e dispara também a notificação do computador, se permitida.
  const testarAviso = async () => {
    const avisos = avisosDeTeste(dados.itens, periodos.limites[0]);
    setAvisosTeste(avisos);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    notificarSistema(avisos);
  };

  const comStatus = useMemo(
    () =>
      dados.itens
        .map((i) => {
          const dias = diasParaVencer(i.vencimento);
          const status = statusPV(dias, periodos.limites);
          const pctDesconto = percentualDescontoPV(i, status, dados.descontos);
          return { ...i, dias, status, pctDesconto, valorDesconto: precoComDescontoPV(i.precoOferta, pctDesconto) };
        })
        .sort((a, b) => (maisProximoPrimeiro ? a.dias - b.dias : b.dias - a.dias) || a.produto.localeCompare(b.produto)),
    [dados, periodos, maisProximoPrimeiro],
  );

  const contagem = useMemo(() => {
    const c: Record<StatusPV, number> = { vencido: 0, vermelho: 0, amareloEscuro: 0, amareloClaro: 0, verde: 0 };
    comStatus.forEach((i) => c[i.status]++);
    return c;
  }, [comStatus]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return comStatus.filter(
      (i) =>
        (filtro === 'todos' || i.status === filtro) &&
        (!q || [i.produto, i.codigo, i.lote, i.loja].some((c) => c.toLowerCase().includes(q))),
    );
  }, [comStatus, filtro, busca]);

  const aoEscolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setImportando(true);
    try {
      const r = await importarArquivoPV(arquivo);
      if (!r.itens.length) {
        toast.error('Nenhum produto com data de vencimento válida foi encontrado na planilha.');
        return;
      }
      setPendente({ itens: r.itens, ignoradas: r.ignoradas, nome: arquivo.name });
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível ler o arquivo.');
    } finally {
      setImportando(false);
    }
  };

  const confirmarImportacao = async (modo: 'substituir' | 'adicionar') => {
    if (!pendente) return;
    const itens = modo === 'substituir' ? pendente.itens : [...dados.itens, ...pendente.itens];
    const extra = pendente.ignoradas ? ` (${pendente.ignoradas} linha(s) sem data válida ignorada(s))` : '';
    setPendente(null);
    await gravar({ ...dados, itens }, `${pendente.itens.length} produto(s) importado(s)${extra}.`);
  };

  const exportar = () => {
    if (!visiveis.length) return toast.error('Não há produtos para exportar.');
    const sufixo = filtro === 'todos' ? '' : `-${filtro}`;
    exportarPV(visiveis, `lista-pv${sufixo}-${new Date().toISOString().slice(0, 10)}.xlsx`, colunas, dados.descontos, periodos);
  };

  const remover = (id: string) => gravar({ ...dados, itens: dados.itens.filter((i) => i.id !== id) });

  const CARTOES: { chave: Filtro; rotulo: string; valor: number; cor: string }[] = [
    { chave: 'todos', rotulo: 'Total', valor: comStatus.length, cor: 'text-zinc-900 dark:text-white' },
    { chave: 'vencido', rotulo: rotuloFaixa('vencido', periodos), valor: contagem.vencido, cor: 'text-red-700 dark:text-red-500' },
    { chave: 'vermelho', rotulo: rotuloFaixa('vermelho', periodos), valor: contagem.vermelho, cor: 'text-red-500' },
    { chave: 'amareloEscuro', rotulo: rotuloFaixa('amareloEscuro', periodos), valor: contagem.amareloEscuro, cor: 'text-amber-500' },
    { chave: 'amareloClaro', rotulo: rotuloFaixa('amareloClaro', periodos), valor: contagem.amareloClaro, cor: 'text-yellow-500 dark:text-yellow-300' },
    { chave: 'verde', rotulo: rotuloFaixa('verde', periodos), valor: contagem.verde, cor: 'text-emerald-600' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-6">
      <div className="w-full space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <button
              onClick={() => setView(ehAdmin ? 'dashboard' : 'editor')}
              className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-600 dark:text-zinc-300 hover:border-blue-500/50 transition-all"
              title="Voltar ao painel"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-black dark:text-white flex items-center gap-2">
                <CalendarClock className="w-6 h-6 md:w-7 md:h-7 text-blue-600" />
                Lista <span className="text-blue-600">PV</span>
              </h1>
              <p className="text-zinc-500 text-xs md:text-sm font-medium">Produtos próximos do vencimento</p>
            </div>
          </div>
          <div className={cn('grid gap-2 md:flex md:items-center', ehAdmin ? 'grid-cols-2' : 'grid-cols-3')}>
            {ehAdmin && (
              <button
                onClick={() => setJanelaAcessos(true)}
                className="flex items-center justify-center gap-2 px-3 md:px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold text-sm md:text-base hover:border-blue-500/50 transition-all"
                title="Liberar a Lista PV para CNPJs e usuários"
              >
                <KeyRound className="w-5 h-5" />
                Acessos
              </button>
            )}
            {ehAdmin && (
              <button
                onClick={testarAviso}
                className="flex items-center justify-center gap-2 px-3 md:px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold text-sm md:text-base hover:border-blue-500/50 transition-all"
                title="Mostrar o aviso de vencimento como o usuário liberado recebe"
              >
                <BellRing className="w-5 h-5" />
                Testar aviso
              </button>
            )}
            <button
              onClick={baixarModeloPV}
              className="flex items-center justify-center gap-2 px-3 md:px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold text-sm md:text-base hover:border-blue-500/50 transition-all"
              title="Baixar planilha modelo"
            >
              <FileSpreadsheet className="w-5 h-5" />
              Modelo
            </button>
            <button
              onClick={exportar}
              className="flex items-center justify-center gap-2 px-3 md:px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold text-sm md:text-base hover:border-blue-500/50 transition-all"
              title="Exportar a lista filtrada para Excel"
            >
              <Download className="w-5 h-5" />
              Exportar
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={importando}
              className="flex items-center justify-center gap-2 px-3 md:px-5 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-tighter text-sm md:text-base shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-70"
            >
              {importando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              Importar<span className="hidden md:inline"> lista</span>
            </button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={aoEscolherArquivo} />
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
          {CARTOES.map((c) => (
            <button
              key={c.chave}
              onClick={() => setFiltro(c.chave)}
              className={cn(
                'text-left p-3 md:p-4 bg-white dark:bg-zinc-900 border rounded-xl md:rounded-2xl transition-all',
                filtro === c.chave ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50',
              )}
            >
              <div className={cn('text-xl md:text-2xl font-black', c.cor)}>{c.valor}</div>
              <div className="text-[11px] md:text-xs font-bold text-zinc-500 mt-0.5 md:mt-1 leading-tight">{c.rotulo}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <div className="relative flex-1 md:min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por produto, código, lote ou loja"
              className="w-full pl-9 pr-3 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-blue-500"
            />
          </div>
          {ehAdmin && (
            <select
              value={cnpjAberto}
              onChange={(e) => setCnpjAberto(e.target.value)}
              className="py-3 px-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 outline-none focus:border-blue-500 md:max-w-xs"
              title="Qual lista abrir"
            >
              <option value="">Lista geral (admin)</option>
              {lojasOrdenadas.map((l) => (
                <option key={l.cnpj} value={l.cnpj.replace(/\D/g, '')}>
                  {(l.bandeira || 'Sem nome') + ' — ' + formatarCnpj(l.cnpj)}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
          <div className="relative">
            <button
              onClick={() => setMenuColunas((v) => !v)}
              className="h-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold hover:border-blue-500/50 transition-all text-sm"
              title="Mostrar ou esconder colunas"
            >
              <Columns3 className="w-4 h-4" />
              Colunas
            </button>
            {menuColunas && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuColunas(false)} />
                <div className="absolute left-0 md:left-auto md:right-0 top-full mt-2 z-20 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg py-1">
                  {COLUNAS_OPCIONAIS_PV.map((c) => (
                    <button
                      key={c.chave}
                      onClick={() => alternarColuna(c.chave)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span className={cn('w-4 h-4 rounded border flex items-center justify-center', colunas[c.chave] ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-600')}>
                        {colunas[c.chave] && <Check className="w-3 h-3" />}
                      </span>
                      {c.rotulo}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={abrirDescontos}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold hover:border-blue-500/50 transition-all text-sm"
            title="Configurar o desconto de cada período"
          >
            <Percent className="w-4 h-4" />
            Descontos
          </button>
          <button
            onClick={() => setMaisProximoPrimeiro((v) => !v)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold hover:border-blue-500/50 transition-all text-sm"
            title="Inverter a ordem"
          >
            <ArrowUpDown className="w-4 h-4" />
            {maisProximoPrimeiro ? <>Mais próximo<span className="hidden md:inline"> do vencimento</span> primeiro</> : 'Mais distante primeiro'}
          </button>
          {dados.itens.length > 0 && (
            <button
              onClick={() => setConfirmarLimpar(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-red-600 border border-zinc-200 dark:border-zinc-800 rounded-2xl font-bold hover:bg-red-50 dark:hover:bg-red-900/10 transition-all text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Limpar<span className="hidden md:inline"> lista</span>
            </button>
          )}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          {carregando ? (
            <div className="p-12 flex justify-center text-zinc-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : !visiveis.length ? (
            <div className="p-12 text-center text-zinc-500 text-sm">
              {dados.itens.length
                ? 'Nenhum produto neste filtro.'
                : 'Nenhum produto ainda. Clique em "Importar lista" e envie uma planilha com produto e data de vencimento (baixe o modelo se precisar).'}
            </div>
          ) : (
            <>
            {/* Celular: um cartão por produto */}
            <ul className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
              {visiveis.map((i) => (
                <li key={i.id} className={cn('border-l-4 px-4 py-3 flex gap-3', BORDA_STATUS[i.status])}>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{i.produto || '—'}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap', COR_STATUS[i.status])}>
                        {rotuloSituacao(i.status, periodos)}
                      </span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Vence {dataBR(i.vencimento)}</span>
                    </div>
                    <div className="text-xs text-zinc-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      {i.codigo && <span className="font-mono">{i.codigo}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-zinc-500 -ml-2">
                      {colunas.quantidade && (
                        <label className="flex items-center">
                          <span className="pl-2">Qtd</span>
                          <CampoLinha tipo="numero" casas={3} rotulo="Quantidade" largura="w-10" alinhar="left" valor={i.quantidade} aoSalvar={(v) => editarItem(i.id, { quantidade: v })} />
                        </label>
                      )}
                      {colunas.lote && (
                        <label className="flex items-center">
                          <span className="pl-2">Lote</span>
                          <CampoLinha tipo="texto" rotulo="Lote" largura="w-16" alinhar="left" valor={i.lote} aoSalvar={(v) => editarItem(i.id, { lote: v })} />
                        </label>
                      )}
                      {colunas.loja && (
                        <label className="flex items-center">
                          <span className="pl-2">Loja</span>
                          <CampoLinha tipo="texto" rotulo="Loja" largura="w-24" alinhar="left" valor={i.loja} aoSalvar={(v) => editarItem(i.id, { loja: v })} />
                        </label>
                      )}
                      {colunas.custo && (
                        <label className="flex items-center">
                          <span className="pl-2">Custo</span>
                          <CampoLinha tipo="numero" casas={2} rotulo="Custo" prefixo="R$" largura="w-14" alinhar="left" valor={i.custo} aoSalvar={(v) => editarItem(i.id, { custo: v })} />
                        </label>
                      )}
                    </div>
                    {(colunas.precoOferta || colunas.desconto) && (
                      <div className="flex items-center gap-3 flex-wrap">
                        {colunas.precoOferta && (
                          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                            Oferta
                            <CampoLinha tipo="numero" casas={2} rotulo="Preço de oferta" prefixo="R$" sempreComBorda valor={i.precoOferta} aoSalvar={(v) => editarItem(i.id, { precoOferta: v })} />
                          </label>
                        )}
                        {colunas.desconto && (
                          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                            Desc.
                            <CampoLinha
                              tipo="numero" casas={2} max={100} rotulo="Desconto (%)" sufixo="%" largura="w-10" sempreComBorda
                              valor={i.pctDesconto}
                              aoSalvar={(v) => editarItem(i.id, { descontoManual: v })}
                            />
                            {i.valorDesconto != null && (
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-black text-sm" title="Preço com desconto">
                                {moedaBR(i.valorDesconto)}
                              </span>
                            )}
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end justify-between shrink-0">
                    <button
                      onClick={() => remover(i.id)}
                      className="p-1.5 -mr-1.5 -mt-1 text-zinc-400 hover:text-red-600 rounded-lg"
                      title="Remover da lista"
                      aria-label={`Remover ${i.produto || i.codigo} da lista`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="text-right">
                      <div className={cn('text-xl font-black leading-none', i.dias < 0 ? 'text-red-600' : 'text-zinc-800 dark:text-zinc-200')}>{i.dias}</div>
                      <div className="text-[10px] font-bold uppercase text-zinc-500 mt-0.5">{Math.abs(i.dias) === 1 ? 'dia' : 'dias'}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3">Produto</th>
                    <th className="text-left px-4 py-3">Código</th>
                    <th className="text-left px-4 py-3">
                      <button onClick={() => setMaisProximoPrimeiro((v) => !v)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-blue-600" title="Inverter a ordem">
                        Vencimento <span aria-hidden="true">{maisProximoPrimeiro ? '↑' : '↓'}</span>
                      </button>
                    </th>
                    <th className="text-right px-4 py-3">Dias</th>
                    <th className="text-left px-4 py-3">Situação</th>
                    {colunas.quantidade && <th className="text-right px-4 py-3">Qtd</th>}
                    {colunas.lote && <th className="text-left px-4 py-3">Lote</th>}
                    {colunas.loja && <th className="text-left px-4 py-3">Loja</th>}
                    {colunas.custo && <th className="text-right px-4 py-3">Custo</th>}
                    {colunas.precoOferta && <th className="text-right px-4 py-3 whitespace-nowrap">Preço de oferta</th>}
                    {colunas.desconto && <th className="text-right px-4 py-3" title="Preço de oferta com o desconto aplicado">Preço c/ desconto</th>}
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {visiveis.map((i) => (
                    <tr key={i.id} className={cn('border-l-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40', BORDA_STATUS[i.status])}>
                      <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">{i.produto || '—'}</td>
                      <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{i.codigo || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-700 dark:text-zinc-300">{dataBR(i.vencimento)}</td>
                      <td className={cn('px-4 py-3 text-right font-bold', i.dias < 0 ? 'text-red-600' : 'text-zinc-700 dark:text-zinc-300')}>
                        {i.dias}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap', COR_STATUS[i.status])}>
                          {rotuloSituacao(i.status, periodos)}
                        </span>
                      </td>
                      {colunas.quantidade && (
                        <td className="px-2 py-2 text-right">
                          <CampoLinha tipo="numero" casas={3} rotulo="Quantidade" largura="w-12" valor={i.quantidade} aoSalvar={(v) => editarItem(i.id, { quantidade: v })} />
                        </td>
                      )}
                      {colunas.lote && (
                        <td className="px-2 py-2">
                          <CampoLinha tipo="texto" rotulo="Lote" alinhar="left" largura="w-20" valor={i.lote} aoSalvar={(v) => editarItem(i.id, { lote: v })} />
                        </td>
                      )}
                      {colunas.loja && (
                        <td className="px-2 py-2">
                          <CampoLinha tipo="texto" rotulo="Loja" alinhar="left" largura="w-28" valor={i.loja} aoSalvar={(v) => editarItem(i.id, { loja: v })} />
                        </td>
                      )}
                      {colunas.custo && (
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <CampoLinha tipo="numero" casas={2} rotulo="Custo" prefixo="R$" valor={i.custo} aoSalvar={(v) => editarItem(i.id, { custo: v })} />
                        </td>
                      )}
                      {colunas.precoOferta && (
                        <td className="px-4 py-2 text-right">
                          <CampoLinha tipo="numero" casas={2} rotulo="Preço de oferta" prefixo="R$" sempreComBorda valor={i.precoOferta} aoSalvar={(v) => editarItem(i.id, { precoOferta: v })} />
                        </td>
                      )}
                      {colunas.desconto && (
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {i.valorDesconto != null && (
                              <span className="inline-block px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-black" title="Preço com desconto">
                                {moedaBR(i.valorDesconto)}
                              </span>
                            )}
                            <CampoLinha
                              tipo="numero" casas={2} max={100} rotulo="Desconto (%)" sufixo="%" largura="w-10"
                              valor={i.pctDesconto}
                              aoSalvar={(v) => editarItem(i.id, { descontoManual: v })}
                            />
                          </div>
                          {i.descontoManual != null && (
                            <button
                              onClick={() => editarItem(i.id, { descontoManual: null })}
                              className="text-[11px] text-blue-600 hover:underline"
                              title="Voltar a usar o desconto do período"
                            >
                              manual · usar o do período
                            </button>
                          )}
                        </td>
                      )}
                      <td className="px-2 py-3">
                        <button
                          onClick={() => remover(i.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-600 rounded-lg"
                          title="Remover da lista"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </div>

      {pendente && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-md w-full space-y-4 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-lg font-black text-zinc-900 dark:text-white">Importar {pendente.itens.length} produto(s)?</h2>
            <p className="text-sm text-zinc-500">
              Arquivo: {pendente.nome}
              {pendente.ignoradas > 0 && <><br />{pendente.ignoradas} linha(s) sem data de vencimento válida serão ignoradas.</>}
            </p>
            {dados.itens.length > 0 && (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                A lista atual tem {dados.itens.length} produto(s). Você quer substituir ou somar?
              </p>
            )}
            <div className="flex gap-2 justify-end flex-wrap [&>button]:flex-1 sm:[&>button]:flex-none">
              <button onClick={() => setPendente(null)} className="px-4 py-2.5 rounded-xl font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Cancelar
              </button>
              {dados.itens.length > 0 && (
                <button onClick={() => confirmarImportacao('adicionar')} className="px-4 py-2.5 rounded-xl font-bold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:border-blue-500">
                  Somar à lista
                </button>
              )}
              <button onClick={() => confirmarImportacao('substituir')} className="px-4 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700">
                {dados.itens.length > 0 ? 'Substituir lista' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {avisosTeste && (
        <CartaoAvisosPV teste avisos={avisosTeste} onFechar={() => setAvisosTeste(null)} />
      )}

      {janelaAcessos && ehAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-6 pb-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-zinc-900 dark:text-white">Acesso à Lista PV</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Libere para todos os usuários de um CNPJ ou só para os nomes que você digitar (o nome usado no login). Cada CNPJ tem a sua própria lista.
                  </p>
                </div>
                <button onClick={() => setJanelaAcessos(false)} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" title="Fechar">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  value={buscaAcessos}
                  onChange={(e) => setBuscaAcessos(e.target.value)}
                  placeholder="Buscar loja ou CNPJ"
                  className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <ul className="px-6 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 border-t border-zinc-100 dark:border-zinc-800">
              {lojasOrdenadas
                .filter((l) => {
                  const q = buscaAcessos.trim().toLowerCase();
                  if (!q) return true;
                  const qd = q.replace(/\D/g, '');
                  return (l.bandeira || '').toLowerCase().includes(q) || (!!qd && l.cnpj.replace(/\D/g, '').includes(qd));
                })
                .map((l) => (
                  <LinhaAcessoPV key={l.cnpj} loja={l} aoMudar={(modo, usuarios) => setListaPVAcesso(l.cnpj, modo, usuarios)} />
                ))}
              {!lojasOrdenadas.length && <li className="py-8 text-center text-sm text-zinc-500">Nenhuma loja cadastrada.</li>}
            </ul>
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button onClick={() => setJanelaAcessos(false)} className="px-4 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700">
                Pronto
              </button>
            </div>
          </div>
        </div>
      )}

      {editandoDescontos && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-md w-full space-y-4 border border-zinc-200 dark:border-zinc-800">
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-white">Descontos por período</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Quanto cada período de vencimento ganha de desconto. O valor em reais sai do preço de oferta. Deixe em branco pra usar o % da planilha.
              </p>
              <p className="text-xs text-zinc-400 mt-1">Dois cliques no nome do período pra mudar o intervalo. Mudar o início de um ajusta o fim do anterior.</p>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border-y border-zinc-100 dark:border-zinc-800">
              {ORDEM_FAIXAS.map((f) => (
                <div key={f} className={cn('flex items-center justify-between gap-3 py-2.5 pl-3 border-l-4', BORDA_STATUS[f])}>
                  {f !== 'vencido' && faixaEmEdicao === f && editandoPeriodos ? (
                    <EditorPeriodo
                      faixa={f}
                      periodos={editandoPeriodos}
                      aoAplicar={(novo) => { setEditandoPeriodos(novo); setFaixaEmEdicao(null); }}
                      aoCancelar={() => setFaixaEmEdicao(null)}
                    />
                  ) : (
                    <span
                      onDoubleClick={() => { if (f !== 'vencido') setFaixaEmEdicao(f); }}
                      className={cn(
                        'text-sm font-semibold text-zinc-800 dark:text-zinc-200 select-none px-1.5 py-1 -mx-1.5 rounded-md border border-transparent',
                        f !== 'vencido' && 'cursor-pointer hover:border-zinc-200 dark:hover:border-zinc-700',
                      )}
                      title={f !== 'vencido' ? 'Dois cliques para mudar o período' : undefined}
                    >
                      {rotuloFaixa(f, editandoPeriodos || periodos)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 focus-within:border-blue-500">
                    <input
                      value={editandoDescontos[f]}
                      onChange={(e) => setEditandoDescontos({ ...editandoDescontos, [f]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') salvarDescontos(); }}
                      inputMode="decimal"
                      placeholder="—"
                      className="w-14 bg-transparent text-right text-sm text-zinc-900 dark:text-zinc-100 outline-none"
                    />
                    <span className="text-sm text-zinc-400">%</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setEditandoDescontos(null); setFaixaEmEdicao(null); }} className="px-4 py-2.5 rounded-xl font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Cancelar
              </button>
              <button onClick={salvarDescontos} className="px-4 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmarLimpar && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-sm w-full space-y-4 border border-zinc-200 dark:border-zinc-800">
            <h2 className="text-lg font-black text-zinc-900 dark:text-white">Limpar a Lista PV?</h2>
            <p className="text-sm text-zinc-500">Os {dados.itens.length} produto(s) serão removidos. Exporte antes se quiser guardar.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmarLimpar(false)} className="px-4 py-2.5 rounded-xl font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Cancelar
              </button>
              <button
                onClick={() => { setConfirmarLimpar(false); gravar({ ...dados, itens: [] }, 'Lista limpa.'); }}
                className="px-4 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
