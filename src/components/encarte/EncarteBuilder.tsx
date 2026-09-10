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
import { useHistoricoEdicao, OpcoesSet } from './useHistoricoEdicao';
import { Formato, FORMATO_PADRAO, FormatoId, getFormato } from './formatos';
import {
  EncarteProduto,
  EstiloEncarte,
  GradeId,
  LadoEncarte,
  ElementoImagem,
  FormaEncarte,
  FormaTipo,
  GuiaEncarte,
  TextoEncarte,
  CamadaTipo,
  criarEncarteProduto,
  criarLado,
  clonarLado,
  ladoVazio,
  normalizarLado,
  criarDivisor,
  criarElementoImagem,
  criarForma,
  criarTexto,
  maiorZ,
  organizarEmGrade,
} from './encarteProduto';
import {
  EncarteSalvo,
  RascunhoSemData,
  carregarHistorico,
  salvarNoHistorico,
  apagarDoHistorico,
  carregarRascunho,
  salvarRascunho,
  salvarRascunhoKeepalive,
  gravarRascunhoLocal,
  chaveArmazenamento,
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

/** Tudo que o desfazer/refazer acompanha: formato + os dois lados do encarte. */
interface EncarteDoc {
  formatoId: FormatoId;
  ladoFrente: LadoEncarte;
  ladoVerso: LadoEncarte | null;
}

export default function EncarteBuilder({ ladoInicial, formatoInicial, menuInicial }: EncarteBuilderProps = {}) {
  const { setView, currentUser } = useStore();
  const username = currentUser?.username ?? '';
  // Chave de armazenamento do rascunho/histórico. A tela de Encarte é só de
  // admin e admin não tem CNPJ ('Administrativo' → '') — sem isto, toda a
  // persistência ficava travada no `if (!cnpj)`. Ver `chaveArmazenamento`.
  const cnpj = chaveArmazenamento(currentUser?.cnpj, username);
  const [activeMenu, setActiveMenu] = useState<MenuItem>(menuInicial ?? 'temas');

  const {
    presente: doc,
    set: setDoc,
    resetar: resetarDoc,
    desfazer,
    refazer,
    podeDesfazer,
    podeRefazer,
  } = useHistoricoEdicao<EncarteDoc>(() => ({
    formatoId: (formatoInicial ?? FORMATO_PADRAO).id,
    ladoFrente: normalizarLado(ladoInicial ?? criarLado()),
    ladoVerso: null,
  }));

  const formato = getFormato(doc.formatoId);
  const ladoFrente = doc.ladoFrente;
  const ladoVerso = doc.ladoVerso;

  const [ladoAtivo, setLadoAtivo] = useState<Lado>('frente');
  const [produtoDetalhadoId, setProdutoDetalhadoId] = useState<string | number | null>(null);
  const [historico, setHistorico] = useState<EncarteSalvo[]>([]);
  // O auto-save só liga depois que o rascunho salvo foi restaurado (ou que
  // sabemos, pelo servidor, que não há nenhum). Enquanto isso a "casca" inicial
  // do editor não pode gravar por cima do trabalho que está no servidor.
  const prontoParaAutoSalvar = useRef(false);
  const carregouRascunho = useRef(false);    // a restauração terminou com sucesso
  const carregandoRascunho = useRef(false);  // a restauração está rodando agora
  const restaurouRascunho = useRef(false);   // achamos um rascunho e recolocamos ele
  const [tentativaCarregar, setTentativaCarregar] = useState(0); // re-tenta se o servidor falhar

  // Foto sempre atualizada do estado, pra salvar na hora de fechar/recarregar a aba.
  const snapshotRef = useRef<RascunhoSemData>({ formato: doc.formatoId, ladoFrente, ladoVerso });
  snapshotRef.current = { formato: doc.formatoId, ladoFrente, ladoVerso };

  // Largura do painel lateral — ajustável pelo usuário arrastando a divisória.
  const PAINEL_MIN = 240;
  const PAINEL_MAX = 640;
  const [larguraPainel, setLarguraPainel] = useState<number>(() => {
    try {
      const salvo = Number(localStorage.getItem('encarte:larguraPainel'));
      if (salvo >= PAINEL_MIN && salvo <= PAINEL_MAX) return salvo;
    } catch { /* ignora */ }
    return 288;
  });
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const iniciarResizePainel = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startW: larguraPainel };
  };
  const arrastarResizePainel = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = resizeRef.current;
    if (!st) return;
    const teto = Math.min(PAINEL_MAX, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 360);
    const nova = Math.max(PAINEL_MIN, Math.min(teto, st.startW + (e.clientX - st.startX)));
    setLarguraPainel(nova);
  };
  const fimResizePainel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    resizeRef.current = null;
    try { localStorage.setItem('encarte:larguraPainel', String(Math.round(larguraPainel))); } catch { /* ignora */ }
  };

  // Ao montar (e assim que o CNPJ estiver disponível): recupera o rascunho
  // salvo pra não perder o trabalho ao recarregar a página ou voltar do editor
  // de plaquinha, e carrega o histórico de encartes. Roda só no app real — o
  // preview isolado (ladoInicial) fica de fora.
  //
  // Antes isto rodava uma única vez (deps []) e desistia se o CNPJ ainda não
  // tivesse hidratado — aí o auto-save ligava, a casca vazia sobrescrevia o
  // rascunho bom e "voltava tudo do zero". Agora espera o CNPJ, e se a leitura
  // do servidor falhar não liga o auto-save: re-tenta em 4s.
  useEffect(() => {
    if (ladoInicial) {
      prontoParaAutoSalvar.current = true;
      return;
    }
    if (!cnpj || carregouRascunho.current || carregandoRascunho.current) return;
    carregandoRascunho.current = true;
    let cancelado = false;
    (async () => {
      try {
        const [{ rascunho, servidorLido }, hist] = await Promise.all([
          carregarRascunho(cnpj, username),
          carregarHistorico(cnpj).catch(() => [] as EncarteSalvo[]),
        ]);
        if (cancelado) return;
        if (rascunho) {
          restaurouRascunho.current = true;
          resetarDoc({
            formatoId: rascunho.formato as FormatoId,
            ladoFrente: normalizarLado(rascunho.ladoFrente),
            ladoVerso: rascunho.ladoVerso ? normalizarLado(rascunho.ladoVerso) : null,
          });
        }
        setHistorico(hist);
        if (servidorLido || rascunho) {
          // Sabemos o estado real (ou já restauramos algo do localStorage) —
          // pode gravar.
          carregouRascunho.current = true;
          prontoParaAutoSalvar.current = true;
        } else {
          // Servidor não respondeu e não tinha cópia local: não arrisca gravar
          // por cima do rascunho bom. Re-tenta em 4s.
          setTimeout(() => { if (!cancelado) setTentativaCarregar((t) => t + 1); }, 4000);
        }
      } catch (err) {
        console.error('Erro ao carregar rascunho/histórico do encarte:', err);
        if (!cancelado) setTimeout(() => { if (!cancelado) setTentativaCarregar((t) => t + 1); }, 4000);
      } finally {
        carregandoRascunho.current = false;
      }
    })();
    return () => { cancelado = true; carregandoRascunho.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj, username, tentativaCarregar]);

  // Auto-save do rascunho a cada mudança (depois do carregamento inicial):
  // localStorage quase na hora (300ms) e servidor com folga maior (1s).
  useEffect(() => {
    if (!prontoParaAutoSalvar.current || !cnpj) return;
    // Enquanto não restauramos um rascunho e o editor ainda está zerado, não
    // grava nada — evita a casca inicial pisar num rascunho salvo que ainda
    // esteja terminando de carregar. Assim que o usuário mexe em algo (ou
    // restauramos um rascunho), volta a salvar normalmente.
    if (!restaurouRascunho.current && ladoVazio(ladoFrente) && !ladoVerso) return;
    const snap: RascunhoSemData = { formato: doc.formatoId, ladoFrente, ladoVerso };
    const tLocal = setTimeout(() => gravarRascunhoLocal(cnpj, username, snap), 300);
    const tServidor = setTimeout(() => {
      salvarRascunho(cnpj, snap).catch((err) => console.error('Erro ao salvar rascunho do encarte:', err));
    }, 1000);
    return () => { clearTimeout(tLocal); clearTimeout(tServidor); };
  }, [cnpj, username, doc, ladoFrente, ladoVerso]);

  // Flush ao sair: fechar a aba, recarregar (F5) ou trocar de tela do app.
  // Grava o localStorage na hora (síncrono) e tenta o servidor com keepalive.
  useEffect(() => {
    if (!cnpj || ladoInicial) return;
    const flush = () => {
      const s = snapshotRef.current;
      // Só pula se não há nada pra perder (editor ainda zerado e sem rascunho
      // restaurado). Caso contrário grava mesmo que a carga inicial não tenha
      // terminado — o usuário já mexeu em algo e não pode perder ao sair.
      if (!restaurouRascunho.current && ladoVazio(s.ladoFrente) && !s.ladoVerso) return;
      gravarRascunhoLocal(cnpj, username, s);
      salvarRascunhoKeepalive(cnpj, s);
    };
    const onVisibilidade = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibilidade);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibilidade);
      flush(); // também salva ao desmontar (usuário voltou pro editor de plaquinha, etc.)
    };
  }, [cnpj, username, ladoInicial]);

  // Atalhos de teclado: Ctrl/Cmd+Z desfaz, Ctrl/Cmd+Shift+Z (ou Ctrl+Y) refaz.
  // Não intercepta quando o foco está num campo de texto (deixa o undo nativo do campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      e.preventDefault();
      if (k === 'y' || (k === 'z' && e.shiftKey)) refazer();
      else desfazer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [desfazer, refazer]);

  const activeLabel = MENU_ITEMS.find((m) => m.id === activeMenu)?.label;
  const lado = ladoAtivo === 'verso' && ladoVerso ? ladoVerso : ladoFrente;

  /** Aplica um patch (objeto ou função) ao lado ativo, passando pelo histórico. */
  const atualizarLado = (
    patch: Partial<LadoEncarte> | ((l: LadoEncarte) => Partial<LadoEncarte>),
    opcoes?: OpcoesSet,
  ) => {
    const aplicar = (l: LadoEncarte): LadoEncarte => ({ ...l, ...(typeof patch === 'function' ? patch(l) : patch) });
    setDoc((d) => {
      if (ladoAtivo === 'verso') return d.ladoVerso ? { ...d, ladoVerso: aplicar(d.ladoVerso) } : d;
      return { ...d, ladoFrente: aplicar(d.ladoFrente) };
    }, opcoes);
  };

  const adicionarProduto = (product: Product) => {
    atualizarLado((l) => {
      if (l.produtos.some((ep) => ep.product.id === product.id)) return {};
      const produtos = [...l.produtos, { ...criarEncarteProduto(product, l.produtos.length), z: maiorZ(l) + 1 }];
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
    setDoc((d) => {
      const origem = ladoAtivo === 'verso' && d.ladoVerso ? d.ladoVerso : d.ladoFrente;
      const produto = origem.produtos.find((ep) => ep.product.id === id);
      if (!produto) return d;

      const inserir = (destino: LadoEncarte): LadoEncarte => {
        if (destino.produtos.some((ep) => ep.product.id === id)) return destino;
        const produtos = [...destino.produtos, { ...produto, z: maiorZ(destino) + 1 }];
        if (destino.grade === 'livre') return { ...destino, produtos };
        const r = organizarEmGrade(produtos, destino.grade, formato);
        return { ...destino, produtos: r.produtos, estilo: { ...destino.estilo, escalaCard: r.escalaCard } };
      };
      const tirar = (l: LadoEncarte): LadoEncarte => {
        const produtos = l.produtos.filter((ep) => ep.product.id !== id);
        if (l.grade === 'livre') return { ...l, produtos };
        const r = organizarEmGrade(produtos, l.grade, formato);
        return { ...l, produtos: r.produtos, estilo: { ...l.estilo, escalaCard: r.escalaCard } };
      };

      if (ladoAtivo === 'frente') {
        return { ...d, ladoFrente: tirar(d.ladoFrente), ladoVerso: inserir(d.ladoVerso ?? criarLado()) };
      }
      return { ...d, ladoVerso: d.ladoVerso ? tirar(d.ladoVerso) : d.ladoVerso, ladoFrente: inserir(d.ladoFrente) };
    });
    setProdutoDetalhadoId((atual) => (atual === id ? null : atual));
  };

  const atualizarProduto = (
    id: string | number | undefined,
    patch: Partial<EncarteProduto>,
    opcoes?: OpcoesSet,
  ) => {
    atualizarLado(
      (l) => ({ produtos: l.produtos.map((ep) => (ep.product.id === id ? { ...ep, ...patch } : ep)) }),
      opcoes,
    );
  };

  const moverProduto = (id: string | number | undefined, xPct: number, yPct: number) =>
    atualizarProduto(id, { xPct, yPct }, { coalesce: `mover-produto-${id ?? 'x'}` });

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
    setDoc((d) => ({
      ...d,
      formatoId: f.id,
      ladoFrente: regridLado(d.ladoFrente, f),
      ladoVerso: d.ladoVerso ? regridLado(d.ladoVerso, f) : null,
    }));
  };

  const adicionarVerso = () => {
    setDoc((d) => ({ ...d, ladoVerso: clonarLado(d.ladoFrente) }));
    setLadoAtivo('verso');
    setProdutoDetalhadoId(null);
  };

  const removerVerso = () => {
    setDoc((d) => ({ ...d, ladoVerso: null }));
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
    atualizarLado(
      (l) => ({ divisores: l.divisores.map((d) => (d.id === id ? { ...d, yPct } : d)) }),
      { coalesce: `mover-divisor-${id}` },
    );

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
      return { imagens: [...l.imagens, { ...criarElementoImagem(url, categoria), z: maiorZ(l) + 1 }] };
    });
  };

  const removerImagem = (id: string) =>
    atualizarLado((l) => ({ imagens: l.imagens.filter((im) => im.id !== id) }));

  /** Tira do encarte a(s) imagem(ns) dessa categoria com essa URL, sem apagar da galeria. */
  const removerImagemDoEncartePorUrl = (categoria: string, url: string) =>
    atualizarLado((l) => ({ imagens: l.imagens.filter((im) => !(im.categoria === categoria && im.url === url)) }));

  const atualizarImagem = (id: string, patch: Partial<ElementoImagem>, opcoes?: OpcoesSet) =>
    atualizarLado(
      (l) => ({ imagens: l.imagens.map((im) => (im.id === id ? { ...im, ...patch } : im)) }),
      opcoes,
    );

  const moverImagem = (id: string, xPct: number, yPct: number) =>
    atualizarImagem(id, { xPct, yPct }, { coalesce: `mover-imagem-${id}` });

  const redimensionarImagem = (id: string, patch: Partial<ElementoImagem>) =>
    atualizarImagem(id, patch, { coalesce: `redim-imagem-${id}` });

  // ── Formas (quadrado, retângulo, círculo) ───────────────────────────
  const adicionarForma = (tipo: FormaTipo) =>
    atualizarLado((l) => ({ formas: [...(l.formas ?? []), { ...criarForma(tipo), z: maiorZ(l) + 1 }] }));

  const atualizarForma = (id: string, patch: Partial<FormaEncarte>, opcoes?: OpcoesSet) =>
    atualizarLado(
      (l) => ({ formas: (l.formas ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)) }),
      opcoes,
    );

  const moverForma = (id: string, xPct: number, yPct: number) =>
    atualizarForma(id, { xPct, yPct }, { coalesce: `mover-forma-${id}` });

  const redimensionarForma = (id: string, patch: Partial<FormaEncarte>) =>
    atualizarForma(id, patch, { coalesce: `redim-forma-${id}` });

  const definirCorForma = (id: string, cor: string) =>
    atualizarForma(id, { cor }, { coalesce: `cor-forma-${id}` });

  const removerForma = (id: string) =>
    atualizarLado((l) => ({ formas: (l.formas ?? []).filter((f) => f.id !== id) }));

  // ── Textos ─────────────────────────────────────────────────────────
  const adicionarTexto = (texto: TextoEncarte) =>
    atualizarLado((l) => ({ textos: [...(l.textos ?? []), { ...texto, z: maiorZ(l) + 1 }] }));

  // ── Camadas: trazer pra frente / mandar pra trás um passo por clique ──
  // O `z` é compartilhado por produtos, imagens, formas e textos, então
  // qualquer um pode passar na frente (ou atrás) de qualquer outro. Cada
  // clique troca de lugar com o vizinho imediato; nos extremos, não faz nada
  // (devolve o `doc` intacto, sem gastar passo de desfazer).
  const reordenarCamada = (alvo: { tipo: CamadaTipo; id: string | number }, direcao: 'frente' | 'tras') => {
    setDoc((d) => {
      const l = ladoAtivo === 'verso' && d.ladoVerso ? d.ladoVerso : d.ladoFrente;
      const itens: { tipo: CamadaTipo; id: string | number; z: number }[] = [
        ...l.produtos.map((p) => ({ tipo: 'produto' as const, id: p.product.id, z: p.z ?? 0 })),
        ...l.imagens.map((im) => ({ tipo: 'imagem' as const, id: im.id, z: im.z ?? 0 })),
        ...(l.formas ?? []).map((f) => ({ tipo: 'forma' as const, id: f.id, z: f.z ?? 0 })),
        ...(l.textos ?? []).map((t) => ({ tipo: 'texto' as const, id: t.id, z: t.z ?? 0 })),
      ].sort((a, b) => a.z - b.z);

      const i = itens.findIndex((it) => it.tipo === alvo.tipo && String(it.id) === String(alvo.id));
      const j = direcao === 'frente' ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= itens.length) return d; // não achou ou já no extremo — nada muda

      // Densifica o z pra 0..n-1 (sem números fugindo) e troca os dois vizinhos.
      const rank = itens.map((_, k) => k);
      rank[i] = j;
      rank[j] = i;
      const zDe = (tipo: CamadaTipo, id: string | number) => {
        const k = itens.findIndex((it) => it.tipo === tipo && String(it.id) === String(id));
        return k >= 0 ? rank[k] : 0;
      };
      const novoLado: LadoEncarte = {
        ...l,
        produtos: l.produtos.map((p) => ({ ...p, z: zDe('produto', p.product.id) })),
        imagens: l.imagens.map((im) => ({ ...im, z: zDe('imagem', im.id) })),
        formas: (l.formas ?? []).map((f) => ({ ...f, z: zDe('forma', f.id) })),
        textos: (l.textos ?? []).map((t) => ({ ...t, z: zDe('texto', t.id) })),
      };
      return ladoAtivo === 'verso' ? { ...d, ladoVerso: novoLado } : { ...d, ladoFrente: novoLado };
    });
  };

  const atualizarTexto = (id: string, patch: Partial<TextoEncarte>, opcoes?: OpcoesSet) =>
    atualizarLado(
      (l) => ({ textos: (l.textos ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      opcoes,
    );

  const moverTexto = (id: string, xPct: number, yPct: number) =>
    atualizarTexto(id, { xPct, yPct }, { coalesce: `mover-texto-${id}` });

  const redimensionarTexto = (id: string, wPct: number) =>
    atualizarTexto(id, { wPct }, { coalesce: `redim-texto-${id}` });

  const editarTexto = (id: string, conteudo: string) =>
    atualizarTexto(id, { texto: conteudo }, { coalesce: `conteudo-texto-${id}` });

  const estilizarTexto = (id: string, patch: Partial<TextoEncarte>) =>
    atualizarTexto(id, patch, { coalesce: `estilo-texto-${id}` });

  const removerTexto = (id: string) =>
    atualizarLado((l) => ({ textos: (l.textos ?? []).filter((t) => t.id !== id) }));

  // ── Guias / réguas ─────────────────────────────────────────────────
  // Fora do histórico (semHistorico): guia é auxílio de montagem, não
  // deve gastar passo de desfazer nem some com Ctrl+Z. Continua salvando
  // no rascunho (o auto-save observa o doc inteiro).
  const adicionarGuia = (guia: GuiaEncarte) =>
    atualizarLado((l) => ({ guias: [...(l.guias ?? []), guia] }), { semHistorico: true });

  const moverGuia = (id: string, pos: number) =>
    atualizarLado(
      (l) => ({ guias: (l.guias ?? []).map((g) => (g.id === id ? { ...g, pos } : g)) }),
      { semHistorico: true },
    );

  const removerGuia = (id: string) =>
    atualizarLado((l) => ({ guias: (l.guias ?? []).filter((g) => g.id !== id) }), { semHistorico: true });

  const limparGuias = () =>
    atualizarLado(() => ({ guias: [] }), { semHistorico: true });

  /**
   * Grava o encarte inteiro (formato + frente + verso, com fundo/tema,
   * produtos, formas, textos, tags, marca e guias) na aba Encartes.
   * Usado pelo botão "Salvar" e também depois de um download.
   */
  const gravarEncarte = (imagemPreview: string): Promise<void> => {
    if (!cnpj) return Promise.reject(new Error('Sessão sem usuário identificado — não dá pra salvar o encarte.'));
    return salvarNoHistorico(cnpj, {
      nome: `Encarte ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${ladoVerso ? ' (frente + verso)' : ''}`,
      imagemPreview,
      formato: doc.formatoId,
      ladoFrente,
      ladoVerso,
    }).then(setHistorico);
  };

  const abrirDoHistorico = (entry: EncarteSalvo) => {
    restaurouRascunho.current = true;
    resetarDoc({
      formatoId: entry.formato as FormatoId,
      ladoFrente: normalizarLado(entry.ladoFrente),
      ladoVerso: entry.ladoVerso ? normalizarLado(entry.ladoVerso) : null,
    });
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

        <aside
          style={{ width: larguraPainel }}
          className="flex-shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto"
        >
          {produtoDetalhado ? (
            <ProdutoDetalhes
              produto={produtoDetalhado}
              estilo={lado.estilo}
              ladoAtivo={ladoAtivo}
              onAtualizar={(patch) => atualizarProduto(produtoDetalhado.product.id, patch)}
              onAtualizarEstilo={atualizarEstilo}
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

        {/* Divisória arrastável — ajusta a largura do painel lateral */}
        <div
          onPointerDown={iniciarResizePainel}
          onPointerMove={arrastarResizePainel}
          onPointerUp={fimResizePainel}
          onPointerCancel={fimResizePainel}
          onDoubleClick={() => setLarguraPainel(288)}
          title="Arraste pra ajustar a largura do painel (2 cliques volta ao padrão)"
          className="w-1.5 flex-shrink-0 cursor-col-resize bg-zinc-800 hover:bg-emerald-500/60 active:bg-emerald-500 transition-colors touch-none"
        />

        <EncarteCanvas
          backgroundUrl={lado.tema}
          produtos={lado.produtos}
          estilo={lado.estilo}
          formato={formato}
          grade={lado.grade}
          divisores={lado.divisores}
          imagens={lado.imagens}
          formas={lado.formas ?? []}
          textos={lado.textos ?? []}
          guias={lado.guias ?? []}
          rodape={lado.rodape}
          ladoAtivo={ladoAtivo}
          temVerso={ladoVerso != null}
          produtoDetalhadoId={produtoDetalhadoId}
          podeDesfazer={podeDesfazer}
          podeRefazer={podeRefazer}
          onDesfazer={desfazer}
          onRefazer={refazer}
          onAdicionarProdutos={() => setActiveMenu('produtos')}
          onAbrirDetalhes={setProdutoDetalhadoId}
          onMoverProduto={moverProduto}
          onMoverDivisor={moverDivisor}
          onMoverImagem={moverImagem}
          onRedimensionarImagem={redimensionarImagem}
          onRemoverImagem={removerImagem}
          onAdicionarForma={adicionarForma}
          onMoverForma={moverForma}
          onRedimensionarForma={redimensionarForma}
          onDefinirCorForma={definirCorForma}
          onRemoverForma={removerForma}
          onReordenarCamada={reordenarCamada}
          onAdicionarTexto={adicionarTexto}
          onMoverTexto={moverTexto}
          onRedimensionarTexto={redimensionarTexto}
          onEditarTexto={editarTexto}
          onEstilizarTexto={estilizarTexto}
          onRemoverTexto={removerTexto}
          onAdicionarGuia={adicionarGuia}
          onMoverGuia={moverGuia}
          onRemoverGuia={removerGuia}
          onLimparGuias={limparGuias}
          onGradeChange={definirGrade}
          onAdicionarVerso={adicionarVerso}
          onRemoverVerso={removerVerso}
          onLadoChange={trocarLado}
          onSalvarEncarte={gravarEncarte}
          onExportado={(preview) => { gravarEncarte(preview).catch((err) => console.error('Erro ao salvar encarte:', err)); }}
        />
      </div>
    </div>
  );
}
