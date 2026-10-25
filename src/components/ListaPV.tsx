import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Download, FileSpreadsheet, Search, Trash2, CalendarClock, Loader2, X, ArrowUpDown, Columns3, Check,
} from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import {
  COLUNAS_OPCIONAIS_PV, COLUNAS_PV_PADRAO, ROTULO_STATUS, SETTINGS_KEY_PV, baixarModeloPV, dataBR, diasParaVencer,
  exportarPV, importarArquivoPV, moedaBR, percentualBR, statusPV,
  type ColunaOpcionalPV, type ColunasPV, type ItemPV, type StatusPV,
} from '../lib/listaPV';

// Lista PV — produtos próximos (ou não) do vencimento. Só admin por enquanto.
// A lista fica no servidor em settings.lista_pv ({ itens, colunas }),
// chave que loja não lê nem grava (ver settingParaLoja em api.ts).

interface DadosPV {
  itens: ItemPV[];
  /** Colunas opcionais ligadas (vale pra tela e exportação, igual pra todos os admins). */
  colunas?: Partial<ColunasPV>;
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

async function carregarPV(): Promise<DadosPV> {
  const res = await fetch(`/api/settings/${SETTINGS_KEY_PV}`);
  if (!res.ok) throw new Error(`Falha ao carregar a lista (${res.status})`);
  const json = await res.json();
  const v = json?.value;
  return {
    itens: Array.isArray(v?.itens) ? v.itens : [],
    colunas: v?.colunas && typeof v.colunas === 'object' ? v.colunas : undefined,
  };
}

async function salvarPV(dados: DadosPV) {
  const res = await fetch(`/api/settings/${SETTINGS_KEY_PV}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: dados }),
  });
  if (!res.ok) throw new Error(`Falha ao salvar a lista (${res.status})`);
}

export default function ListaPV() {
  const { setView } = useStore();
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
  const inputRef = useRef<HTMLInputElement>(null);
  const colunas: ColunasPV = { ...COLUNAS_PV_PADRAO, ...dados.colunas };
  const alternarColuna = (chave: ColunaOpcionalPV) => gravar({ ...dados, colunas: { ...colunas, [chave]: !colunas[chave] } });

  useEffect(() => {
    carregarPV()
      .then(setDados)
      .catch((e) => toast.error(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const gravar = async (novo: DadosPV, msg?: string) => {
    const anterior = dados;
    setDados(novo);
    try {
      await salvarPV(novo);
      if (msg) toast.success(msg);
    } catch (e: any) {
      setDados(anterior);
      toast.error(e.message || 'Falha ao salvar a lista.');
    }
  };

  const comStatus = useMemo(
    () =>
      dados.itens
        .map((i) => {
          const dias = diasParaVencer(i.vencimento);
          return { ...i, dias, status: statusPV(dias) };
        })
        .sort((a, b) => (maisProximoPrimeiro ? a.dias - b.dias : b.dias - a.dias) || a.produto.localeCompare(b.produto)),
    [dados, maisProximoPrimeiro],
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
    exportarPV(visiveis, `lista-pv${sufixo}-${new Date().toISOString().slice(0, 10)}.xlsx`, colunas);
  };

  const remover = (id: string) => gravar({ ...dados, itens: dados.itens.filter((i) => i.id !== id) });

  const CARTOES: { chave: Filtro; rotulo: string; valor: number; cor: string }[] = [
    { chave: 'todos', rotulo: 'Total', valor: comStatus.length, cor: 'text-zinc-900 dark:text-white' },
    { chave: 'vencido', rotulo: 'Vencidos', valor: contagem.vencido, cor: 'text-red-700 dark:text-red-500' },
    { chave: 'vermelho', rotulo: '1 a 30 dias', valor: contagem.vermelho, cor: 'text-red-500' },
    { chave: 'amareloEscuro', rotulo: '31 a 60 dias', valor: contagem.amareloEscuro, cor: 'text-amber-500' },
    { chave: 'amareloClaro', rotulo: '3 a 5 meses', valor: contagem.amareloClaro, cor: 'text-yellow-500 dark:text-yellow-300' },
    { chave: 'verde', rotulo: '6 meses ou mais', valor: contagem.verde, cor: 'text-emerald-600' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <button
              onClick={() => setView('dashboard')}
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
          <div className="grid grid-cols-3 gap-2 md:flex md:items-center">
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
                        {ROTULO_STATUS[i.status]}
                      </span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Vence {dataBR(i.vencimento)}</span>
                    </div>
                    <div className="text-xs text-zinc-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      {i.codigo && <span className="font-mono">{i.codigo}</span>}
                      {colunas.quantidade && i.quantidade != null && <span>Qtd {i.quantidade}</span>}
                      {colunas.lote && i.lote && <span>Lote {i.lote}</span>}
                      {colunas.loja && i.loja && <span>{i.loja}</span>}
                      {colunas.custo && i.custo != null && <span>Custo {moedaBR(i.custo)}</span>}
                      {colunas.desconto && i.desconto != null && <span>Desc. {percentualBR(i.desconto)}</span>}
                    </div>
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
                    {colunas.desconto && <th className="text-right px-4 py-3">Desconto</th>}
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
                          {ROTULO_STATUS[i.status]}
                        </span>
                      </td>
                      {colunas.quantidade && <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">{i.quantidade ?? '—'}</td>}
                      {colunas.lote && <td className="px-4 py-3 text-zinc-500">{i.lote || '—'}</td>}
                      {colunas.loja && <td className="px-4 py-3 text-zinc-500">{i.loja || '—'}</td>}
                      {colunas.custo && <td className="px-4 py-3 text-right whitespace-nowrap text-zinc-700 dark:text-zinc-300">{i.custo != null ? moedaBR(i.custo) : '—'}</td>}
                      {colunas.desconto && <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">{i.desconto != null ? percentualBR(i.desconto) : '—'}</td>}
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
