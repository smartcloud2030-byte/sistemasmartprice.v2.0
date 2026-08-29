import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Sparkles, Download, Palette, Grid3x3, ShoppingCart, Trash2, ChevronUp, ChevronDown, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, Product } from '../../store';
import { getProxyUrl, cn } from '../../lib/utils';
import ProductSelector from '../ProductSelector';
import {
  Produto, TemaEncarte, LayoutGrade, TEMA_PADRAO, LAYOUT_PADRAO, GRADES_PRESET,
  capacidade, paginar, carregarImagens, desenharPagina, LARGURA, ALTURA,
} from './gerador';

type Painel = 'tema' | 'grade' | 'produtos';

const PAINEIS: { id: Painel; label: string; icon: React.ElementType }[] = [
  { id: 'tema', label: 'Tema', icon: Palette },
  { id: 'grade', label: 'Grade', icon: Grid3x3 },
  { id: 'produtos', label: 'Produtos', icon: ShoppingCart },
];

function parsePreco(v: string): number {
  const n = parseFloat((v || '').replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

interface EncarteDigitalProps {
  /** estado inicial — usado só pelo preview isolado */
  produtosIniciais?: Produto[];
  temaInicial?: Partial<TemaEncarte>;
  layoutInicial?: LayoutGrade;
}

export default function EncarteDigital({ produtosIniciais, temaInicial, layoutInicial }: EncarteDigitalProps = {}) {
  const { setView } = useStore();
  const [painel, setPainel] = useState<Painel>('produtos');
  const [tema, setTema] = useState<TemaEncarte>({ ...TEMA_PADRAO, ...temaInicial });
  const [layout, setLayout] = useState<LayoutGrade>(layoutInicial ?? LAYOUT_PADRAO);
  const [produtos, setProdutos] = useState<Produto[]>(produtosIniciais ?? []);
  const [pagina, setPagina] = useState(0);
  const [baixando, setBaixando] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paginas = useMemo(() => paginar(produtos, capacidade(layout)), [produtos, layout]);
  const paginaAtiva = Math.min(pagina, paginas.length - 1);

  const setT = (patch: Partial<TemaEncarte>) => setTema((t) => ({ ...t, ...patch }));

  const adicionarProduto = (p: Product) => {
    setProdutos((prev) =>
      prev.some((x) => x.nome === p.name)
        ? prev
        : [
            ...prev,
            {
              nome: p.name,
              preco: parsePreco(p.price),
              imagem: p.image ? getProxyUrl(p.thumb_image || p.image, { thumbnail: true }) : null,
              precoDe: null,
              unidade: '',
              destaque: false,
            },
          ],
    );
  };

  const atualizarProduto = (i: number, patch: Partial<Produto>) =>
    setProdutos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const removerProduto = (i: number) => setProdutos((prev) => prev.filter((_, idx) => idx !== i));
  const moverProduto = (i: number, dir: -1 | 1) =>
    setProdutos((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const c = [...prev];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  // redesenha o canvas quando qualquer coisa muda
  useEffect(() => {
    let cancelado = false;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const lista = paginas[paginaAtiva] ?? [];
    carregarImagens(lista.map((p) => p.imagem)).then((imagens) => {
      if (cancelado) return;
      desenharPagina(ctx, lista, tema, layout, {
        numPagina: paginaAtiva + 1,
        totalPaginas: paginas.length,
        imagens,
      });
    });
    return () => {
      cancelado = true;
    };
  }, [tema, layout, paginas, paginaAtiva]);

  const baixar = async (todas: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || baixando) return;
    setBaixando(true);
    try {
      const alvos = todas ? paginas.map((_, i) => i) : [paginaAtiva];
      for (const i of alvos) {
        const lista = paginas[i] ?? [];
        const imagens = await carregarImagens(lista.map((p) => p.imagem));
        desenharPagina(ctx, lista, tema, layout, { numPagina: i + 1, totalPaginas: paginas.length, imagens });
        const link = document.createElement('a');
        link.download = `encarte_pagina_${i + 1}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch {
      toast.error('Não foi possível gerar a imagem. Verifique as fotos dos produtos.');
    } finally {
      setBaixando(false);
      setPagina(paginaAtiva); // força o redraw da página ativa
    }
  };

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <header className="h-16 flex-shrink-0 border-b border-zinc-800 bg-zinc-900 flex items-center gap-4 px-6">
        <button onClick={() => setView('editor')} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h1 className="text-lg font-black tracking-tighter uppercase">Encarte Digital</h1>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">1080 × 1350</span>

        <div className="ml-auto flex items-center gap-2">
          {paginas.length > 1 && (
            <button
              onClick={() => baixar(true)}
              disabled={baixando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-black uppercase hover:bg-zinc-800 transition-colors disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" />
              Todas ({paginas.length})
            </button>
          )}
          <button
            onClick={() => baixar(false)}
            disabled={baixando}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase hover:bg-emerald-500 transition-colors disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            {baixando ? 'Gerando...' : 'Download'}
          </button>
        </div>
      </header>

      <div className="flex-grow flex min-h-0">
        <nav className="w-20 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-4 gap-1">
          {PAINEIS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPainel(id)}
              className={cn(
                'w-16 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-colors',
                painel === id
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                  : 'text-zinc-400 border border-transparent hover:bg-zinc-800 hover:text-zinc-200',
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </nav>

        <aside className="w-80 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto p-4 space-y-5">
          {painel === 'tema' && (
            <>
              <Titulo icon={Palette} nome="Tema" sub="Cores e textos do encarte" />
              <Campo label="Título">
                <input value={tema.titulo} onChange={(e) => setT({ titulo: e.target.value })} className={inp} />
              </Campo>
              <Campo label="Subtítulo">
                <input value={tema.subtitulo} onChange={(e) => setT({ subtitulo: e.target.value })} className={inp} />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <CampoCor label="Fundo" valor={tema.corFundo} onChange={(v) => setT({ corFundo: v })} />
                <CampoCor label="Cabeçalho" valor={tema.corTitulo} onChange={(v) => setT({ corTitulo: v })} />
                <CampoCor label="Card do produto" valor={tema.corCaixaProduto} onChange={(v) => setT({ corCaixaProduto: v })} />
                <CampoCor label="Nome do produto" valor={tema.corNomeProduto} onChange={(v) => setT({ corNomeProduto: v })} />
                <CampoCor label="Etiqueta" valor={tema.corTag} onChange={(v) => setT({ corTag: v })} />
                <CampoCor label="Texto da etiqueta" valor={tema.corTextoTag} onChange={(v) => setT({ corTextoTag: v })} />
              </div>
              <Campo label="Empresa (rodapé)">
                <input value={tema.nomeEmpresa} onChange={(e) => setT({ nomeEmpresa: e.target.value })} className={inp} />
              </Campo>
              <Campo label="Slogan (rodapé)">
                <input value={tema.slogan} onChange={(e) => setT({ slogan: e.target.value })} className={inp} />
              </Campo>
            </>
          )}

          {painel === 'grade' && (
            <>
              <Titulo icon={Grid3x3} nome="Grade" sub="Produtos por página" />
              <div className="grid grid-cols-3 gap-2">
                {GRADES_PRESET.map((g) => {
                  const ativo = g.colunas === layout.colunas && g.linhas === layout.linhas;
                  return (
                    <button
                      key={g.label}
                      onClick={() => { setLayout({ colunas: g.colunas, linhas: g.linhas }); setPagina(0); }}
                      className={cn(
                        'rounded-lg border py-3 text-xs font-bold transition-colors',
                        ativo ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500',
                      )}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-zinc-500">
                {capacidade(layout)} produtos por página · {paginas.length} {paginas.length === 1 ? 'página' : 'páginas'} no total
              </p>
            </>
          )}

          {painel === 'produtos' && (
            <>
              <Titulo icon={ShoppingCart} nome="Produtos" sub="Busque e ajuste cada item" />
              <ProductSelector onSelect={adicionarProduto} />
              {produtos.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-zinc-800">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    No encarte ({produtos.length})
                  </h3>
                  {produtos.map((p, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-2.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <button onClick={() => moverProduto(i, -1)} className="text-zinc-500 hover:text-zinc-200"><ChevronUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => moverProduto(i, 1)} className="text-zinc-500 hover:text-zinc-200"><ChevronDown className="w-3.5 h-3.5" /></button>
                        </div>
                        <input
                          value={p.nome}
                          onChange={(e) => atualizarProduto(i, { nome: e.target.value })}
                          className="flex-grow bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          onClick={() => atualizarProduto(i, { destaque: !p.destaque })}
                          title="Destaque"
                          className={cn('flex-shrink-0', p.destaque ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400')}
                        >
                          <Star className="w-4 h-4" fill={p.destaque ? 'currentColor' : 'none'} />
                        </button>
                        <button onClick={() => removerProduto(i)} className="text-zinc-500 hover:text-red-400 flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <NumInput label="De" valor={p.precoDe ?? undefined} onChange={(v) => atualizarProduto(i, { precoDe: v ?? null })} />
                        <NumInput label="Preço" valor={p.preco} onChange={(v) => atualizarProduto(i, { preco: v ?? 0 })} />
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Un.</span>
                          <input
                            value={p.unidade}
                            onChange={(e) => atualizarProduto(i, { unidade: e.target.value })}
                            placeholder="kg"
                            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>

        <div className="flex-grow flex flex-col items-center justify-center bg-zinc-950 p-8 overflow-auto gap-3">
          <canvas
            ref={canvasRef}
            width={LARGURA}
            height={ALTURA}
            className="rounded-lg shadow-2xl bg-white"
            style={{ width: 'auto', height: 'min(78vh, 900px)', maxWidth: '100%' }}
          />
          {paginas.length > 1 && (
            <div className="flex items-center gap-1.5">
              {paginas.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPagina(i)}
                  className={cn(
                    'w-7 h-7 rounded-md text-[11px] font-bold transition-colors',
                    i === paginaAtiva ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inp = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500';

function Titulo({ icon: Icon, nome, sub }: { icon: React.ElementType; nome: string; sub: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-emerald-500" />
      <div>
        <h2 className="text-sm font-black uppercase tracking-widest">{nome}</h2>
        <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

function CampoCor({ label, valor, onChange }: { label: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-zinc-700 text-[11px] font-semibold text-zinc-300 hover:border-zinc-500 cursor-pointer">
      <span className="w-4 h-4 rounded border border-zinc-600 flex-shrink-0" style={{ backgroundColor: valor }} />
      <span className="truncate">{label}</span>
      <input type="color" value={valor} onChange={(e) => onChange(e.target.value)} className="sr-only" />
    </label>
  );
}

function NumInput({ label, valor, onChange }: { label: string; valor: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        inputMode="decimal"
        value={valor ?? ''}
        onChange={(e) => {
          const t = e.target.value.replace(',', '.').trim();
          onChange(t === '' ? undefined : Number(t));
        }}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </label>
  );
}
