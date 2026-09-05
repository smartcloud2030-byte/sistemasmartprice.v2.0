import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Image, ShoppingCart, Shapes, Tag, Rows3, Building2, LayoutGrid } from 'lucide-react';
import { useStore, Product } from '../../store';
import { cn } from '../../lib/utils';
import TemasTab from './TemasTab';
import GaleriaImagensTab from './GaleriaImagensTab';
import ProdutosTab from './ProdutosTab';
import FormatosTab from './FormatosTab';
import ElementosTab from './ElementosTab';
import EncartesTab from './EncartesTab';
import ProdutoDetalhes from './ProdutoDetalhes';
import EncarteCanvas from './EncarteCanvas';
import { Formato, FORMATO_PADRAO, FormatoId, getFormato } from './formatos';
import {
  EncarteProduto,
  EstiloEncarte,
  GradeId,
  LadoEncarte,
  ElementoImagem,
  criarEncarteProduto,
  criarLado,
  clonarLado,
  criarDivisor,
  criarElementoImagem,
  organizarEmGrade,
} from './encarteProduto';
import {
  EncarteSalvo,
  carregarHistorico,
  salvarNoHistorico,
  apagarDoHistorico,
  carregarRascunho,
  salvarRascunho,
} from './persistencia';

type MenuItem = 'temas' | 'produtos' | 'elementos' | 'tags' | 'formatos' | 'marca' | 'encartes';
type Lado = 'frente' | 'verso';

const MENU_ITEMS: { id: MenuItem; label: string; icon: React.ElementType }[] = [
  { id: 'temas', label: 'Temas', icon: Image },
  { id: 'produtos', label: 'Produtos', icon: ShoppingCart },
  { id: 'elementos', label: 'Elementos', icon: Shapes },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'formatos', label: 'Formatos', icon: Rows3 },
  { id: 'marca', label: 'Marca', icon: Building2 },
  { id: 'encartes', label: 'Encartes', icon: LayoutGrid },
];

/** Reaplica a grade de um lado (usado quando produtos ou formato mudam). */
function regridLado(lado: LadoEncarte, formato: Formato): LadoEncarte {
  if (lado.grade === 'livre') return lado;
  const { produtos, escalaCard } = organizarEmGrade(lado.produtos, lado.grade, formato);
  return { ...lado, produtos, estilo: { ...lado.estilo, escalaCard } };
}

interface EncarteBuilderProps {
  /** estado inicial da frente — usado só pelo preview isolado */
  ladoInicial?: LadoEncarte;
  formatoInicial?: Formato;
  menuInicial?: MenuItem;
}

