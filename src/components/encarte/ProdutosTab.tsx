import { useEffect, useMemo, useState } from 'react';
import { X, ShoppingCart, ChevronRight, Search, History, Heart, Star, Plus, Check } from 'lucide-react';
import ProductSelector from '../ProductSelector';
import { Product, useStore } from '../../store';
import { getProxyUrl, cn } from '../../lib/utils';
import { EncarteProduto } from './encarteProduto';
import { lerHistorico, registrarHistorico, lerFavoritos, alternarFavorito } from './produtosRecentes';

interface ProdutosTabProps {
  selecionados: EncarteProduto[];
  onSelecionar: (product: Product) => void;
  onRemover: (id?: string | number) => void;
  onAbrirDetalhes: (id?: string | number) => void;
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

export default function ProdutosTab({ selecionados, onSelecionar, onRemover, onAbrirDetalhes }: ProdutosTabProps) {
  const { products, fetchProducts, currentUser } = useStore();
  const user = currentUser?.username ?? '';

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
          <ProductSelector onSelect={adicionar} />

          {selecionados.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Selecionados ({selecionados.length})
              </h3>
              <div className="space-y-1.5">
                {selecionados.map((ep) => (
                  <div key={ep.product.id} className="flex items-center gap-2 bg-zinc-800 rounded-lg pl-2 pr-1 py-1.5">
                    <button
                      onClick={() => onAbrirDetalhes(ep.product.id)}
                      className="flex items-center gap-2 flex-grow min-w-0 text-left group"
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
                      onClick={() => onRemover(ep.product.id)}
                      className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                      title="Tirar do encarte"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
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
