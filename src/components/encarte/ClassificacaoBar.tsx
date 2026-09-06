import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Loader2, FolderTree, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../../store';
import {
  listGalleryCategories,
  createGalleryCategory,
  renameGalleryCategory,
  deleteGalleryCategory,
  classificacoesDaBase,
  nomeClassificacao,
  categoriaDaClassificacao,
  slugifyCategory,
} from '../../lib/gallery';
import {
  MapaVisibilidade,
  VisibilidadeClassificacao,
  VIS_PADRAO,
  carregarVisibilidade,
  salvarVisibilidade,
  normalizarMapa,
  podeVerClassificacao,
} from '../../lib/galeriaVisibilidade';
import VisibilidadeEditor from './VisibilidadeEditor';

interface ClassificacaoBarProps {
  /** categoria-base no MinIO (ex.: 'encarte-temas') */
  base: string;
  /** categoria ativa no momento (a base = classificação "Geral") */
  ativa: string;
  onMudar: (categoria: string) => void;
  /** avisa o pai que a estrutura mudou (renomear/excluir) pra recarregar as imagens */
  onEstruturaMudou: () => void;
}

/**
 * Barra de classificações (pastas) de uma aba da galeria. Todo mundo enxerga
 * e troca de classificação; só o admin cria, renomeia, exclui e define quem
 * pode ver cada classificação (todos, ou usuário/bandeira/grupo).
 */
