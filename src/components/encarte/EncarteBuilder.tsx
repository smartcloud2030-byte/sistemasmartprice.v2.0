import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Image, ShoppingCart, Shapes, Tag, Rows3, Building2, LayoutGrid, FilePlus, ChevronDown, Eraser, FileX } from 'lucide-react';
import { useStore, Product } from '../../store';
import { cn } from '../../lib/utils';
import TemasTab from './TemasTab';
import GaleriaImagensTab from './GaleriaImagensTab';
import ProdutosTab from './ProdutosTab';
import AjusteFundo from './AjusteFundo';
import FormatosTab from './FormatosTab';
import ElementosTab from './ElementosTab';
import { Lado, NOME_LADO, ladoDoDoc, comLado, paginasDoDoc, novaPaginaSemProdutos } from './ladosEncarte';
import EncartesTab from './EncartesTab';
import ProdutoDetalhes from './ProdutoDetalhes';
import EncarteCanvas from './EncarteCanvas';
import GerarPlaquinhasModal from './GerarPlaquinhasModal';
import { useHistoricoEdicao, OpcoesSet } from './useHistoricoEdicao';
import { avaliarProduto, montarAvisosLegais, Tarja } from '../../lib/regrasDivulgacao';

type InfoCmed = { tarja: Exclude<Tarja, null>; registro: string } | null;
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
  MembroGrupo,
  criarEncarteProduto,
  criarLado,
  ladoVazio,
  normalizarLado,
  criarDivisor,
  criarElementoImagem,
  criarForma,
  criarTexto,
  maiorZ,
  PosicaoGrupo,
  organizarEmGrade,
  organizarAutomatico,
  areaDoLado,
  posicaoLivreNaGrade,
  proximaPosicaoNaSequencia,
  getGrade,
  ordenarPorLeitura,
  CARD_H,
  CANVAS_W,
  trocarDestaque,
  ordenarPorPreco,
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
  CHAVE_HISTORICO_ADMINS,
  migrarHistoricoParaAdmins,
  renomearNoHistorico,
} from './persistencia';

type MenuItem = 'temas' | 'produtos' | 'elementos' | 'tags' | 'formatos' | 'marca' | 'encartes';

const MENU_ITEMS: { id: MenuItem; label: string; icon: React.ElementType }[] = [
  { id: 'temas', label: 'Temas', icon: Image },
  { id: 'produtos', label: 'Produtos', icon: ShoppingCart },
  { id: 'elementos', label: 'Tags', icon: Shapes },
  { id: 'tags', label: 'Elementos', icon: Tag },
  { id: 'formatos', label: 'Formatos', icon: Rows3 },
  { id: 'marca', label: 'Marca', icon: Building2 },
  { id: 'encartes', label: 'Encartes', icon: LayoutGrid },
];

/** Grade Automática: realinha todos os produtos do lado (entrou/saiu produto,
 * mudou destaque, formato ou a área). Outras grades devolvem o lado igual. */
function realinharSeAuto(lado: LadoEncarte, formato: Formato, novoId?: string | number): LadoEncarte {
  if (lado.grade !== 'auto') return lado;
  // Segue a ordem que está NA TELA (quem foi arrastado fica onde o usuário
  // pôs); o produto que acabou de entrar vai pro fim.
  const alturaPct = ((CARD_H * (lado.estilo.escalaCard || 1)) / (CANVAS_W / formato.ratio)) * 100;
  const novo = novoId === undefined ? undefined : lado.produtos.find((ep) => ep.product.id === novoId);
  const resto = novo ? lado.produtos.filter((ep) => ep !== novo) : lado.produtos;
  const naOrdem = [...ordenarPorLeitura(resto, alturaPct), ...(novo ? [novo] : [])];
  const { produtos, escalaCard } = organizarAutomatico(naOrdem, formato, lado.areaTopo, lado.areaBase);
  return { ...lado, produtos, estilo: { ...lado.estilo, escalaCard } };
}

/** Reaplica a grade de um lado (usado quando produtos ou formato mudam). */
function regridLado(lado: LadoEncarte, formato: Formato): LadoEncarte {
  if (lado.grade === 'auto') return realinharSeAuto(lado, formato);
  if (lado.grade === 'livre') return lado;
  const { produtos, escalaCard } = organizarEmGrade(lado.produtos, lado.grade, formato, areaDoLado(lado));
  return { ...lado, produtos, estilo: { ...lado.estilo, escalaCard } };
}

/** Onde entra um produto novo (grades fixas e livre): logo depois do último
 * da sequência, no espaçamento que o usuário montou; se não couber, a 1ª
 * célula vazia da grade (jeito antigo). */
function lugarDoNovo(l: LadoEncarte, formato: Formato): { xPct: number; yPct: number } | null {
  const g = getGrade(l.grade);
  const seq = proximaPosicaoNaSequencia(l.produtos, formato, l.estilo.escalaCard || 1, g.cols, areaDoLado(l).base);
  if (seq) return seq;
  return l.grade === 'livre' ? null : posicaoLivreNaGrade(l.produtos, l.grade, formato, l.estilo.escalaCard, areaDoLado(l));
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
  /** 3ª página (verso 2) */
  ladoVerso2?: LadoEncarte | null;
}

