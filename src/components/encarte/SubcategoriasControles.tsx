import { useRef, useState } from 'react';
import { Check, X, Loader2, ChevronRight, Folder, FolderInput, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn, normalizarBusca } from '../../lib/utils';
import {
  MapaSubcategorias,
  Subcategoria,
  subsOrdenadas,
  criarSub,
  renomearSub,
  excluirSub,
} from '../../lib/temasSubcategorias';

/**
 * Fileira de subcategorias do "Ver mais" (Todos + uma por subcategoria) e,
 * pro admin, criar / renomear / excluir. Usada em Temas, Elementos e Marca.
 */
export function SubcategoriasBarra({
  classif,
  mapa,
  ativa,
  onMudar,
  contagem,
  total,
  isAdmin,
  gravar,
}: {
  classif: string;
  mapa: MapaSubcategorias;
  /** null = "Todos" */
  ativa: string | null;
  onMudar: (id: string | null) => void;
  contagem: (id: string) => number;
  total: number;
  isAdmin: boolean;
  /** grava o mapa novo; devolve false se falhou */
  gravar: (novo: MapaSubcategorias) => Promise<boolean>;
}) {
  const subs = subsOrdenadas(mapa, classif);
  const atual = subs.find((s) => s.id === ativa) ?? null;
  const [edicao, setEdicao] = useState<null | { modo: 'criar' | 'renomear'; nome: string }>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const trocar = (id: string | null) => { setEdicao(null); setConfirmarExcluir(false); onMudar(id); };

  const salvar = async () => {
    if (!edicao || ocupado) return;
    const nome = edicao.nome.trim().slice(0, 40);
    if (!nome) return;
    const repetido = subs.some(
      (x) => normalizarBusca(x.nome) === normalizarBusca(nome) && !(edicao.modo === 'renomear' && x.id === ativa),
    );
    if (repetido) { toast.error('Já existe uma subcategoria com esse nome.'); return; }
    setOcupado(true);
    if (edicao.modo === 'criar') {
      const r = criarSub(mapa, classif, nome);
      if (await gravar(r.mapa)) { setEdicao(null); onMudar(r.id); toast.success('Subcategoria criada!'); }
    } else if (ativa && (await gravar(renomearSub(mapa, classif, ativa, nome)))) {
      setEdicao(null);
      toast.success('Subcategoria renomeada!');
    }
    setOcupado(false);
  };

  const excluir = async () => {
    if (!ativa || ocupado) return;
    setOcupado(true);
    if (await gravar(excluirSub(mapa, classif, ativa))) {
      setConfirmarExcluir(false);
      onMudar(null);
      toast.success('Subcategoria excluída. As imagens dela continuam em “Todos”.');
    }
    setOcupado(false);
  };

  if (!subs.length && !isAdmin) return null;

  const chip = (id: string | null, nome: string, n: number) => (
    <button
      key={id ?? '_todos'}
      onClick={() => trocar(id)}
      className={cn(
        'flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors',
        ativa === id
          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
          : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600',
      )}
    >
      {id && <Folder className="w-3 h-3 opacity-70" />}
      {nome}
      <span className="text-zinc-500 font-normal">{n}</span>
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {chip(null, 'Todos', total)}
        {subs.map((s) => chip(s.id, s.nome, contagem(s.id)))}
        {isAdmin && !edicao && (
          <button
            onClick={() => { setConfirmarExcluir(false); setEdicao({ modo: 'criar', nome: '' }); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-dashed border-zinc-600 text-[11px] font-semibold text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors"
          >
            <FolderPlus className="w-3 h-3" /> Subcategoria
          </button>
        )}
      </div>

      {isAdmin && edicao && (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={edicao.nome}
            onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEdicao(null); }}
            placeholder={edicao.modo === 'criar' ? 'Nome da subcategoria (ex.: Black Friday)' : 'Novo nome'}
            maxLength={40}
            className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
          />
          <button onClick={salvar} disabled={ocupado || !edicao.nome.trim()} title="Salvar" className="p-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-40">
            {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setEdicao(null)} title="Cancelar" className="p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isAdmin && atual && !edicao && (
        confirmarExcluir ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2">
            <p className="text-[11px] text-red-200 flex-1">
              Excluir a subcategoria <b>“{atual.nome}”</b>? As imagens não são apagadas, só voltam pra “Todos”.
            </p>
            <button onClick={excluir} disabled={ocupado} className="px-2 py-1 rounded-md bg-red-600 text-white text-[11px] font-bold disabled:opacity-40">
              {ocupado ? 'Excluindo...' : 'Excluir'}
            </button>
            <button onClick={() => setConfirmarExcluir(false)} className="px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 text-[11px] font-bold">Não</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setEdicao({ modo: 'renomear', nome: atual.nome })}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700 text-[11px] font-semibold text-zinc-400 hover:text-zinc-100"
            >
              <Pencil className="w-3 h-3" /> Renomear
            </button>
            <button
              onClick={() => setConfirmarExcluir(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700 text-[11px] font-semibold text-zinc-400 hover:text-red-300 hover:border-red-500/40"
            >
              <Trash2 className="w-3 h-3" /> Excluir subcategoria
            </button>
          </div>
        )
      )}
    </div>
  );
}