export default function ClassificacaoBar({ base, ativa, onMudar, onEstruturaMudou }: ClassificacaoBarProps) {
  const { userRole, currentUser, flags, userGroups, allowedStores } = useStore();
  const isAdmin = userRole === 'admin';

  const ctx = useMemo(() => {
    const nc = (currentUser?.cnpj || '').replace(/\D/g, '');
    const loja = allowedStores.find((s) => (s.cnpj || '').replace(/\D/g, '') === nc);
    return { isAdmin, cnpj: currentUser?.cnpj, bandeira: currentUser?.bandeira, grupoId: loja?.groupId };
  }, [isAdmin, currentUser, allowedStores]);

  const lojasOpts = useMemo(
    () => allowedStores.map((s) => ({ cnpj: s.cnpj, bandeira: s.bandeira })),
    [allowedStores],
  );

  const [categorias, setCategorias] = useState<string[]>([base]);
  const [mapa, setMapa] = useState<MapaVisibilidade>({});
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState('');
  const [visNova, setVisNova] = useState<VisibilidadeClassificacao>(VIS_PADRAO);
  const [renomeando, setRenomeando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState('');
  const [editandoVis, setEditandoVis] = useState(false);
  const [visEdicao, setVisEdicao] = useState<VisibilidadeClassificacao>(VIS_PADRAO);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const inputNovoRef = useRef<HTMLInputElement>(null);
  const inputEdicaoRef = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    try {
      const [todas, m] = await Promise.all([listGalleryCategories(), carregarVisibilidade()]);
      setCategorias(classificacoesDaBase(todas, base));
      setMapa(m);
    } catch {
      setCategorias([base]);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [base]);
  useEffect(() => { if (criando) inputNovoRef.current?.focus(); }, [criando]);
  useEffect(() => { if (renomeando) inputEdicaoRef.current?.focus(); }, [renomeando]);

  // Classificações que o usuário atual pode ver (admin vê todas).
  const visiveis = useMemo(
    () => categorias.filter((c) => c === base || podeVerClassificacao(c, mapa, ctx)),
    [categorias, mapa, ctx, base],
  );

  // Usuário comum parado numa classificação que deixou de ser visível → volta pra "Geral".
  useEffect(() => {
    if (!isAdmin && ativa !== base && !visiveis.includes(ativa)) onMudar(base);
  }, [isAdmin, ativa, base, visiveis, onMudar]);

  const fecharTudo = () => {
    setCriando(false); setNomeNovo(''); setVisNova(VIS_PADRAO);
    setRenomeando(false); setNomeEdicao('');
    setEditandoVis(false);
    setConfirmandoExclusao(false);
  };

  const criar = async () => {
    const nome = nomeNovo.trim();
    if (!nome || ocupado) return;
    if (!slugifyCategory(nome)) { toast.error('Use letras ou números no nome.'); return; }
    const categoria = categoriaDaClassificacao(base, nome);
    if (categorias.includes(categoria)) {
      toast.error('Já existe uma classificação com esse nome.');
      return;
    }
    setOcupado(true);
    try {
      await createGalleryCategory(categoria);
      if (visNova.modo === 'restrito') {
        const novoMapa = normalizarMapa({ ...mapa, [categoria]: visNova });
        await salvarVisibilidade(novoMapa);
      }
      await carregar();
      fecharTudo();
      onMudar(categoria);
      toast.success('Classificação criada!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar a classificação.');
    } finally {
      setOcupado(false);
    }
  };

  const renomear = async () => {
    const nome = nomeEdicao.trim();
    if (!nome || ocupado || ativa === base) return;
    if (!slugifyCategory(nome)) { toast.error('Use letras ou números no nome.'); return; }
    const alvo = categoriaDaClassificacao(base, nome);
    if (alvo === ativa) { fecharTudo(); return; }
    if (categorias.includes(alvo)) {
      toast.error('Já existe uma classificação com esse nome.');
      return;
    }
    setOcupado(true);
    try {
      await renameGalleryCategory(ativa, alvo);
      if (mapa[ativa]) {
        const semAntiga: MapaVisibilidade = Object.fromEntries(
          Object.entries(mapa).filter(([k]) => k !== ativa),
        );
        await salvarVisibilidade(normalizarMapa({ ...semAntiga, [alvo]: mapa[ativa] }));
      }
      await carregar();
      fecharTudo();
      onMudar(alvo);
      onEstruturaMudou();
      toast.success('Classificação renomeada!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao renomear a classificação.');
    } finally {
      setOcupado(false);
    }
  };

  const salvarVis = async () => {
    if (ocupado || ativa === base) return;
    setOcupado(true);
    try {
      await salvarVisibilidade(normalizarMapa({ ...mapa, [ativa]: visEdicao }));
      await carregar();
      fecharTudo();
      toast.success('Visibilidade salva!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a visibilidade.');
    } finally {
      setOcupado(false);
    }
  };

  const excluir = async () => {
    if (ocupado || ativa === base) return;
    setOcupado(true);
    try {
      await deleteGalleryCategory(ativa);
      if (mapa[ativa]) {
        const resto: MapaVisibilidade = Object.fromEntries(
          Object.entries(mapa).filter(([k]) => k !== ativa),
        );
        await salvarVisibilidade(normalizarMapa(resto));
      }
      await carregar();
      fecharTudo();
      onMudar(base);
      onEstruturaMudou();
      toast.success('Classificação excluída!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir a classificação.');
    } finally {
      setOcupado(false);
    }
  };

  const restritaAtiva = ativa !== base && mapa[ativa]?.modo === 'restrito';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <FolderTree className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Classificações</span>
        {carregando && <Loader2 className="w-3 h-3 animate-spin text-zinc-600" />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visiveis.map((cat) => {
          const restrita = cat !== base && mapa[cat]?.modo === 'restrito';
          return (
            <button
              key={cat}
              onClick={() => { fecharTudo(); onMudar(cat); }}
              title={restrita ? 'Restrita a usuários/bandeiras/grupos' : undefined}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors flex items-center gap-1 ${
                cat === ativa
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
              }`}
            >
              {restrita && <Eye className="w-2.5 h-2.5 opacity-70" />}
              {nomeClassificacao(cat, base)}
            </button>
          );
        })}

        {isAdmin && !criando && (
          <button
            onClick={() => { fecharTudo(); setCriando(true); }}
            title="Nova classificação"
            className="px-2 py-1 rounded-full text-[11px] font-semibold border border-dashed border-zinc-600 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> nova
          </button>
        )}
      </div>

      {isAdmin && criando && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputNovoRef}
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') criar(); if (e.key === 'Escape') fecharTudo(); }}
              placeholder="Nome da classificação"
              maxLength={40}
              className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
            />
            <button onClick={criar} disabled={ocupado || !nomeNovo.trim()} title="Criar" className="p-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-40">
              {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={fecharTudo} title="Cancelar" className="p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <VisibilidadeEditor
            value={visNova}
            onChange={setVisNova}
            bandeiras={flags}
            grupos={userGroups}
            lojas={lojasOpts}
          />
        </div>
      )}

      {isAdmin && ativa !== base && !criando && (
        renomeando ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputEdicaoRef}
              value={nomeEdicao}
              onChange={(e) => setNomeEdicao(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') renomear(); if (e.key === 'Escape') fecharTudo(); }}
              placeholder="Novo nome"
              maxLength={40}
              className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
            />
            <button onClick={renomear} disabled={ocupado || !nomeEdicao.trim()} title="Salvar" className="p-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-40">
              {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={fecharTudo} title="Cancelar" className="p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : editandoVis ? (
          <div className="space-y-2">
            <VisibilidadeEditor
              value={visEdicao}
              onChange={setVisEdicao}
              bandeiras={flags}
              grupos={userGroups}
              lojas={lojasOpts}
            />
            <div className="flex items-center gap-1.5">
              <button onClick={salvarVis} disabled={ocupado} className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-40">
                {ocupado ? 'Salvando...' : 'Salvar visibilidade'}
              </button>
              <button onClick={fecharTudo} className="px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300 text-[11px] font-bold">Cancelar</button>
            </div>
          </div>
        ) : confirmandoExclusao ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2">
            <p className="text-[11px] text-red-200 flex-1">
              Excluir <b>“{nomeClassificacao(ativa, base)}”</b> e todas as imagens dela?
            </p>
            <button onClick={excluir} disabled={ocupado} className="px-2 py-1 rounded-md bg-red-600 text-white text-[11px] font-bold disabled:opacity-40">
              {ocupado ? 'Excluindo...' : 'Excluir'}
            </button>
            <button onClick={fecharTudo} className="px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 text-[11px] font-bold">Não</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => { setNomeEdicao(nomeClassificacao(ativa, base)); setRenomeando(true); }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700 text-[11px] font-semibold text-zinc-400 hover:text-zinc-100"
            >
              <Pencil className="w-3 h-3" /> Renomear
            </button>
            <button
              onClick={() => { setVisEdicao(mapa[ativa] ?? VIS_PADRAO); setEditandoVis(true); }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold ${
                restritaAtiva
                  ? 'border-emerald-500/40 text-emerald-300'
                  : 'border-zinc-700 text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Eye className="w-3 h-3" /> {restritaAtiva ? 'Visibilidade: restrita' : 'Visibilidade: todos'}
            </button>
            <button
              onClick={() => setConfirmandoExclusao(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700 text-[11px] font-semibold text-zinc-400 hover:text-red-300 hover:border-red-500/40"
            >
              <Trash2 className="w-3 h-3" /> Excluir
            </button>
          </div>
        )
      )}
    </div>
  );
}