export default function EncarteBuilder({ ladoInicial, formatoInicial, menuInicial }: EncarteBuilderProps = {}) {
  const { setView, currentUser, userRole } = useStore();
  const username = currentUser?.username ?? '';
  // Chave de armazenamento do rascunho/histórico. A tela de Encarte é só de
  // admin e admin não tem CNPJ ('Administrativo' → '') — sem isto, toda a
  // persistência ficava travada no `if (!cnpj)`. Ver `chaveArmazenamento`.
  const cnpj = chaveArmazenamento(currentUser?.cnpj, username);
  // Lista de encartes salvos: a dos admins é uma só, compartilhada entre
  // todos (um edita o que o outro salvou). Rascunho continua em `cnpj`.
  const chaveHist = userRole === 'admin' ? CHAVE_HISTORICO_ADMINS : cnpj;
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
    ladoVerso2: null,
  }));

  const formato = getFormato(doc.formatoId);
  const ladoFrente = doc.ladoFrente;
  const ladoVerso = doc.ladoVerso;
  const ladoVerso2 = doc.ladoVerso ? doc.ladoVerso2 ?? null : null;
  const paginas = paginasDoDoc(doc);
  const todosProdutos = paginas.flatMap((l) => ladoDoDoc(doc, l)?.produtos ?? []);

  const [ladoAtivo, setLadoAtivo] = useState<Lado>('frente');
  const [produtoDetalhadoId, setProdutoDetalhadoId] = useState<string | number | null>(null);
  // Página aberta deixou de existir (desfazer, remover verso): volta pra frente.
  useEffect(() => {
    if (!paginas.includes(ladoAtivo)) setLadoAtivo('frente');
  }, [paginas.join(','), ladoAtivo]); // eslint-disable-line react-hooks/exhaustive-deps
  // seleção múltipla do canvas — aqui em cima pra a lista Selecionados (caixinhas) mexer nela também
  const [grupo, setGrupo] = useState<MembroGrupo[]>([]);
  const [placaModalAberto, setPlacaModalAberto] = useState(false);
  const [historico, setHistorico] = useState<EncarteSalvo[]>([]);
  // Nome do encarte (campo no topo) — fora do desfazer/refazer, mas vai no rascunho.
  const [nomeEncarte, setNomeEncarte] = useState('');
  // Item da aba Encartes que corresponde ao encarte aberto (já salvo). Salvar
  // ou baixar de novo atualiza esse item — sem criar repetido a cada PNG.
  const [salvoId, setSalvoId] = useState<string | null>(null);
  // Cópia em ref + fila: dois downloads seguidos (antes do 1º terminar de
  // gravar) não podem criar dois itens — o 2º espera o 1º e já usa o id dele.
  const salvoIdRef = useRef<string | null>(null);
  salvoIdRef.current = salvoId;
  const filaGravacao = useRef<Promise<unknown>>(Promise.resolve());
  // O auto-save só liga depois que o rascunho salvo foi restaurado (ou que
  // sabemos, pelo servidor, que não há nenhum). Enquanto isso a "casca" inicial
  // do editor não pode gravar por cima do trabalho que está no servidor.
  const prontoParaAutoSalvar = useRef(false);
  const carregouRascunho = useRef(false);    // a restauração terminou com sucesso
  const carregandoRascunho = useRef(false);  // a restauração está rodando agora
  const restaurouRascunho = useRef(false);   // achamos um rascunho e recolocamos ele
  const [tentativaCarregar, setTentativaCarregar] = useState(0); // re-tenta se o servidor falhar

  // Foto sempre atualizada do estado, pra salvar na hora de fechar/recarregar a aba.
  const snapshotRef = useRef<RascunhoSemData>({ nome: nomeEncarte, salvoId, formato: doc.formatoId, ladoFrente, ladoVerso, ladoVerso2 });
  snapshotRef.current = { nome: nomeEncarte, salvoId, formato: doc.formatoId, ladoFrente, ladoVerso, ladoVerso2 };

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
          (chaveHist === CHAVE_HISTORICO_ADMINS
            ? migrarHistoricoParaAdmins(cnpj).catch(() => null).then(() => carregarHistorico(chaveHist))
            : carregarHistorico(chaveHist)
          ).catch(() => [] as EncarteSalvo[]),
        ]);
        if (cancelado) return;
        if (rascunho) {
          restaurouRascunho.current = true;
          setNomeEncarte(rascunho.nome ?? '');
          setSalvoId(rascunho.salvoId ?? null);
          resetarDoc({
            formatoId: rascunho.formato as FormatoId,
            ladoFrente: normalizarLado(rascunho.ladoFrente),
            ladoVerso: rascunho.ladoVerso ? normalizarLado(rascunho.ladoVerso) : null,
            ladoVerso2: rascunho.ladoVerso && rascunho.ladoVerso2 ? normalizarLado(rascunho.ladoVerso2) : null,
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
    const snap: RascunhoSemData = { nome: nomeEncarte, salvoId, formato: doc.formatoId, ladoFrente, ladoVerso, ladoVerso2 };
    const tLocal = setTimeout(() => gravarRascunhoLocal(cnpj, username, snap), 300);
    const tServidor = setTimeout(() => {
      salvarRascunho(cnpj, snap).catch((err) => console.error('Erro ao salvar rascunho do encarte:', err));
    }, 1000);
    return () => { clearTimeout(tLocal); clearTimeout(tServidor); };
  }, [cnpj, username, doc, ladoFrente, ladoVerso, ladoVerso2, nomeEncarte, salvoId]);

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
  const lado = ladoDoDoc(doc, ladoAtivo) ?? ladoFrente;

  /** Aplica um patch (objeto ou função) ao lado ativo, passando pelo histórico. */
  const atualizarLado = (
    patch: Partial<LadoEncarte> | ((l: LadoEncarte) => Partial<LadoEncarte>),
    opcoes?: OpcoesSet,
  ) => {
    const aplicar = (l: LadoEncarte): LadoEncarte => ({ ...l, ...(typeof patch === 'function' ? patch(l) : patch) });
    setDoc((d) => {
      const atual = ladoDoDoc(d, ladoAtivo);
      return atual ? comLado(d, ladoAtivo, aplicar(atual)) : d;
    }, opcoes);
  };

  // ── Regras de divulgação (lei) ───────────────────────────────────────
  // Tarja de cada código de barras pela lista CMED (servidor). undefined =
  // ainda não consultado; null = não é remédio da CMED.
  const [tarjas, setTarjas] = useState<Record<string, InfoCmed>>({});
  const tarjasRef = useRef(tarjas);
  tarjasRef.current = tarjas;
  const codigosDe = (p: Product) =>
    [p.barcode, p.barcode2].map((c) => String(c ?? '').replace(/\D/g, '')).filter((c) => c.length >= 8);

  const consultarTarjas = async (codigos: string[]) => {
    const faltam = [...new Set(codigos)].filter((c) => !(c in tarjasRef.current));
    if (faltam.length === 0) return tarjasRef.current;
    const res = await fetch('/api/divulgacao/tarjas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigos: faltam }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const novas: Record<string, InfoCmed> = await res.json();
    const juntas = { ...tarjasRef.current, ...novas };
    tarjasRef.current = juntas;
    setTarjas(juntas);
    return juntas;
  };

  const infoDe = (p: Product, mapa = tarjas): InfoCmed => {
    for (const c of codigosDe(p)) if (mapa[c]) return mapa[c];
    return null;
  };
  const tarjaDe = (p: Product, mapa = tarjas): Tarja => infoDe(p, mapa)?.tarja ?? null;
  const restricaoDe = (ep: { product: Product; nome?: string; descricao?: string }, mapa = tarjas) =>
    avaliarProduto({ nome: `${ep.product.name || ''} ${ep.nome || ''}`, descricao: ep.descricao ?? ep.product.description ?? '' }, tarjaDe(ep.product, mapa));

  // Produtos que já estavam no encarte (rascunho/encarte salvo): consulta a tarja deles também.
  const codigosNoEncarte = todosProdutos.flatMap((ep) => codigosDe(ep.product));
  const chaveCodigos = [...new Set(codigosNoEncarte)].sort().join(',');
  useEffect(() => {
    if (chaveCodigos) consultarTarjas(chaveCodigos.split(',')).catch(() => { /* tenta de novo na próxima mudança */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveCodigos]);

  // Aviso (uma vez por produto) de remédio com receita que já estava no encarte.
  const avisadosRef = useRef(new Set<string | number | undefined>());
  useEffect(() => {
    for (const ep of todosProdutos) {
      const r = restricaoDe(ep);
      if (r?.nivel !== 'bloqueado' || avisadosRef.current.has(ep.product.id)) continue;
      avisadosRef.current.add(ep.product.id);
      toast.error(`${ep.nome || ep.product.name}: não pode ser divulgado no encarte`, {
        description: `${r.motivo} (${r.lei}). Tire do encarte — na plaquinha pode.`,
        duration: 12000,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarjas, ladoFrente.produtos, ladoVerso?.produtos, ladoVerso2?.produtos]);

  // Letra miúda obrigatória do lado aberto (remédio sem receita, leite, composto lácteo).
  const avisosLegais = montarAvisosLegais(
    lado.produtos
      .filter((ep) => !ep.oculto)
      .map((ep) => ({
        nome: [ep.nome || ep.product.name, ep.descricao].filter(Boolean).join(' '),
        restricao: restricaoDe(ep),
        registro: infoDe(ep.product)?.registro,
      })),
  );

  // Adicionar NÃO reorganiza a grade: os que já estão ficam exatamente onde
  // e do tamanho que o usuário deixou. O novo vai pra primeira célula vazia
  // (grade cheia → nasce na posição em cascata, por cima, pra arrastar).
  const adicionarProduto = async (product: Product) => {
    if (lado.produtos.some((ep) => ep.product.id === product.id)) return;
    let mapa = tarjas;
    try {
      mapa = await consultarTarjas(codigosDe(product));
    } catch {
      /* sem resposta do servidor: segue só com a regra pelo nome (leite/fórmula) */
    }
    const restricao = restricaoDe({ product, nome: product.name, descricao: product.description ?? '' }, mapa);
    // Proibido por lei: entra mesmo assim (decisão do José), mas avisa.
    if (restricao?.nivel === 'bloqueado') {
      avisadosRef.current.add(product.id);
      toast.error(`Atenção: ${product.name} não pode ser divulgado em encarte`, {
        description: `${restricao.motivo} (${restricao.lei}). Coloquei, mas o ideal é tirar. Na plaquinha de gôndola pode.`,
        duration: 12000,
      });
    }
    if (tarjaDe(product, mapa) === '') {
      toast.warning(`Confira se ${product.name} precisa de receita`, {
        description: 'A lista da Anvisa não informa a tarja dele. Se for de receita, tire do encarte (RDC 96/2008).',
        duration: 10000,
      });
    }
    if (restricao?.nivel === 'frase' && !avisosLegais) {
      toast.info('Coloquei no pé do encarte o texto obrigatório por lei.', { description: restricao.lei });
    }
    atualizarLado((l) => {
      if (l.produtos.some((ep) => ep.product.id === product.id)) return {};
      const novo = { ...criarEncarteProduto(product, l.produtos.length), z: maiorZ(l) + 1 };
      if (l.grade === 'auto') return realinharSeAuto({ ...l, produtos: [...l.produtos, novo] }, formato, novo.product.id);
      const livre = lugarDoNovo(l, formato);
      return { produtos: [...l.produtos, livre ? { ...novo, ...livre } : novo] };
    });
  };

  // Remover só tira o produto: os outros ficam exatamente onde o usuário
  // deixou (mesmo com grade ativa — antes reorganizava a grade e todo mundo
  // pulava de lugar/tamanho). Só mudam de posição se mexidos à mão.
  const removerProduto = (id?: string | number) => {
    atualizarLado((l) => realinharSeAuto({ ...l, produtos: l.produtos.filter((ep) => ep.product.id !== id) }, formato));
    setProdutoDetalhadoId((atual) => (atual === id ? null : atual));
  };

  /** Move um produto da página ativa pra outra (cria o verso vazio se ainda não existir). */
  const enviarProdutoParaOutroLado = (id: string | number | undefined, destinoLado: Lado, origemLado: Lado = ladoAtivo) => {
    setDoc((d) => {
      if (destinoLado === origemLado) return d;
      const origem = ladoDoDoc(d, origemLado) ?? d.ladoFrente;
      const produto = origem.produtos.find((ep) => ep.product.id === id);
      if (!produto) return d;

      const inserir = (destino: LadoEncarte): LadoEncarte => {
        if (destino.produtos.some((ep) => ep.product.id === id)) return destino;
        // Como no `adicionarProduto`: quem já está no destino não se mexe.
        const livre = lugarDoNovo(destino, formato);
        const nd = produto.nomeDescricaoAjuste;
        const posicionado = livre
          ? {
              ...produto,
              ...livre,
              // nome/descrição solto (em % do canvas) anda junto com o card
              nomeDescricaoAjuste: nd ? { ...nd, xPct: nd.xPct + (livre.xPct - produto.xPct), yPct: nd.yPct + (livre.yPct - produto.yPct) } : nd,
            }
          : produto;
        return realinharSeAuto({ ...destino, produtos: [...destino.produtos, { ...posicionado, z: maiorZ(destino) + 1 }] }, formato, id);
      };
      // Como no `removerProduto`: os que ficam no lado de origem não se mexem (a não ser na grade Automática).
      const tirar = (l: LadoEncarte): LadoEncarte => realinharSeAuto({ ...l, produtos: l.produtos.filter((ep) => ep.product.id !== id) }, formato);

      const destino = ladoDoDoc(d, destinoLado) ?? (destinoLado === 'verso' ? criarLado() : null);
      if (!destino) return d;
      return comLado(comLado(d, origemLado, tirar(origem)), destinoLado, inserir(destino));
    });
    setProdutoDetalhadoId((atual) => (atual === id ? null : atual));
  };

  /** Manda imagem, forma ou texto pro outro lado na MESMA posição e tamanho
   * (os lados têm o mesmo formato e tudo é em % do canvas). Só faz sentido com
   * verso ativo — o botão nem aparece sem ele. Vai pra frente da pilha do destino.
   * `copiar` (clique simples no botão) replica e mantém o original; `mover`
   * (duplo clique) tira do lado de origem. */
  const enviarElementoParaOutroLado = (
    tipo: 'imagem' | 'forma' | 'texto',
    id: string,
    modo: 'copiar' | 'mover',
    destinoLado: Lado | 'todos',
  ) => {
    setDoc((d) => {
      const chave = tipo === 'imagem' ? 'imagens' : tipo === 'forma' ? 'formas' : 'textos';
      const origem = ladoDoDoc(d, ladoAtivo);
      if (!origem) return d;
      const lista = (origem[chave] ?? []) as { id: string }[];
      const el = lista.find((x) => x.id === id);
      if (!el) return d;
      const destinos = (destinoLado === 'todos' ? paginasDoDoc(d) : [destinoLado]).filter(
        (l) => l !== ladoAtivo && ladoDoDoc(d, l),
      );
      if (!destinos.length) return d;
      const prefixo = tipo === 'imagem' ? 'img' : tipo === 'forma' ? 'forma' : 'txt';
      let novo = d;
      for (const l of destinos) {
        const destino = ladoDoDoc(novo, l)!;
        const copia = modo === 'copiar' ? { ...el, id: `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` } : el;
        novo = comLado(novo, l, { ...destino, [chave]: [...((destino[chave] ?? []) as { id: string }[]), { ...copia, z: maiorZ(destino) + 1 }] });
      }
      if (modo === 'mover') novo = comLado(novo, ladoAtivo, { ...origem, [chave]: lista.filter((x) => x.id !== id) });
      return novo;
    });
  };

  const atualizarProduto = (
    id: string | number | undefined,
    patch: Partial<EncarteProduto>,
    opcoes?: OpcoesSet,
  ) => {
    atualizarLado((l) => {
      const produtos = l.produtos.map((ep) => {
        if (ep.product.id !== id) return ep;
        // virar destaque entra com tamanhos/posições no padrão; voltar devolve os do card normal
        const base = 'emDestaque' in patch && patch.emDestaque !== undefined ? trocarDestaque(ep, patch.emDestaque) : ep;
        const { emDestaque: _ignorado, ...resto } = patch;
        return { ...base, ...resto };
      });
      // virar/deixar de ser destaque muda a largura do card → realinha a grade Automática
      return 'emDestaque' in patch ? realinharSeAuto({ ...l, produtos }, formato) : { produtos };
    }, opcoes);
  };

  /** Arraste da seleção múltipla: move tudo num passo só de desfazer (`chave` = um arraste). */
  const moverGrupo = (novas: PosicaoGrupo[], chave: string) => {
    const nova = (tipo: CamadaTipo, id: string | number | undefined) =>
      novas.find((n) => n.tipo === tipo && String(n.id) === String(id));
    const mover = <T extends { id: string; xPct: number; yPct: number }>(tipo: CamadaTipo, itens: T[]) =>
      itens.map((it) => {
        const n = nova(tipo, it.id);
        return n ? { ...it, xPct: n.xPct, yPct: n.yPct } : it;
      });
    atualizarLado(
      (l) => ({
        produtos: l.produtos.map((p) => {
          const n = nova('produto', p.product.id);
          if (!n) return p;
          return {
            ...p,
            xPct: n.xPct,
            yPct: n.yPct,
            ...(n.nomeDescricaoAjuste !== undefined ? { nomeDescricaoAjuste: n.nomeDescricaoAjuste } : {}),
          };
        }),
        imagens: mover('imagem', l.imagens),
        formas: mover('forma', l.formas ?? []),
        textos: mover('texto', l.textos ?? []),
      }),
      { coalesce: `mover-grupo-${chave}` },
    );
  };

  const moverProduto = (id: string | number | undefined, xPct: number, yPct: number) =>
    atualizarProduto(id, { xPct, yPct }, { coalesce: `mover-produto-${id ?? 'x'}` });

  const atualizarEstilo = (patch: Partial<EstiloEncarte>) =>
    atualizarLado((l) => ({ estilo: { ...l.estilo, ...patch } }));

  const definirGrade = (grade: GradeId) => {
    atualizarLado((l) => {
      if (grade === 'livre') return { grade };
      if (grade === 'auto') return realinharSeAuto({ ...l, grade }, formato);
      const r = organizarEmGrade(l.produtos, grade, formato, areaDoLado(l));
      return { grade, produtos: r.produtos, estilo: { ...l.estilo, escalaCard: r.escalaCard } };
    });
  };

  /** Onde começam os produtos (abaixo do cabeçalho do tema) — Automática e grades fixas. */
  const definirAreaTopo = (areaTopo: number) =>
    atualizarLado((l) => regridLado({ ...l, areaTopo }, formato), { coalesce: 'area-topo' });

  const trocarFormato = (f: Formato) => {
    setDoc((d) => ({
      ...d,
      formatoId: f.id,
      ladoFrente: regridLado(d.ladoFrente, f),
      ladoVerso: d.ladoVerso ? regridLado(d.ladoVerso, f) : null,
      ladoVerso2: d.ladoVerso2 ? regridLado(d.ladoVerso2, f) : null,
    }));
  };

  /** Nova página (verso, depois verso 2): copia da frente os elementos, tema e estilo, sem os produtos. */
  const adicionarVerso = () => {
    const alvo: Lado | null = !doc.ladoVerso ? 'verso' : !doc.ladoVerso2 ? 'verso2' : null;
    if (!alvo) return;
    setDoc((d) => comLado(d, alvo, novaPaginaSemProdutos(d.ladoFrente)));
    setLadoAtivo(alvo);
    setProdutoDetalhadoId(null);
  };

  /** Remove uma página de verso. Sem o verso, o verso 2 passa a ser o verso. */
  const removerVerso = (l: Lado) => {
    if (l === 'frente') return;
    setDoc((d) =>
      l === 'verso2'
        ? { ...d, ladoVerso2: null }
        : { ...d, ladoVerso: d.ladoVerso2 ?? null, ladoVerso2: null },
    );
    setLadoAtivo(l === 'verso2' || doc.ladoVerso2 ? 'verso' : 'frente');
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
  const adicionarForma = (forma: FormaTipo | FormaEncarte) =>
    atualizarLado((l) => ({
      formas: [...(l.formas ?? []), { ...(typeof forma === 'string' ? criarForma(forma) : forma), z: maiorZ(l) + 1 }],
    }));

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
  /** Cola uma imagem pronta (Ctrl+V) — sempre acrescenta, nunca substitui a da categoria. */
  const colarImagem = (imagem: ElementoImagem) =>
    atualizarLado((l) => ({ imagens: [...l.imagens, { ...imagem, z: maiorZ(l) + 1 }] }));

  const ordenarProdutosPorPreco = (ordem: 'asc' | 'desc') =>
    atualizarLado((l) => ({ produtos: ordenarPorPreco(l.produtos, ordem) }));

  const adicionarTexto = (texto: TextoEncarte) =>
    atualizarLado((l) => ({ textos: [...(l.textos ?? []), { ...texto, z: maiorZ(l) + 1 }] }));

  // ── Camadas: trazer pra frente / mandar pra trás um passo por clique ──
  // O `z` é compartilhado por produtos, imagens, formas e textos, então
  // qualquer um pode passar na frente (ou atrás) de qualquer outro. Cada
  // clique troca de lugar com o vizinho imediato; nos extremos, não faz nada
  // (devolve o `doc` intacto, sem gastar passo de desfazer).
  const reordenarCamada = (alvo: { tipo: CamadaTipo; id: string | number }, direcao: 'frente' | 'tras') => {
    setDoc((d) => {
      const l = ladoDoDoc(d, ladoAtivo) ?? d.ladoFrente;
      // Mesmo desempate (por `chave`, quando o `z` empata) usado pra decidir a
      // ordem visual em EncarteCanvas.tsx — sem isso, num empate de `z` (comum
      // em elementos antigos sem `z` salvo, todos caindo no `?? 0`), o vizinho
      // trocado aqui podia não ser o vizinho visual, e o clique parecia não
      // fazer nada até o usuário insistir várias vezes.
      const itens: { tipo: CamadaTipo; id: string | number; chave: string; z: number }[] = [
        ...l.produtos.map((p) => ({ tipo: 'produto' as const, id: p.product.id, chave: `p:${p.product.id}`, z: p.z ?? 0 })),
        ...l.imagens.map((im) => ({ tipo: 'imagem' as const, id: im.id, chave: `i:${im.id}`, z: im.z ?? 0 })),
        ...(l.formas ?? []).map((f) => ({ tipo: 'forma' as const, id: f.id, chave: `f:${f.id}`, z: f.z ?? 0 })),
        ...(l.textos ?? []).map((t) => ({ tipo: 'texto' as const, id: t.id, chave: `t:${t.id}`, z: t.z ?? 0 })),
      ].sort((a, b) => (a.z - b.z) || (a.chave < b.chave ? -1 : 1));

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
      return comLado(d, ladoDoDoc(d, ladoAtivo) ? ladoAtivo : 'frente', novoLado);
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
   * Usado pelo botão "Salvar" e também depois de um download. Se o encarte
   * aberto já está na aba, atualiza o mesmo item (não duplica).
   */
  const gravarEncarte = (imagemPreview: string): Promise<void> => {
    if (!cnpj) return Promise.reject(new Error('Sessão sem usuário identificado — não dá pra salvar o encarte.'));
    const gravar = filaGravacao.current.catch(() => null).then(() => {
      const id = salvoIdRef.current;
      const nomeAnterior = id ? historico.find((e) => e.id === id)?.nome : undefined;
      return salvarNoHistorico(chaveHist, {
        nome:
          nomeEncarte.trim() ||
          nomeAnterior ||
          `Encarte ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${ladoVerso2 ? ' (3 páginas)' : ladoVerso ? ' (frente + verso)' : ''}`,
        imagemPreview,
        formato: doc.formatoId,
        ladoFrente,
        ladoVerso,
        ladoVerso2,
      }, id).then((lista) => {
        setHistorico(lista);
        salvoIdRef.current = lista[0]?.id ?? null;
        setSalvoId(salvoIdRef.current);
      });
    });
    filaGravacao.current = gravar;
    return gravar;
  };


  const abrirDoHistorico = (entry: EncarteSalvo) => {
    restaurouRascunho.current = true;
    setNomeEncarte(entry.nome);
    setSalvoId(entry.id);
    resetarDoc({
      formatoId: entry.formato as FormatoId,
      ladoFrente: normalizarLado(entry.ladoFrente),
      ladoVerso: entry.ladoVerso ? normalizarLado(entry.ladoVerso) : null,
      ladoVerso2: entry.ladoVerso && entry.ladoVerso2 ? normalizarLado(entry.ladoVerso2) : null,
    });
    setLadoAtivo('frente');
    setProdutoDetalhadoId(null);
  };

  // "Novo encarte" — antes, pra fazer o encarte da semana, o José apagava os
  // produtos um por um. Vai pelo `setDoc` (e não `resetarDoc`) de propósito:
  // vira um passo de desfazer, então Ctrl+Z traz o encarte anterior de volta.
  const [novoAberto, setNovoAberto] = useState(false);
  const novoEncarte = (manterLayout: boolean) => {
    const semProdutos = (l: LadoEncarte): LadoEncarte => ({ ...l, produtos: [] });
    setDoc((d) =>
      manterLayout
        ? {
            ...d,
            ladoFrente: semProdutos(d.ladoFrente),
            ladoVerso: d.ladoVerso ? semProdutos(d.ladoVerso) : null,
            ladoVerso2: d.ladoVerso2 ? semProdutos(d.ladoVerso2) : null,
          }
        : { formatoId: d.formatoId, ladoFrente: criarLado(), ladoVerso: null, ladoVerso2: null },
    );
    // Grava o encarte novo como rascunho mesmo em branco — sem isso o
    // auto-save pula o lado vazio e um F5 traria o encarte antigo de volta.
    restaurouRascunho.current = true;
    setNomeEncarte('');
    setSalvoId(null); // encarte novo vira um item novo na aba ao salvar/baixar
    setLadoAtivo('frente');
    setProdutoDetalhadoId(null);
    setNovoAberto(false);
  };

  const renomearHistoricoItem = (id: string, nome: string) => {
    if (!chaveHist) return;
    renomearNoHistorico(chaveHist, id, nome)
      .then((lista) => {
        setHistorico(lista);
        if (id === salvoIdRef.current) setNomeEncarte(nome);
      })
      .catch((err) => {
        console.error('Erro ao renomear encarte:', err);
        toast.error(`Não deu pra renomear: ${err?.message || 'erro desconhecido'}`);
      });
  };

  const apagarHistoricoItem = (id: string) => {
    if (!cnpj) return;
    apagarDoHistorico(chaveHist, id)
      .then((lista) => {
        setHistorico(lista);
        if (id === salvoIdRef.current) setSalvoId(null);
      })
      .catch((err) => {
        console.error('Erro ao apagar encarte do histórico:', err);
        toast.error(`Não deu pra apagar: ${err?.message || 'erro desconhecido'}`);
      });
  };

  const produtoDetalhado = lado.produtos.find((ep) => ep.product.id === produtoDetalhadoId) ?? null;
  // Frente + verso juntos, na ordem — "Add placa de preço" transforma cada
  // produto do encarte inteiro (os dois lados) numa plaquinha pra fila.
  const produtosParaPlaquinha = todosProdutos.filter((ep) => !ep.oculto);

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <header className="h-12 flex-shrink-0 border-b border-zinc-800 bg-zinc-900 flex items-center gap-3 px-3 z-40">
        <button onClick={() => setView('editor')} title="Voltar" className="p-1.5 hover:bg-zinc-800 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <input
          value={nomeEncarte}
          onChange={(e) => setNomeEncarte(e.target.value)}
          placeholder="Nome do encarte…"
          title="Nome do encarte — é com esse nome que ele aparece na aba Encartes ao salvar"
          maxLength={80}
          className="w-80 max-w-[40vw] bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
        />
        <div className="relative ml-auto">
          <button
            onClick={() => setNovoAberto((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
              novoAberto
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/60'
                : 'text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10',
            )}
          >
            <FilePlus className="w-3.5 h-3.5" />
            Novo encarte
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>
          {novoAberto && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNovoAberto(false)} />
              <div className="absolute right-0 top-full mt-2 w-80 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-2">
                <button
                  onClick={() => novoEncarte(true)}
                  className="w-full flex items-start gap-3 p-3 rounded-lg text-left hover:bg-zinc-800 transition-colors"
                >
                  <Eraser className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold text-zinc-100">Trocar só os produtos</span>
                    <span className="block text-xs text-zinc-400">Tira todos os produtos e mantém tema, logo, textos e formas.</span>
                  </span>
                </button>
                <button
                  onClick={() => novoEncarte(false)}
                  className="w-full flex items-start gap-3 p-3 rounded-lg text-left hover:bg-zinc-800 transition-colors"
                >
                  <FileX className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold text-zinc-100">Começar do zero</span>
                    <span className="block text-xs text-zinc-400">Encarte em branco, só mantém o formato.</span>
                  </span>
                </button>
                <p className="px-3 pt-2 pb-1 text-[11px] text-zinc-500 border-t border-zinc-800 mt-1">
                  Se quiser guardar o atual, clique em Salvar antes. Se clicar sem querer, Ctrl+Z (Cmd+Z no Mac) desfaz.
                </p>
              </div>
            </>
          )}
        </div>
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
              paginas={paginas}
              onAtualizar={(patch) => atualizarProduto(produtoDetalhado.product.id, patch)}
              onAtualizarEstilo={atualizarEstilo}
              onEnviarParaOutroLado={(destino) => enviarProdutoParaOutroLado(produtoDetalhado.product.id, destino)}
              onVoltar={() => setProdutoDetalhadoId(null)}
            />
          ) : activeMenu === 'temas' ? (
            <TemasTab selecionada={lado.tema} onSelecionar={(url) => atualizarLado({ tema: url, fundoPos: null })} />
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
              paginas={paginas.map((l) => ({ lado: l, nome: NOME_LADO[l], produtos: ladoDoDoc(doc, l)?.produtos ?? [] }))}
              ladoAtivo={ladoAtivo}
              onMoverPagina={(id, de, para) => {
                enviarProdutoParaOutroLado(id, para, de);
                toast.success(`Produto mandado pra ${NOME_LADO[para]}.`, { description: 'Ctrl+Z desfaz.' });
              }}
              onIrPagina={trocarLado}
              selecionados={lado.produtos}
              onSelecionar={adicionarProduto}
              onRemover={removerProduto}
              onAbrirDetalhes={setProdutoDetalhadoId}
              marcados={grupo.filter((m) => m.tipo === 'produto').map((m) => String(m.id))}
              onMarcar={(id) =>
                setGrupo((g) =>
                  g.some((m) => m.tipo === 'produto' && String(m.id) === String(id))
                    ? g.filter((m) => !(m.tipo === 'produto' && String(m.id) === String(id)))
                    : [...g, { tipo: 'produto', id }],
                )
              }
              onMarcarTodos={(marcar) =>
                setGrupo((g) => [
                  ...g.filter((m) => m.tipo !== 'produto'),
                  ...(marcar ? lado.produtos.filter((ep) => ep.product.id != null).map((ep) => ({ tipo: 'produto' as const, id: ep.product.id! })) : []),
                ])
              }
              onAlternarOculto={(id) => {
                const ep = lado.produtos.find((p) => p.product.id === id);
                if (ep) atualizarProduto(id, { oculto: !ep.oculto });
              }}
            />
          ) : activeMenu === 'formatos' ? (
            <div>
              <div className="p-3 pb-0">
                <AjusteFundo url={lado.tema} propCanvas={formato.ratio} posicao={lado.fundoPos} onMudar={(p) => atualizarLado({ fundoPos: p })} />
              </div>
              <div>
                <FormatosTab selecionado={formato.id} onSelecionar={trocarFormato} />
              </div>
            </div>
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
            <EncartesTab historico={historico} onAbrir={abrirDoHistorico} onApagar={apagarHistoricoItem} onRenomear={renomearHistoricoItem} />
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
          fundoPos={lado.fundoPos}
          produtos={lado.produtos}
          estilo={lado.estilo}
          formato={formato}
          grade={lado.grade}
          divisores={lado.divisores}
          imagens={lado.imagens}
          onColarImagem={colarImagem}
          formas={lado.formas ?? []}
          textos={lado.textos ?? []}
          guias={lado.guias ?? []}
          rodape={lado.rodape}
          avisosLegais={avisosLegais}
          ajusteAvisoLegal={lado.avisoLegal}
          onAjustarAvisoLegal={(ajuste, opcoes) => atualizarLado({ avisoLegal: ajuste }, opcoes)}
          ladoAtivo={ladoAtivo}
          temVerso={ladoVerso != null}
          paginas={paginas}
          produtoDetalhadoId={produtoDetalhadoId}
          podeDesfazer={podeDesfazer}
          podeRefazer={podeRefazer}
          onDesfazer={desfazer}
          onRefazer={refazer}
          onAdicionarProdutos={() => setActiveMenu('produtos')}
          onAdicionarPlacaPreco={() => setPlacaModalAberto(true)}
          onAbrirDetalhes={setProdutoDetalhadoId}
          onMoverProduto={moverProduto}
          onMoverGrupo={moverGrupo}
          grupo={grupo}
          onGrupoChange={setGrupo}
          onMoverPrecoProduto={(id, desloc, opcoes) => atualizarProduto(id, { deslocPreco: desloc }, opcoes)}
          onAjustarFotoProduto={(id, ajuste, opcoes) => atualizarProduto(id, { fotoAjuste: ajuste }, opcoes)}
          onAjustarNomeDescricao={(id, ajuste, opcoes) => atualizarProduto(id, { nomeDescricaoAjuste: ajuste }, opcoes)}
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
          onOrdenarPorPreco={ordenarProdutosPorPreco}
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
          areaTopo={lado.areaTopo}
          onAreaTopoChange={definirAreaTopo}
          onAdicionarVerso={adicionarVerso}
          onRemoverVerso={removerVerso}
          onEnviarElementoParaOutroLado={enviarElementoParaOutroLado}
          onLadoChange={trocarLado}
          onSalvarEncarte={gravarEncarte}
          onExportado={(preview) => {
            gravarEncarte(preview).catch((err) => {
              console.error('Erro ao salvar encarte:', err);
              toast.error(`Baixou, mas não deu pra guardar na aba Encartes: ${err?.message || 'erro desconhecido'}`);
            });
          }}
        />
      </div>

      {placaModalAberto && (
        <GerarPlaquinhasModal produtos={produtosParaPlaquinha} onClose={() => setPlacaModalAberto(false)} />
      )}
    </div>
  );
}
