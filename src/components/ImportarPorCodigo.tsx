import React, { useEffect, useRef, useState } from 'react';
import { Barcode, Loader2, Plus, Search, Trash2, ImageOff, RefreshCw, Upload, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

/**
 * Importar produtos por código de barras (só admin): cola/sobe até 150
 * códigos, o sistema procura nome e foto na internet e mostra uma tela de
 * conferência; só depois de aprovado é que cadastra na base.
 * A lista fica salva no navegador (F5 não perde o trabalho).
 */

export const MAX_CODIGOS = 150;
const CHAVE = 'sp-importar-por-codigo-v1';

type Status = 'fila' | 'buscando' | 'achou' | 'nao-achou' | 'ja-existe' | 'erro';

interface Foto { url: string; origem: string }

interface Linha {
  codigo: string;
  status: Status;
  nome: string;
  descricao: string;
  categoria: string;
  fonte: string;
  marca: string | null;
  fotos: Foto[];
  /** índice em `fotos`; -1 = sem foto */
  foto: number;
  sugestoesNome: string[];
  incluir: boolean;
  jaExisteNome?: string;
  /** foto escolhida do computador (só na sessão; não vai pro rascunho) */
  arquivo?: File;
  cadastrado?: boolean;
}

/** Tira os códigos (8 a 14 dígitos) de qualquer texto: um por linha, vírgula, planilha... */
export function extrairCodigos(texto: string): string[] {
  const achados = texto.match(/\d{8,14}/g) || [];
  return [...new Set(achados)];
}

interface Props {
  categorias: string[];
  enviarFoto: (arquivo: File, categoria: string, nome: string, tirarFundo: boolean) => Promise<{ url: string; thumbUrl: string }>;
  onFechar: () => void;
  onCadastrados: () => void;
}

const json = async (r: Response) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `HTTP ${r.status}`), { status: r.status });
  return d;
};

