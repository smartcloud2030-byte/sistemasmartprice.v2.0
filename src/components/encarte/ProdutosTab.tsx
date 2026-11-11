import { useEffect, useMemo, useState } from 'react';
import { X, ShoppingCart, ChevronRight, Search, History, Heart, Star, Plus, Check, Eye, EyeOff, Square, CheckSquare, ArrowRightLeft, ArrowDownToLine, ChevronDown, GripVertical } from 'lucide-react';
import ProductSelector from '../ProductSelector';
import ProductManager, { CadastroRapido } from '../ProductManager';
import { Product, useStore } from '../../store';
import { getProxyUrl, cn } from '../../lib/utils';
import { EncarteProduto } from './encarteProduto';
import { Lado } from './ladosEncarte';
import { lerHistorico, registrarHistorico, lerFavoritos, alternarFavorito } from './produtosRecentes';

interface ProdutosTabProps {
  selecionados: EncarteProduto[];
  onSelecionar: (product: Product) => void;
  onRemover: (id?: string | number) => void;
  onAbrirDetalhes: (id?: string | number) => void;
  /** ids (string) dos produtos marcados nas caixinhas — viram a seleção múltipla do canvas */
  marcados: string[];
  onMarcar: (id: string | number) => void;
  onMarcarTodos: (marcar: boolean) => void;
  onAlternarOculto: (id?: string | number) => void;
  /** todas as páginas do encarte (frente/verso/verso 2) com os produtos de cada uma */
  paginas: { lado: Lado; nome: string; produtos: EncarteProduto[] }[];
  ladoAtivo: Lado;
  /** muda o produto de página sem apagar e adicionar de novo */
  onMoverPagina: (id: string | number | undefined, de: Lado, para: Lado) => void;
  onIrPagina: (lado: Lado) => void;
  /** arrastou um produto da lista e soltou em cima de outro: os dois trocam de lugar (mesmo em páginas diferentes) */
  onTrocar: (a: { id: string | number | undefined; lado: Lado }, b: { id: string | number | undefined; lado: Lado }) => void;
}

/** Props de arrastar-e-soltar de uma linha da lista (montadas no ProdutosTab). */
type PropsArraste = (ep: EncarteProduto, lado: Lado) => {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  'data-alvo': boolean;
  'data-arrastando': boolean;
};

const CLASSE_ARRASTE = 'data-[alvo=true]:ring-2 data-[alvo=true]:ring-emerald-400 data-[alvo=true]:bg-emerald-500/10 data-[arrastando=true]:opacity-40 cursor-grab active:cursor-grabbing';

function Alca() {
  return <GripVertical className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" aria-hidden />;
}

type Aba = 'buscar' | 'historico' | 'favoritos';