export default function EncarteBuilder({ ladoInicial, formatoInicial, menuInicial }: EncarteBuilderProps = {}) {
  const { setView, currentUser } = useStore();
  const cnpj = currentUser?.cnpj?.replace(/[^\d]/g, '');
  const [activeMenu, setActiveMenu] = useState<MenuItem>(menuInicial ?? 'temas');
  const [formato, setFormato] = useState<Formato>(formatoInicial ?? FORMATO_PADRAO);
  const [ladoFrente, setLadoFrente] = useState<LadoEncarte>(() => ladoInicial ?? criarLado());
  const [ladoVerso, setLadoVerso] = useState<LadoEncarte | null>(null);
  const [ladoAtivo, setLadoAtivo] = useState<Lado>('frente');
  const [produtoDetalhadoId, setProdutoDetalhadoId] = useState<string | number | null>(null);
  const [historico, setHistorico] = useState<EncarteSalvo[]>([]);
  const prontoParaAutoSalvar = useRef(false);

  // Ao montar: recupera o rascunho salvo (se tiver) pra não perder o
  // trabalho ao recarregar a página, e carrega o histórico de encartes.
  // Só roda no app real — o preview isolado (ladoInicial) fica de fora.
  useEffect(() => {
    if (ladoInicial || !cnpj) {
      prontoParaAutoSalvar.current = true;
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const [rascunho, hist] = await Promise.all([carregarRascunho(cnpj), carregarHistorico(cnpj)]);
        if (cancelado) return;
        if (rascunho) {
          setFormato(getFormato(rascunho.formato as FormatoId));
          setLadoFrente(rascunho.ladoFrente);
          setLadoVerso(rascunho.ladoVerso);
        }
        setHistorico(hist);
      } catch (err) {
        console.error('Erro ao carregar rascunho/histórico do encarte:', err);
      } finally {
        if (!cancelado) prontoParaAutoSalvar.current = true;
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save (debounced) do rascunho atual — roda a cada mudança de
  // conteúdo, só depois que o carregamento inicial já terminou.
  useEffect(() => {
    if (!prontoParaAutoSalvar.current || !cnpj) return;
    const t = setTimeout(() => {
      salvarRascunho(cnpj, { formato: formato.id, ladoFrente, ladoVerso }).catch((err) => {
        console.error('Erro ao salvar rascunho do encarte:', err);
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [cnpj, formato, ladoFrente, ladoVerso]);

  const activeLabel = MENU_ITEMS.find((m) => m.id === activeMenu)?.label;
  const lado = ladoAtivo === 'verso' && ladoVerso ? ladoVerso : ladoFrente;

  /** Aplica um patch (objeto ou função) ao lado ativo. */
  const atualizarLado = (patch: Partial<LadoEncarte> | ((l: LadoEncarte) => Partial<LadoEncarte>)) => {
    const aplicar = (l: LadoEncarte): LadoEncarte => ({ ...l, ...(typeof patch === 'function' ? patch(l) : patch) });
    if (ladoAtivo === 'verso') setLadoVerso((l) => (l ? aplicar(l) : l));
    else setLadoFrente(aplicar);
  };

  const adicionarProduto = (product: Product) => {
    atualizarLado((l) => {
      if (l.produtos.some((ep) => ep.product.id === product.id)) return {};
      const produtos = [...l.produtos, criarEncarteProduto(product, l.produtos.length)];
      if (l.grade === 'livre') return { produtos };
      const r = organizarEmGrade(produtos, l.grade, formato);
      return { produtos: r.produtos, estilo: { ...l.estilo, escalaCard: r.escalaCard } };
    });
  };

  const removerProduto = (id?: string | number) => {
    atualizarLado((l) => {
      const produtos = l.produtos.filter((ep) => ep.product.id !== id);
      if (l.grade === 'livre') return { produtos };
      const r = organizarEmGrade(produtos, l.grade, formato);
      return { produtos: r.produtos, estilo: { ...l.estilo, escalaCard: r.escalaCard } };
    });
    setProdutoDetalhadoId((atual) => (atual === id ? null : atual));
  };

  /** Move um produto do lado ativo pro outro (cria o verso vazio se ainda não existir). */
  const enviarProdutoParaOutroLado = (id: string | number | undefined) => {
    const produto = lado.produtos.find((ep) => ep.product.id === id);
    if (!produto) return;

    const inserirNoDestino = (destino: LadoEncarte): LadoEncarte => {
      if (destino.produtos.some((ep) => ep.product.id === id)) return destino;
      const produtos = [...destino.produtos, produto];
      if (destino.grade === 'livre') return { ...destino, produtos };
      const r = organizarEmGrade(produtos, destino.grade, formato);
      return { ...destino, produtos: r.produtos, estilo: { ...destino.estilo, escalaCard: r.escalaCard } };
    };

    if (ladoAtivo === 'frente') {
      setLadoVerso((v) => inserirNoDestino(v ?? criarLado()));
    } else {
      setLadoFrente((f) => inserirNoDestino(f));
    }
    removerProduto(id);
  };

  const atualizarProduto = (id: string | number | undefined, patch: Partial<EncarteProduto>) => {
    atualizarLado((l) => ({ produtos: l.produtos.map((ep) => (ep.product.id === id ? { ...ep, ...patch } : ep)) }));
  };

  const moverProduto = (id: string | number | undefined, xPct: number, yPct: number) =>
    atualizarProduto(id, { xPct, yPct });

  const atualizarEstilo = (patch: Partial<EstiloEncarte>) =>
    atualizarLado((l) => ({ estilo: { ...l.estilo, ...patch } }));

  const definirGrade = (grade: GradeId) => {
    atualizarLado((l) => {
      if (grade === 'livre') return { grade };
      const r = organizarEmGrade(l.produtos, grade, formato);
      return { grade, produtos: r.produtos, estilo: { ...l.estilo, escalaCard: r.escalaCard } };
    });
  };

  const trocarFormato = (f: Formato) => {
    setFormato(f);
    setLadoFrente((l) => regridLado(l, f));
    setLadoVerso((l) => (l ? regridLado(l, f) : l));
  };

  const adicionarVerso = () => {
    setLadoVerso(clonarLado(ladoFrente));
    setLadoAtivo('verso');
    setProdutoDetalhadoId(null);
  };

  const removerVerso = () => {
    setLadoVerso(null);
    setLadoAtivo('frente');
    setProdutoDetalhadoId(null);
  };

  const trocarLado = (l: Lado) => {
    setLadoAtivo(l);
    setProdutoDetalhadoId(null);
  };

  const adicionarDivisor = () => atualizarLado((l) => ({ divisores: [...l.divisores, criarDivisor()] }));

  const atualizarDivisor = (id: string, texto: string) =>
    atualizarLado((l) => ({ divisores: l.divisores.map((d) => (d.id === id ? { ...d, texto } : d)) }));

  const removerDivisor = (id: string) =>
    atualizarLado((l) => ({ divisores: l.divisores.filter((d) => d.id !== id) }));

  const moverDivisor = (id: string, yPct: number) =>
    atualizarLado((l) => ({ divisores: l.divisores.map((d) => (d.id === id ? { ...d, yPct } : d)) }));

  const atualizarRodape = (patch: Partial<{ ativo: boolean; texto: string }>) =>
    atualizarLado((l) => ({ rodape: { ...l.rodape, ...patch } }));

  /**
   * Sem "múltiplo": substitui a imagem já colocada por essa aba/categoria
   * (mesma posição e tamanho de antes) — só troca a figura. Com "múltiplo"
   * ativado, ou se ainda não tinha nenhuma dessa categoria, adiciona uma nova.
   */
  const adicionarImagem = (url: string, categoria: string, multiplo: boolean) => {
    atualizarLado((l) => {
      if (!multiplo) {
        const existente = l.imagens.find((im) => im.categoria === categoria);
        if (existente) {
          return { imagens: l.imagens.map((im) => (im.id === existente.id ? { ...im, url } : im)) };
        }
      }
      return { imagens: [...l.imagens, criarElementoImagem(url, categoria)] };
    });
  };

  const removerImagem = (id: string) =>
    atualizarLado((l) => ({ imagens: l.imagens.filter((im) => im.id !== id) }));

  /** Tira do encarte a(s) imagem(ns) dessa categoria com essa URL, sem apagar da galeria. */
  const removerImagemDoEncartePorUrl = (categoria: string, url: string) =>
    atualizarLado((l) => ({ imagens: l.imagens.filter((im) => !(im.categoria === categoria && im.url === url)) }));

  const atualizarImagem = (id: string, patch: Partial<ElementoImagem>) =>
    atualizarLado((l) => ({ imagens: l.imagens.map((im) => (im.id === id ? { ...im, ...patch } : im)) }));

  const moverImagem = (id: string, xPct: number, yPct: number) => atualizarImagem(id, { xPct, yPct });

  /** Chamado pelo EncarteCanvas depois de um download bem-sucedido — grava no histórico. */
  const registrarNoHistorico = (imagemPreview: string) => {
    if (!cnpj) return;
    salvarNoHistorico(cnpj, {
      nome: `Encarte ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`,
      imagemPreview,
      formato: formato.id,
      ladoFrente,
      ladoVerso,
    })
      .then(setHistorico)
      .catch((err) => console.error('Erro ao salvar encarte no histórico:', err));
  };

  const abrirDoHistorico = (entry: EncarteSalvo) => {
    setFormato(getFormato(entry.formato as FormatoId));
    setLadoFrente(entry.ladoFrente);
    setLadoVerso(entry.ladoVerso);
    setLadoAtivo('frente');
    setProdutoDetalhadoId(null);
  };

  const apagarHistoricoItem = (id: string) => {
    if (!cnpj) return;
    apagarDoHistorico(cnpj, id)
      .then(setHistorico)
      .catch((err) => console.error('Erro ao apagar encarte do histórico:', err));
  };

  const produtoDetalhado = lado.produtos.find((ep) => ep.product.id === produtoDetalhadoId) ?? null;

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <header className="h-16 flex-shrink-0 border-b border-zinc-800 bg-zinc-900 flex items-center gap-4 px-6 z-40">
        <button onClick={() => setView('editor')} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-black tracking-tighter uppercase">Encarte Online</h1>
      </header>

      <div className="flex-grow flex min-h-0">
        <nav className="w-20 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-4 gap-1">
          {MENU_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveMenu(id); setProdutoDetalhadoId(null); }}
              className={cn(
                'w-16 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-colors',
                activeMenu === id
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                  : 'text-zinc-400 border border-transparent hover:bg-zinc-800 hover:text-zinc-200'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </nav>

        <aside className="w-72 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
          {produtoDetalhado ? (
            <ProdutoDetalhes
              produto={produtoDetalhado}
              estilo={lado.estilo}
              ladoAtivo={ladoAtivo}
              onAtualizar={(patch) => atualizarProduto(produtoDetalhado.product.id, patch)}
              onAtualizarEstilo={atualizarEstilo}
              onRemover={() => removerProduto(produtoDetalhado.product.id)}
              onEnviarParaOutroLado={() => enviarProdutoParaOutroLado(produtoDetalhado.product.id)}
              onVoltar={() => setProdutoDetalhadoId(null)}
            />
          ) : activeMenu === 'temas' ? (
            <TemasTab selecionada={lado.tema} onSelecionar={(url) => atualizarLado({ tema: url })} />
          ) : activeMenu === 'tags' ? (
            <GaleriaImagensTab
              titulo="Tags"
              subtitulo="Imagens soltas sobre o encarte"
              icon={Tag}
              categoria="encarte-elementos"
              elementosAtivos={lado.imagens.filter((im) => im.categoria === 'encarte-elementos')}
              onAdicionarImagem={(url, multiplo) => adicionarImagem(url, 'encarte-elementos', multiplo)}
              onRemoverDoEncarte={(url) => removerImagemDoEncartePorUrl('encarte-elementos', url)}
            />
          ) : activeMenu === 'marca' ? (
            <GaleriaImagensTab
              titulo="Marca"
              subtitulo="Logos e imagens da marca"
              icon={Building2}
              categoria="encarte-marca"
              elementosAtivos={lado.imagens.filter((im) => im.categoria === 'encarte-marca')}
              onAdicionarImagem={(url, multiplo) => adicionarImagem(url, 'encarte-marca', multiplo)}
              onRemoverDoEncarte={(url) => removerImagemDoEncartePorUrl('encarte-marca', url)}
            />
          ) : activeMenu === 'produtos' ? (
            <ProdutosTab
              selecionados={lado.produtos}
              onSelecionar={adicionarProduto}
              onRemover={removerProduto}
              onAbrirDetalhes={setProdutoDetalhadoId}
            />
          ) : activeMenu === 'formatos' ? (
            <FormatosTab selecionado={formato.id} onSelecionar={trocarFormato} />
          ) : activeMenu === 'elementos' ? (
            <ElementosTab
              divisores={lado.divisores}
              rodape={lado.rodape}
              onAdicionarDivisor={adicionarDivisor}
              onAtualizarDivisor={atualizarDivisor}
              onRemoverDivisor={removerDivisor}
              onAtualizarRodape={atualizarRodape}
            />
          ) : activeMenu === 'encartes' ? (
            <EncartesTab historico={historico} onAbrir={abrirDoHistorico} onApagar={apagarHistoricoItem} />
          ) : (
            <div className="p-6 flex flex-col items-center justify-center gap-3 text-center h-full">
              <LayoutGrid className="w-8 h-8 text-zinc-700" />
              <p className="text-xs font-semibold text-zinc-500">{activeLabel} — em construção</p>
            </div>
          )}
        </aside>

        <EncarteCanvas
          backgroundUrl={lado.tema}
          produtos={lado.produtos}
          estilo={lado.estilo}
          formato={formato}
          grade={lado.grade}
          divisores={lado.divisores}
          imagens={lado.imagens}
          rodape={lado.rodape}
          ladoAtivo={ladoAtivo}
          temVerso={ladoVerso != null}
          produtoDetalhadoId={produtoDetalhadoId}
          onAdicionarProdutos={() => setActiveMenu('produtos')}
          onAbrirDetalhes={setProdutoDetalhadoId}
          onMoverProduto={moverProduto}
          onMoverDivisor={moverDivisor}
          onMoverImagem={moverImagem}
          onRedimensionarImagem={atualizarImagem}
          onRemoverImagem={removerImagem}
          onGradeChange={definirGrade}
          onAdicionarVerso={adicionarVerso}
          onRemoverVerso={removerVerso}
          onLadoChange={trocarLado}
          onExportado={registrarNoHistorico}
        />
      </div>
    </div>
  );
}