/** Atalhos das subcategorias embaixo do nome da classificação, na lista. */
export function SubcategoriasAtalhos({ subs, onAbrir }: { subs: Subcategoria[]; onAbrir: (id: string) => void }) {
  if (!subs.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {subs.map((sub) => (
        <button
          key={sub.id}
          onClick={() => onAbrir(sub.id)}
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
        >
          <Folder className="w-3 h-3 opacity-70" />
          {sub.nome}
        </button>
      ))}
    </div>
  );
}

/** Uma linha: título + "N temas · Ver tudo" + tira horizontal que desliza. */
function LinhaSub<T>({
  titulo,
  itens,
  rotulo,
  larguraCard,
  card,
  nome,
  onVerTudo,
}: {
  titulo: string;
  itens: T[];
  rotulo: [string, string];
  larguraCard: string;
  card: (item: T) => React.ReactNode;
  nome: (item: T) => string;
  onVerTudo?: () => void;
}) {
  const tiraRef = useRef<HTMLDivElement>(null);
  const deslizar = () => {
    const el = tiraRef.current;
    if (!el) return;
    const fim = el.scrollWidth - el.clientWidth - 4;
    if (el.scrollLeft >= fim) el.scrollTo({ left: 0, behavior: 'smooth' });
    else el.scrollBy({ left: Math.max(el.clientWidth * 0.8, 120), behavior: 'smooth' });
  };
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold text-zinc-100 truncate">{titulo}</h3>
        <div className="flex items-baseline gap-1 flex-shrink-0 text-[12px]">
          <span className="text-zinc-400">
            <b className="text-zinc-100">{itens.length}</b> {itens.length === 1 ? rotulo[0] : rotulo[1]}
          </span>
          {onVerTudo && (
            <>
              <span className="text-zinc-600">·</span>
              <button onClick={onVerTudo} className="font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
                Ver tudo
              </button>
            </>
          )}
        </div>
      </div>
      <div className="relative">
        <div
          ref={tiraRef}
          className="flex gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {itens.map((item, k) => (
            <div key={k} className={cn('flex-shrink-0 space-y-1', larguraCard)}>
              {card(item)}
              <p className="text-[11px] text-zinc-400 text-center truncate px-1" title={nome(item)}>{nome(item)}</p>
            </div>
          ))}
        </div>
        {itens.length > 2 && (
          <button
            onClick={deslizar}
            title="Deslizar pra ver mais"
            className="absolute right-1 top-[35%] -translate-y-1/2 w-8 h-8 rounded-full bg-zinc-900/90 border border-zinc-700 text-zinc-200 hover:text-emerald-300 hover:border-emerald-500/50 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** "Todos" com subcategorias: uma linha deslizante por subcategoria e, no fim, as soltas. */
export function GruposPorSubcategoria<T>({
  subs,
  itens,
  subDe,
  card,
  nome,
  rotulo,
  larguraCard,
  onAbrir,
}: {
  subs: Subcategoria[];
  itens: T[];
  subDe: (item: T) => string | null;
  card: (item: T) => React.ReactNode;
  nome: (item: T) => string;
  /** singular e plural, ex.: ['tema', 'temas'] */
  rotulo: [string, string];
  /** largura de cada card na tira (classe tailwind) */
  larguraCard: string;
  onAbrir: (id: string) => void;
}) {
  const soltos = itens.filter((i) => !subDe(i));
  return (
    <div className="space-y-6">
      {subs.map((sub) => {
        const lista = itens.filter((i) => subDe(i) === sub.id);
        if (!lista.length) return null;
        return (
          <LinhaSub
            key={sub.id}
            titulo={sub.nome}
            itens={lista}
            rotulo={rotulo}
            larguraCard={larguraCard}
            card={card}
            nome={nome}
            onVerTudo={() => onAbrir(sub.id)}
          />
        );
      })}
      {soltos.length > 0 && (
        <LinhaSub titulo="Sem subcategoria" itens={soltos} rotulo={rotulo} larguraCard={larguraCard} card={card} nome={nome} />
      )}
    </div>
  );
}

export function ModalMoverSub({
  subs,
  atual,
  ocupado,
  onEscolher,
  onCancelar,
}: {
  subs: Subcategoria[];
  atual: string | null;
  ocupado: boolean;
  onEscolher: (id: string | null) => void;
  onCancelar: () => void;
}) {
  const opcoes: { id: string | null; nome: string }[] = [{ id: null, nome: 'Sem subcategoria' }, ...subs];
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={onCancelar}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 w-full max-w-xs space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FolderInput className="w-5 h-5 text-emerald-500" />
          <h3 className="text-sm font-bold text-zinc-100 flex-1">Mover para</h3>
          {ocupado && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
        </div>
        {subs.length === 0 && (
          <p className="text-[11px] text-zinc-500">Crie uma subcategoria primeiro (botão “Subcategoria” no topo).</p>
        )}
        <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800 max-h-72 overflow-y-auto">
          {opcoes.map((o) => (
            <button
              key={o.id ?? '_solto'}
              disabled={ocupado}
              onClick={() => onEscolher(o.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors disabled:opacity-50',
                o.id === atual ? 'text-emerald-300 bg-emerald-500/10' : 'text-zinc-200 hover:bg-zinc-800',
              )}
            >
              <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
              <span className="flex-1 truncate">{o.nome}</span>
              {o.id === atual && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
        <button onClick={onCancelar} className="w-full px-3 py-1.5 border border-zinc-700 rounded-lg text-xs font-bold text-zinc-300 hover:bg-zinc-800">
          Cancelar
        </button>
      </div>
    </div>
  );
}