/** Linha compacta de produto — usada no histórico e nos favoritos. */
function LinhaProduto({
  p,
  noEncarte,
  favorito,
  onAdicionar,
  onFavoritar,
}: {
  p: Product;
  noEncarte: boolean;
  favorito: boolean;
  onAdicionar: () => void;
  onFavoritar: () => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-zinc-800 rounded-lg pl-2 pr-1 py-1.5">
      <div className="w-7 h-7 rounded bg-zinc-700 flex-shrink-0 overflow-hidden">
        {p.image && <img src={getProxyUrl(p.image, { thumbnail: true })} className="w-full h-full object-cover" />}
      </div>
      <button onClick={onAdicionar} className="flex-grow min-w-0 text-left group" title="Adicionar ao encarte">
        <span className="block text-xs text-zinc-200 truncate group-hover:text-emerald-300 transition-colors">{p.name}</span>
        {p.price && p.price !== '0,00' && (
          <span className="block text-[10px] font-semibold text-emerald-400">R$ {p.price}</span>
        )}
      </button>
      <button
        onClick={onFavoritar}
        title={favorito ? 'Tirar dos favoritos' : 'Favoritar'}
        className={cn('p-1 flex-shrink-0 transition-colors', favorito ? 'text-amber-400' : 'text-zinc-500 hover:text-amber-400')}
      >
        <Star className="w-3.5 h-3.5" fill={favorito ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={onAdicionar}
        title="Adicionar ao encarte"
        className={cn('p-1 flex-shrink-0 transition-colors', noEncarte ? 'text-emerald-400' : 'text-zinc-400 hover:text-emerald-300')}
      >
        {noEncarte ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

/** Produtos de outra página (verso/frente) — dá pra trazer pra página aberta. */
function OutraPagina({
  nome,
  nomeAtiva,
  produtos,
  onTrazer,
  onIr,
  lado,
  arraste,
}: {
  lado: Lado;
  arraste: PropsArraste;
  nome: string;
  nomeAtiva: string;
  produtos: EncarteProduto[];
  onTrazer: (id?: string | number) => void;
  onIr: () => void;
}) {
  const [aberta, setAberta] = useState(true);
  return (
    <div className="pt-2 mt-1 border-t border-zinc-800/70">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setAberta((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
        >
          <ChevronDown className={cn('w-3 h-3 transition-transform', !aberta && '-rotate-90')} />
          Na página: {nome} ({produtos.length})
        </button>
        <button onClick={onIr} className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-emerald-300">
          Abrir página
        </button>
      </div>
      {aberta && (
        <div className="space-y-1.5 mt-2">
          {produtos.length === 0 && <p className="text-[11px] text-zinc-600 px-1">Nenhum produto nesta página.</p>}
          {produtos.map((ep) => (
            <div key={ep.product.id} {...arraste(ep, lado)} title="Arraste em cima de outro produto pra trocar os dois de lugar" className={cn('flex items-center gap-2 rounded-lg pl-1 pr-1 py-1.5 bg-zinc-800/50', CLASSE_ARRASTE)}>
              <Alca />
              <div className="w-7 h-7 rounded bg-zinc-700 flex-shrink-0 overflow-hidden">
                {ep.product.image && <img src={getProxyUrl(ep.product.image, { thumbnail: true })} className="w-full h-full object-cover" />}
              </div>
              <span className={cn('text-xs text-zinc-300 truncate flex-grow', ep.oculto && 'opacity-40')}>{ep.nome}</span>
              <button
                onClick={() => onTrazer(ep.product.id)}
                title={`Trazer pra ${nomeAtiva}`}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/10 flex-shrink-0"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                Trazer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProdutosTab({ selecionados, onSelecionar, onRemover, onAbrirDetalhes, marcados, onMarcar, onMarcarTodos, onAlternarOculto, paginas, ladoAtivo, onMoverPagina, onIrPagina, onTrocar }: ProdutosTabProps) {
  // Arrastar um produto da lista e soltar em cima de outro troca os dois de lugar.
  const [arrastando, setArrastando] = useState<{ id: string | number | undefined; lado: Lado } | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const chave = (id: string | number | undefined, lado: Lado) => `${lado}:${String(id)}`;
  const arraste: PropsArraste = (ep, lado) => {
    const k = chave(ep.product.id, lado);
    return {
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', k);
        setArrastando({ id: ep.product.id, lado });
      },
      onDragEnd: () => { setArrastando(null); setAlvo(null); },
      onDragOver: (e) => {
        if (!arrastando || chave(arrastando.id, arrastando.lado) === k) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (alvo !== k) setAlvo(k);
      },
      onDragLeave: () => setAlvo((a) => (a === k ? null : a)),
      onDrop: (e) => {
        e.preventDefault();
        const de = arrastando;
        setArrastando(null);
        setAlvo(null);
        if (de && chave(de.id, de.lado) !== k) onTrocar(de, { id: ep.product.id, lado });
      },
      'data-alvo': alvo === k,
      'data-arrastando': !!arrastando && chave(arrastando.id, arrastando.lado) === k,
    };
  };
  const outrasPaginas = paginas.filter((pg) => pg.lado !== ladoAtivo);
  const nomeAtiva = paginas.find((pg) => pg.lado === ladoAtivo)?.nome ?? 'Frente';
  // menu "Mandar pra" aberto (id do produto)
  const [moverAberto, setMoverAberto] = useState<string | null>(null);
  const { products, fetchProducts, currentUser, userRole } = useStore();
  const user = currentUser?.username ?? '';
  const isAdmin = userRole === 'admin';
  // cadastro/exclusão de produto sem sair do encarte (só admin)
  const [rapido, setRapido] = useState<Omit<CadastroRapido, 'onFechar'> | null>(null);

  const [aba, setAba] = useState<Aba>('buscar');
  const [historico, setHistorico] = useState<string[]>([]);
  const [favoritos, setFavoritos] = useState<string[]>([]);

  useEffect(() => {
    fetchProducts();
    setHistorico(lerHistorico(user));
    setFavoritos(lerFavoritos(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const catalogo = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(String(p.id), p);
    return m;
  }, [products]);

  const idsNoEncarte = useMemo(() => new Set(selecionados.map((ep) => String(ep.product.id))), [selecionados]);
  const favSet = useMemo(() => new Set(favoritos), [favoritos]);
  const marcadosSet = useMemo(() => new Set(marcados), [marcados]);

  const adicionar = (p: Product) => {
    registrarHistorico(user, String(p.id));
    setHistorico(lerHistorico(user));
    onSelecionar(p);
  };

  const favoritar = (id: string) => setFavoritos(alternarFavorito(user, id));

  const listaDe = (ids: string[]) => ids.map((id) => catalogo.get(id)).filter((p): p is Product => !!p);

  const ABAS: { id: Aba; label: string; Icon: typeof Search }[] = [
    { id: 'buscar', label: 'Buscar', Icon: Search },
    { id: 'historico', label: 'Histórico', Icon: History },
    { id: 'favoritos', label: 'Favoritos', Icon: Heart },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-emerald-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Produtos</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Busque, use os recentes ou os favoritos</p>
        </div>
      </div>

      <div className="flex border-b border-zinc-800">
        {ABAS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
              aba === id ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {aba === 'buscar' && (
        <>
          <ProductSelector
            onSelect={adicionar}
            onCadastrar={isAdmin ? (termo) => setRapido({ termo, onCadastrado: adicionar }) : undefined}
            onExcluir={isAdmin ? (p) => setRapido({ excluir: p, onExcluido: (id) => { if (idsNoEncarte.has(String(id))) onRemover(id); } }) : undefined}
            onEditar={isAdmin ? (p) => setRapido({ editar: p }) : undefined}
          />
          {rapido && <ProductManager key={`${rapido.excluir?.id ?? ''}|${rapido.editar?.id ?? ''}|${rapido.termo ?? ''}`} rapido={{ ...rapido, onFechar: () => setRapido(null) }} />}

          {(selecionados.length > 0 || outrasPaginas.some((pg) => pg.produtos.length > 0)) && (
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  {outrasPaginas.length ? `Nesta página: ${nomeAtiva}` : 'Selecionados'} ({selecionados.length})
                </h3>
                <button
                  onClick={() => onMarcarTodos(marcadosSet.size < selecionados.length)}
                  className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-sky-300 transition-colors"
                >
                  {marcadosSet.size > 0 && marcadosSet.size === selecionados.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              {(selecionados.length + outrasPaginas.reduce((n, pg) => n + pg.produtos.length, 0)) >= 2 && (
                <p className="text-[11px] text-zinc-500">Pra trocar dois produtos de lugar, arraste um em cima do outro{outrasPaginas.length ? ', mesmo de outra página' : ''}.</p>
              )}
              {marcadosSet.size >= 2 && (
                <p className="text-[11px] text-sky-300">
                  {marcadosSet.size} marcados — arraste qualquer um deles no encarte que todos andam juntos.
                </p>
              )}
              <div className="space-y-1.5">
                {selecionados.map((ep) => {
                  const marcado = marcadosSet.has(String(ep.product.id));
                  return (
                  <div
                    key={ep.product.id}
                    {...arraste(ep, ladoAtivo)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg pl-1 pr-1 py-1.5 border',
                      marcado ? 'bg-sky-500/10 border-sky-500/50' : 'bg-zinc-800 border-transparent',
                      CLASSE_ARRASTE,
                    )}
                  >
                    <span title="Arraste em cima de outro produto pra trocar os dois de lugar"><Alca /></span>
                    <button
                      onClick={() => ep.product.id != null && onMarcar(ep.product.id)}
                      title={marcado ? 'Desmarcar' : 'Marcar (pra mover junto com outros)'}
                      className={cn('p-1 flex-shrink-0 transition-colors', marcado ? 'text-sky-400' : 'text-zinc-500 hover:text-sky-300')}
                    >
                      {marcado ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => onAbrirDetalhes(ep.product.id)}
                      className={cn('flex items-center gap-2 flex-grow min-w-0 text-left group', ep.oculto && 'opacity-40')}
                    >
                      <div className="w-7 h-7 rounded bg-zinc-700 flex-shrink-0 overflow-hidden">
                        {ep.product.image && (
                          <img src={getProxyUrl(ep.product.image, { thumbnail: true })} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <span className="text-xs text-zinc-200 truncate flex-grow group-hover:text-emerald-300 transition-colors">
                        {ep.nome}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 group-hover:text-emerald-400 transition-colors" />
                    </button>
                    <button
                      onClick={() => favoritar(String(ep.product.id))}
                      title={favSet.has(String(ep.product.id)) ? 'Tirar dos favoritos' : 'Favoritar'}
                      className={cn(
                        'p-1 flex-shrink-0 transition-colors',
                        favSet.has(String(ep.product.id)) ? 'text-amber-400' : 'text-zinc-500 hover:text-amber-400',
                      )}
                    >
                      <Star className="w-3.5 h-3.5" fill={favSet.has(String(ep.product.id)) ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={() => onAlternarOculto(ep.product.id)}
                      title={ep.oculto ? 'Mostrar no encarte' : 'Ocultar do encarte'}
                      className={cn('p-1 flex-shrink-0 transition-colors', ep.oculto ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-200')}
                    >
                      {ep.oculto ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    {outrasPaginas.length > 0 && (
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={() => setMoverAberto((v) => (v === String(ep.product.id) ? null : String(ep.product.id)))}
                          title="Mandar pra outra página"
                          className={cn('p-1 transition-colors', moverAberto === String(ep.product.id) ? 'text-emerald-400' : 'text-zinc-500 hover:text-emerald-300')}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                        {moverAberto === String(ep.product.id) && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMoverAberto(null)} />
                            <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1">
                              <p className="px-3 pt-1 pb-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">Mandar pra</p>
                              {outrasPaginas.map((pg) => (
                                <button
                                  key={pg.lado}
                                  onClick={() => { setMoverAberto(null); onMoverPagina(ep.product.id, ladoAtivo, pg.lado); }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                                >
                                  {pg.nome}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => onRemover(ep.product.id)}
                      className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                      title="Tirar do encarte"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  );
                })}
              </div>
              {outrasPaginas.map((pg) => (
                <OutraPagina
                  key={pg.lado}
                  nome={pg.nome}
                  nomeAtiva={nomeAtiva}
                  produtos={pg.produtos}
                  onTrazer={(id) => onMoverPagina(id, pg.lado, ladoAtivo)}
                  onIr={() => onIrPagina(pg.lado)}
                  lado={pg.lado}
                  arraste={arraste}
                />
              ))}
            </div>
          )}
        </>
      )}

      {aba === 'historico' && (
        <div className="space-y-1.5">
          {listaDe(historico).length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-10">
              Nenhum produto usado ainda. Ao adicionar um produto ao encarte ele aparece aqui.
            </p>
          ) : (
            listaDe(historico).map((p) => (
              <LinhaProduto
                key={p.id}
                p={p}
                noEncarte={idsNoEncarte.has(String(p.id))}
                favorito={favSet.has(String(p.id))}
                onAdicionar={() => adicionar(p)}
                onFavoritar={() => favoritar(String(p.id))}
              />
            ))
          )}
        </div>
      )}

      {aba === 'favoritos' && (
        <div className="space-y-1.5">
          {listaDe(favoritos).length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-10">
              Nenhum favorito ainda. Toque na estrela ⭐ de um produto no Histórico ou nos Selecionados.
            </p>
          ) : (
            listaDe(favoritos).map((p) => (
              <LinhaProduto
                key={p.id}
                p={p}
                noEncarte={idsNoEncarte.has(String(p.id))}
                favorito
                onAdicionar={() => adicionar(p)}
                onFavoritar={() => favoritar(String(p.id))}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