export default function ImportarPorCodigo({ categorias, enviarFoto, onFechar, onCadastrados }: Props) {
  const [texto, setTexto] = useState('');
  const [categoriaPadrao, setCategoriaPadrao] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      return Array.isArray(salvo) ? salvo.map((l: Linha) => (l.status === 'buscando' ? { ...l, status: 'fila' } : l)) : [];
    } catch {
      return [];
    }
  });
  const [buscando, setBuscando] = useState(false);
  const [cadastrando, setCadastrando] = useState<{ feitos: number; total: number } | null>(null);
  const [tirarFundo, setTirarFundo] = useState(true);
  const parar = useRef(false);

  // rascunho à prova de F5 (sem os arquivos do computador, que não cabem lá)
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(linhas.filter((l) => !l.cadastrado).map(({ arquivo, ...l }) => {
        // foto do computador é um link temporário (blob:) que morre no F5
        const fotos = l.fotos.filter((f) => !f.url.startsWith('blob:'));
        const escolhida = l.foto >= 0 ? l.fotos[l.foto] : null;
        const foto = escolhida ? fotos.indexOf(escolhida) : -1;
        return { ...l, fotos, foto: foto < 0 && fotos.length && escolhida ? 0 : foto };
      })));
    } catch {}
  }, [linhas]);

  const mudar = (codigo: string, p: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l) => (l.codigo === codigo ? { ...l, ...p } : l)));

  const lerArquivo = async (f: File) => {
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await f.arrayBuffer());
        const partes = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n]));
        setTexto((t) => (t ? t + '\n' : '') + partes.join('\n'));
      } else {
        const t2 = await f.text();
        setTexto((t) => (t ? t + '\n' : '') + t2);
      }
    } catch {
      toast.error('Não consegui ler esse arquivo. Tente colar os códigos.');
    }
  };

  const adicionar = () => {
    const novos = extrairCodigos(texto).filter((c) => !linhas.some((l) => l.codigo === c));
    if (!novos.length) {
      toast.error('Nenhum código novo. Os códigos têm que ter de 8 a 14 números.');
      return;
    }
    const cabem = MAX_CODIGOS - linhas.length;
    if (cabem <= 0) {
      toast.error(`A lista já tem ${MAX_CODIGOS} códigos. Cadastre ou limpe antes de pôr mais.`);
      return;
    }
    if (novos.length > cabem) toast.warning(`Só cabem ${MAX_CODIGOS} por vez: entraram ${cabem}, ficaram ${novos.length - cabem} de fora.`);
    const entram = novos.slice(0, cabem).map<Linha>((codigo) => ({
      codigo, status: 'fila', nome: '', descricao: '', categoria: categoriaPadrao, fonte: '', marca: null,
      fotos: [], foto: -1, sugestoesNome: [], incluir: true,
    }));
    setLinhas((ls) => [...ls, ...entram]);
    setTexto('');
  };

  const buscarTodos = async () => {
    const fila = linhas.filter((l) => l.status === 'fila' || l.status === 'erro');
    if (!fila.length) return;
    setBuscando(true);
    parar.current = false;
    try {
      // 1º: os que já estão cadastrados não são buscados (não duplica)
      const { existentes } = await json(
        await fetch('/api/produtos/codigos-existentes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigos: fila.map((l) => l.codigo) }),
        }),
      );
      setLinhas((ls) => ls.map((l) => (existentes[l.codigo]
        ? { ...l, status: 'ja-existe', incluir: false, jaExisteNome: existentes[l.codigo] }
        : l)));
      const buscar = fila.filter((l) => !existentes[l.codigo]);

      let avisouLimite = false;
      let i = 0;
      const trabalhador = async () => {
        while (i < buscar.length && !parar.current) {
          const l = buscar[i++];
          mudar(l.codigo, { status: 'buscando' });
          try {
            const d = await json(await fetch(`/api/produtos/importar-codigo/${l.codigo}`));
            if (d.googleLimite && !avisouLimite) {
              avisouLimite = true;
              toast.warning('Acabou a cota diária de buscas no Google. Os que faltarem podem ser buscados amanhã.');
            }
            mudar(l.codigo, {
              status: d.encontrado ? 'achou' : d.googleLimite ? 'erro' : 'nao-achou',
              nome: d.nome || '',
              fonte: d.fonte || '',
              marca: d.marca,
              fotos: d.fotos || [],
              foto: (d.fotos || []).length ? 0 : -1,
              sugestoesNome: d.sugestoesNome || [],
              incluir: !!d.encontrado,
            });
          } catch {
            mudar(l.codigo, { status: 'erro', incluir: false });
          }
        }
      };
      await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    } catch (e: any) {
      toast.error(e.message || 'Falha na busca');
    } finally {
      setBuscando(false);
    }
  };

  const outrasFotos = async (l: Linha) => {
    const q = l.nome.trim() || l.codigo;
    try {
      const d = await json(await fetch(`/api/produtos/importar-fotos?q=${encodeURIComponent(q)}`));
      const jaTem = new Set(l.fotos.map((f) => f.url));
      const novas = (d.fotos as Foto[]).filter((f) => !jaTem.has(f.url));
      if (!novas.length) toast.info('Não achei outras fotos.');
      mudar(l.codigo, { fotos: [...l.fotos, ...novas], foto: l.foto < 0 && novas.length ? l.fotos.length : l.foto });
    } catch (e: any) {
      toast.error(e.message || 'Falha ao buscar fotos');
    }
  };

  const fotoDoComputador = (l: Linha, f: File) => {
    const url = URL.createObjectURL(f);
    mudar(l.codigo, { arquivo: f, fotos: [{ url, origem: 'Seu computador' }, ...l.fotos.filter((x) => x.origem !== 'Seu computador')], foto: 0 });
  };

  const prontos = linhas.filter((l) => l.incluir && !l.cadastrado && l.nome.trim() && (l.status === 'achou' || l.status === 'nao-achou' || l.status === 'erro'));
  const semCategoria = prontos.filter((l) => !l.categoria);

  const cadastrar = async () => {
    if (!prontos.length) return;
    if (semCategoria.length) {
      toast.error(`${semCategoria.length} produto(s) sem categoria. Escolha a categoria antes de cadastrar.`);
      return;
    }
    setCadastrando({ feitos: 0, total: prontos.length });
    const feitos: { linha: Linha; image: string | null; thumb: string | null }[] = [];
    let falhasFoto = 0;
    let i = 0;
    let n = 0;
    const trabalhador = async () => {
      while (i < prontos.length) {
        const l = prontos[i++];
        let image: string | null = null;
        let thumb: string | null = null;
        const foto = l.foto >= 0 ? l.fotos[l.foto] : null;
        if (foto) {
          try {
            let arq = l.arquivo && foto.origem === 'Seu computador' ? l.arquivo : null;
            if (!arq) {
              const r = await fetch(foto.url);
              if (!r.ok) throw new Error('foto');
              const blob = await r.blob();
              arq = new File([blob], `${l.codigo}.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`, { type: blob.type || 'image/jpeg' });
            }
            const up = await enviarFoto(arq, l.categoria, l.nome.trim(), tirarFundo);
            image = up.url || null;
            thumb = up.thumbUrl || null;
          } catch {
            falhasFoto++;
          }
        }
        feitos.push({ linha: l, image, thumb });
        setCadastrando({ feitos: ++n, total: prontos.length });
      }
    };
    try {
      await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
      await json(
        await fetch('/api/products/bulk', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(feitos.map(({ linha, image, thumb }) => ({
            name: linha.nome.trim().toUpperCase(),
            description: linha.descricao.trim(),
            price: 'R$ 0,00',
            image,
            thumb_image: thumb,
            category: linha.categoria,
            barcode: linha.codigo,
          }))),
        }),
      );
      const ok = new Set(feitos.map((f) => f.linha.codigo));
      setLinhas((ls) => ls.filter((l) => !ok.has(l.codigo)));
      toast.success(`${feitos.length} produto(s) cadastrado(s).`, {
        description: falhasFoto ? `${falhasFoto} ficaram sem foto (não consegui baixar). Dá pra pôr a foto pelo lápis.` : undefined,
      });
      onCadastrados();
    } catch (e: any) {
      toast.error('Falha ao cadastrar: ' + (e.message || 'tente de novo'));
    } finally {
      setCadastrando(null);
    }
  };

  const conta = (s: Status) => linhas.filter((l) => l.status === s).length;
  const naFila = conta('fila') + conta('erro');
  const inputCls = 'w-full px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs text-black dark:text-white';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-6xl h-[92vh] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2 text-black dark:text-white">
              <Barcode className="w-5 h-5 text-blue-600" /> Importar por código de barras
            </h3>
            <p className="text-xs text-zinc-500">
              Cole os códigos, o sistema procura nome e foto na internet, você confere e cadastra. Até {MAX_CODIGOS} por vez.
            </p>
          </div>
          <button onClick={onFechar} className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-black dark:text-white" title="Fechar (a lista fica salva)">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Entrada dos códigos */}
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 grid md:grid-cols-[1fr_auto] gap-3 bg-zinc-50 dark:bg-zinc-900/60">
          <textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'Cole os códigos aqui (um por linha, ou copiados da planilha)\n7891058017392\n7896714218267'}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded font-mono text-xs text-black dark:text-white"
          />
          <div className="flex flex-col gap-2 min-w-[220px]">
            <select value={categoriaPadrao} onChange={(e) => setCategoriaPadrao(e.target.value)} className={inputCls}>
              <option value="">Categoria (pode mudar depois)</option>
              {categorias.map((c) => <option key={c} value={c}>{c.replace(/-/g, ' ').toUpperCase()}</option>)}
            </select>
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer text-center px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <Upload className="w-3.5 h-3.5 inline mr-1" />Planilha
                <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); e.target.value = ''; }} />
              </label>
              <button onClick={adicionar} disabled={!texto.trim()} className="flex-1 px-3 py-1.5 bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-40">
                <Plus className="w-3.5 h-3.5 inline mr-1" />Pôr na lista
              </button>
            </div>
          </div>
        </div>

        {/* Barra de ações */}
        <div className="px-5 py-2 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-zinc-600 dark:text-zinc-300 font-semibold">{linhas.length}/{MAX_CODIGOS} na lista</span>
          <span className="text-emerald-600">{conta('achou')} achados</span>
          <span className="text-amber-600">{conta('nao-achou')} não achados</span>
          <span className="text-zinc-500">{conta('ja-existe')} já cadastrados</span>
          <div className="flex-1" />
          {buscando ? (
            <button onClick={() => { parar.current = true; }} className="px-3 py-1.5 border border-zinc-300 rounded font-semibold text-zinc-700 dark:text-zinc-200">Parar</button>
          ) : (
            <button onClick={buscarTodos} disabled={!naFila} className="px-3 py-1.5 bg-blue-600 text-white rounded font-semibold disabled:opacity-40 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" /> Buscar na internet{naFila ? ` (${naFila})` : ''}
            </button>
          )}
          {buscando && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
          <button
            onClick={() => { if (window.confirm('Limpar a lista toda?')) setLinhas([]); }}
            disabled={!linhas.length || buscando || !!cadastrando}
            className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded font-semibold text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
          >
            Limpar lista
          </button>
        </div>

        {/* Conferência */}
        <div className="flex-1 overflow-y-auto">
          {!linhas.length && (
            <p className="text-center text-sm text-zinc-500 py-16">Cole os códigos acima e clique em <b>Pôr na lista</b>.</p>
          )}
          {linhas.map((l) => {
            const foto = l.foto >= 0 ? l.fotos[l.foto] : null;
            const apagado = l.status === 'ja-existe' || !l.incluir;
            return (
              <div key={l.codigo} className={cn('px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex gap-3 items-start', apagado && 'opacity-55')}>
                <input
                  type="checkbox"
                  checked={l.incluir}
                  disabled={l.status === 'ja-existe' || l.status === 'fila' || l.status === 'buscando'}
                  onChange={(e) => mudar(l.codigo, { incluir: e.target.checked })}
                  className="mt-8"
                  title="Cadastrar este produto"
                />
                <div className="w-24 h-24 shrink-0 border border-zinc-200 dark:border-zinc-700 rounded bg-white flex items-center justify-center overflow-hidden">
                  {l.status === 'buscando' ? <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                    : foto ? <img src={foto.url} alt="" className="max-w-full max-h-full object-contain" />
                    : <ImageOff className="w-6 h-6 text-zinc-300" />}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-mono text-zinc-500">{l.codigo}</span>
                    {l.status === 'fila' && <span className="text-zinc-500">na fila</span>}
                    {l.status === 'buscando' && <span className="text-blue-600">procurando...</span>}
                    {l.status === 'achou' && <span className="text-emerald-600 font-semibold">achado · {l.fonte}</span>}
                    {l.status === 'nao-achou' && <span className="text-amber-600 font-semibold">não achei, preencha o nome</span>}
                    {l.status === 'erro' && <span className="text-red-600 font-semibold">falhou (clique em Buscar de novo)</span>}
                    {l.status === 'ja-existe' && <span className="text-zinc-500 font-semibold">já cadastrado: {l.jaExisteNome}</span>}
                    {l.marca && <span className="text-zinc-400">marca: {l.marca}</span>}
                  </div>
                  {l.status !== 'ja-existe' && l.status !== 'fila' && l.status !== 'buscando' && (
                    <>
                      <div className="grid md:grid-cols-[2fr_1.3fr_1fr] gap-2">
                        <input className={inputCls} value={l.nome} placeholder="Nome do produto" onChange={(e) => mudar(l.codigo, { nome: e.target.value.toUpperCase(), incluir: l.incluir || !!e.target.value.trim() })} />
                        <input className={inputCls} value={l.descricao} placeholder="Descrição (ex.: VÁRIAS FRAGRÂNCIAS)" onChange={(e) => mudar(l.codigo, { descricao: e.target.value.toUpperCase() })} />
                        <select className={cn(inputCls, l.incluir && !l.categoria && 'border-red-400')} value={l.categoria} onChange={(e) => mudar(l.codigo, { categoria: e.target.value })}>
                          <option value="">Categoria...</option>
                          {categorias.map((c) => <option key={c} value={c}>{c.replace(/-/g, ' ').toUpperCase()}</option>)}
                        </select>
                      </div>
                      {l.sugestoesNome.length > 0 && (
                        <div className="flex flex-wrap gap-1 text-[11px] items-center">
                          <span className="text-zinc-400">outros nomes achados:</span>
                          {l.sugestoesNome.map((s) => (
                            <button key={s} onClick={() => mudar(l.codigo, { nome: s, incluir: true })} className="px-1.5 py-0.5 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">{s}</button>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {l.fotos.map((f, k) => (
                          <button
                            key={f.url}
                            onClick={() => mudar(l.codigo, { foto: k })}
                            title={f.origem}
                            className={cn('w-11 h-11 border rounded bg-white overflow-hidden flex items-center justify-center', k === l.foto ? 'border-blue-600 ring-2 ring-blue-600/30' : 'border-zinc-200 dark:border-zinc-700')}
                          >
                            <img src={f.url} alt="" className="max-w-full max-h-full object-contain" loading="lazy" />
                          </button>
                        ))}
                        {l.foto >= 0 && (
                          <button onClick={() => mudar(l.codigo, { foto: -1 })} className="text-[11px] text-zinc-500 hover:text-red-600 px-1" title="Cadastrar sem foto">sem foto</button>
                        )}
                        <button onClick={() => outrasFotos(l)} className="text-[11px] px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> Outras fotos
                        </button>
                        <label className="text-[11px] px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-1">
                          <Upload className="w-3 h-3" /> Do computador
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) fotoDoComputador(l, f); e.target.value = ''; }} />
                        </label>
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => setLinhas((ls) => ls.filter((x) => x.codigo !== l.codigo))} className="p-1.5 text-zinc-400 hover:text-red-600" title="Tirar da lista">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" checked={tirarFundo} onChange={(e) => setTirarFundo(e.target.checked)} />
            Tirar o fundo das fotos
          </label>
          <div className="flex-1" />
          {cadastrando && (
            <span className="text-xs text-blue-600 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando fotos {cadastrando.feitos}/{cadastrando.total}...
            </span>
          )}
          <button
            onClick={cadastrar}
            disabled={!prontos.length || !!cadastrando || buscando}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-sm disabled:opacity-40 flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Aprovar e cadastrar ({prontos.length})
          </button>
        </div>
      </div>
    </div>
  );
}
