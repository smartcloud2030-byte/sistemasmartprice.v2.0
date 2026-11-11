import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Loader2, Repeat, Trash2, Check, ImageOff, ChevronRight, ArrowLeft, Settings2, Search, X, FolderInput } from 'lucide-react';
import { toast } from 'sonner';
import {
  uploadBackgroundImage,
  listGalleryImages,
  deleteGalleryImage,
  listGalleryCategories,
  classificacoesDaBase,
  nomeClassificacao,
  GalleryImage,
} from '../../lib/gallery';
import { carregarVisibilidade, podeVerClassificacao } from '../../lib/galeriaVisibilidade';
import { useStore } from '../../store';
import { getProxyUrl, cn, normalizarBusca } from '../../lib/utils';
import { ElementoImagem } from './encarteProduto';
import ClassificacaoBar from './ClassificacaoBar';
import {
  MapaSubcategorias,
  Subcategoria,
  carregarSubcategorias,
  salvarSubcategorias,
  subsOrdenadas,
  subDoArquivo,
  definirSub,
} from '../../lib/temasSubcategorias';
import { SubcategoriasBarra, GruposPorSubcategoria, ModalMoverSub } from './SubcategoriasControles';

const PREVIA = 15; // até quantas imagens a tira horizontal carrega

interface GaleriaImagensTabProps {
  titulo: string;
  subtitulo: string;
  icon: React.ElementType;
  /** categoria-base da galeria — cada aba guarda suas imagens separadas das outras */
  categoria: string;
  /** elementos dessa categoria que já estão no encarte agora (pra marcar como ativos) */
  elementosAtivos: ElementoImagem[];
  onAdicionarImagem: (url: string, multiplo: boolean) => void;
  onRemoverDoEncarte: (url: string) => void;
}

/** Botão de upload de imagem pra uma classificação específica. */
function UploadImg({
  classif,
  ocupado,
  onArquivo,
}: {
  classif: string;
  ocupado: boolean;
  onArquivo: (file: File, classif: string) => void;
}) {
  return (
    <label
      title="Enviar imagem"
      className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-emerald-500/50 hover:text-emerald-500 transition-colors cursor-pointer"
    >
      {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={ocupado}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onArquivo(f, classif); }}
      />
    </label>
  );
}

/** Card de uma imagem — clicar adiciona ao encarte; ativa mostra "retirar". */
function ImgThumb({
  img,
  ativa,
  podeEditar,
  substituindo,
  onAdicionar,
  onRetirar,
  onReplace,
  onDelete,
  onMove,
}: {
  img: GalleryImage;
  ativa: boolean;
  podeEditar: boolean;
  substituindo: boolean;
  /** admin: mover pra uma subcategoria */
  onMove?: () => void;
  onAdicionar: () => void;
  onRetirar: () => void;
  onReplace: (file: File) => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onAdicionar}
      title="Adicionar ao encarte"
      className={cn(
        'group relative rounded-lg overflow-hidden border-2 aspect-square bg-zinc-800 transition-colors cursor-pointer',
        ativa ? 'border-emerald-500' : 'border-transparent hover:border-emerald-500',
      )}
    >
      <img src={getProxyUrl(img.url, { thumbnail: true })} className="w-full h-full object-contain" />

      {ativa && (
        <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        {ativa && (
          <button
            title="Retirar do encarte"
            onClick={(e) => { e.stopPropagation(); onRetirar(); }}
            className="flex items-center justify-center w-6 h-6 rounded bg-zinc-900/80 text-zinc-200 hover:text-amber-400"
          >
            <ImageOff className="w-3.5 h-3.5" />
          </button>
        )}
        {podeEditar && (
          <>
            <label
              title="Substituir"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center w-6 h-6 rounded bg-zinc-900/80 text-zinc-200 hover:text-emerald-400 cursor-pointer"
            >
              {substituindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Repeat className="w-3.5 h-3.5" />}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={substituindo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onReplace(file);
                }}
              />
            </label>
            {onMove && (
              <button
                title="Mover pra subcategoria"
                onClick={(e) => { e.stopPropagation(); onMove(); }}
                className="flex items-center justify-center w-6 h-6 rounded bg-zinc-900/80 text-zinc-200 hover:text-emerald-400"
              >
                <FolderInput className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              title="Apagar"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex items-center justify-center w-6 h-6 rounded bg-zinc-900/80 text-zinc-200 hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ModalApagarImg({
  ocupado,
  onCancelar,
  onConfirmar,
}: {
  ocupado: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3 text-red-500">
          <Trash2 className="w-6 h-6" />
          <h3 className="text-lg font-bold text-zinc-100">Apagar imagem?</h3>
        </div>
        <p className="text-sm text-zinc-400">Deseja realmente apagar essa imagem? Essa ação é irreversível.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancelar}
            className="flex-1 px-4 py-2 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-sm font-bold text-zinc-200"
          >
            Não
          </button>
          <button
            onClick={onConfirmar}
            disabled={ocupado}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold disabled:opacity-50"
          >
            {ocupado ? 'Apagando...' : 'Sim'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Uma linha da lista: nome + "Ver mais" + tira horizontal com seta que desliza. */
function LinhaClassificacaoImg({
  cat,
  base,
  imgs,
  urlsAtivas,
  isAdmin,
  substituindo,
  onAdicionar,
  onRetirar,
  onSubstituir,
  onApagar,
  onVerMais,
  subs,
  onAbrirSub,
}: {
  cat: string;
  base: string;
  imgs: GalleryImage[];
  urlsAtivas: Set<string>;
  isAdmin: boolean;
  substituindo: string | null;
  onAdicionar: (url: string) => void;
  onRetirar: (url: string) => void;
  onSubstituir: (img: GalleryImage, file: File, classif: string) => void;
  onApagar: (img: GalleryImage, classif: string) => void;
  onVerMais: (cat: string) => void;
  subs: Subcategoria[];
  onAbrirSub: (cat: string, id: string) => void;
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
        <h3 className="text-[13px] font-bold text-zinc-100 truncate">{nomeClassificacao(cat, base)}</h3>
        <button
          onClick={() => onVerMais(cat)}
          className="text-[12px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex-shrink-0"
        >
          Ver mais
        </button>
      </div>

      <div className="flex items-stretch gap-2">
        <div
          ref={tiraRef}
          className="flex-1 min-w-0 flex gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {imgs.length === 0 ? (
            <div className="w-[30%] flex-shrink-0 aspect-square rounded-lg border border-dashed border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600">
              vazia
            </div>
          ) : (
            imgs.slice(0, PREVIA).map((img) => (
              <div key={img.fullPath} className="w-[30%] flex-shrink-0">
                <ImgThumb
                  img={img}
                  ativa={urlsAtivas.has(img.url)}
                  podeEditar={isAdmin}
                  substituindo={substituindo === img.fullPath}
                  onAdicionar={() => { onAdicionar(img.url); toast.success('Imagem adicionada ao encarte!'); }}
                  onRetirar={() => onRetirar(img.url)}
                  onReplace={(file) => onSubstituir(img, file, cat)}
                  onDelete={() => onApagar(img, cat)}
                />
              </div>
            ))
          )}
        </div>
        <button
          onClick={deslizar}
          title="Deslizar pra ver mais"
          className="flex-shrink-0 self-center w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300 flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Aba genérica "enviar imagem + galeria + adicionar ao encarte como elemento
 * livre". Usada por Tags e Marca. Organizada por classificação: uma linha por
 * classificação (nome + tira horizontal com seta que desliza) e "Ver mais"
 * abre a classificação aqui na aba com as imagens inteiras.
 */
export default function GaleriaImagensTab({
  titulo,
  subtitulo,
  icon: Icon,
  categoria,
  elementosAtivos,
  onAdicionarImagem,
  onRemoverDoEncarte,
}: GaleriaImagensTabProps) {
  const { userRole, currentUser, allowedStores } = useStore();
  const isAdmin = userRole === 'admin';

  // Depende só de valores simples: a lista de lojas é regravada a cada
  // "loja online" (heartbeat/socket), e com objeto na dependência a aba
  // recarregava tudo sozinha de tempos em tempos.
  const cnpjUsuario = currentUser?.cnpj;
  const bandeiraUsuario = currentUser?.bandeira;
  const grupoUsuario = useMemo(() => {
    const nc = (cnpjUsuario || '').replace(/\D/g, '');
    return allowedStores.find((s) => (s.cnpj || '').replace(/\D/g, '') === nc)?.groupId;
  }, [cnpjUsuario, allowedStores]);
  const ctx = useMemo(
    () => ({ isAdmin, cnpj: cnpjUsuario, bandeira: bandeiraUsuario, grupoId: grupoUsuario }),
    [isAdmin, cnpjUsuario, bandeiraUsuario, grupoUsuario],
  );

  const urlsAtivas = useMemo(() => new Set(elementosAtivos.map((im) => im.url)), [elementosAtivos]);

  const [classifs, setClassifs] = useState<string[]>([]);
  const [imgsPor, setImgsPor] = useState<Record<string, GalleryImage[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [verMais, setVerMais] = useState<string | null>(null);
  const [gerenciar, setGerenciar] = useState(false);
  const [classifAdmin, setClassifAdmin] = useState(categoria);

  const [uploadAlvo, setUploadAlvo] = useState<string | null>(null);
  const [substituindo, setSubstituindo] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ img: GalleryImage; classif: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [busca, setBusca] = useState('');

  // subcategorias (etiquetas dentro de cada classificação; a imagem não muda de pasta)
  const [subsMapa, setSubsMapa] = useState<MapaSubcategorias>({});
  const [subAtiva, setSubAtiva] = useState<string | null>(null);
  const [moverImg, setMoverImg] = useState<{ img: GalleryImage; classif: string } | null>(null);
  const [movendo, setMovendo] = useState(false);

  const gravarSubs = async (novo: MapaSubcategorias) => {
    const antes = subsMapa;
    setSubsMapa(novo);
    try {
      await salvarSubcategorias(novo);
      return true;
    } catch {
      setSubsMapa(antes);
      toast.error('Não foi possível salvar as subcategorias.');
      return false;
    }
  };

  const nomeArquivo = (url: string) => decodeURIComponent(url.split('?')[0].split('/').pop() || '');

  const abrirVerMais = (cat: string | null, sub: string | null = null) => { setVerMais(cat); setSubAtiva(sub); };

  const confirmarMover = async (id: string | null) => {
    if (!moverImg || movendo) return;
    setMovendo(true);
    if (await gravarSubs(definirSub(subsMapa, moverImg.classif, moverImg.img.filename, id))) {
      setMoverImg(null);
      toast.success(id ? 'Imagem movida!' : 'Imagem tirada da subcategoria.');
    }
    setMovendo(false);
  };

  const carregarTudo = async () => {
    setCarregando(true);
    try {
      const [todas, mapa, subs] = await Promise.all([listGalleryCategories(), carregarVisibilidade(), carregarSubcategorias()]);
      setSubsMapa(subs);
      const visiveis = classificacoesDaBase(todas, categoria).filter(
        (c) => c === categoria || podeVerClassificacao(c, mapa, ctx),
      );
      const listas = await Promise.all(
        visiveis.map((c) => listGalleryImages(c).catch(() => [] as GalleryImage[])),
      );
      const mapaImgs: Record<string, GalleryImage[]> = {};
      visiveis.forEach((c, i) => { mapaImgs[c] = listas[i]; });
      setClassifs(visiveis);
      setImgsPor(mapaImgs);
    } catch {
      toast.error('Não foi possível carregar as imagens.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { setVerMais(null); setSubAtiva(null); setClassifAdmin(categoria); setBusca(''); }, [categoria]);
  useEffect(() => { carregarTudo(); /* eslint-disable-next-line */ }, [categoria, ctx]);

  const handleUpload = async (file: File, classif: string, subId: string | null = null) => {
    setUploadAlvo(classif);
    try {
      const { url } = await uploadBackgroundImage(file, classif);
      if (subId) {
        const atual = await carregarSubcategorias();
        await salvarSubcategorias(definirSub(atual, classif, nomeArquivo(url), subId)).catch(() =>
          toast.error('Imagem enviada, mas não entrou na subcategoria.'),
        );
      }
      await carregarTudo();
      toast.success('Imagem enviada!');
    } catch {
      toast.error('Falha ao enviar a imagem. Tente novamente.');
    } finally {
      setUploadAlvo(null);
    }
  };

  const handleSubstituir = async (img: GalleryImage, file: File, classif: string) => {
    setSubstituindo(img.fullPath);
    try {
      const { url } = await uploadBackgroundImage(file, classif);
      await deleteGalleryImage(img.url);
      const sub = subDoArquivo(subsMapa, classif, img.filename);
      if (sub) {
        const semAntigo = definirSub(subsMapa, classif, img.filename, null);
        await salvarSubcategorias(definirSub(semAntigo, classif, nomeArquivo(url), sub)).catch(() => {});
      }
      await carregarTudo();
      toast.success('Imagem substituída!');
    } catch {
      toast.error('Falha ao substituir a imagem. Tente novamente.');
    } finally {
      setSubstituindo(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteGalleryImage(pendingDelete.img.url);
      if (subDoArquivo(subsMapa, pendingDelete.classif, pendingDelete.img.filename)) {
        await salvarSubcategorias(definirSub(subsMapa, pendingDelete.classif, pendingDelete.img.filename, null)).catch(() => {});
      }
      await carregarTudo();
      toast.success('Imagem apagada!');
      setPendingDelete(null);
    } catch {
      toast.error('Falha ao apagar a imagem. Tente novamente.');
    } finally {
      setIsDeleting(false);
    }
  };

  const buscaNorm = useMemo(() => normalizarBusca(busca), [busca]);
  const resultadosBusca = useMemo(() => {
    if (!buscaNorm) return [];
    const achados: { img: GalleryImage; cat: string }[] = [];
    classifs.forEach((cat) => {
      const nomeCat = normalizarBusca(nomeClassificacao(cat, categoria));
      const subs = subsOrdenadas(subsMapa, cat);
      (imgsPor[cat] ?? []).forEach((img) => {
        const alvo = normalizarBusca(img.displayName || '');
        const subId = subDoArquivo(subsMapa, cat, img.filename);
        const nomeSub = subId ? normalizarBusca(subs.find((x) => x.id === subId)?.nome || '') : '';
        if (alvo.includes(buscaNorm) || nomeCat.includes(buscaNorm) || (nomeSub && nomeSub.includes(buscaNorm))) achados.push({ img, cat });
      });
    });
    return achados;
  }, [buscaNorm, classifs, imgsPor, categoria, subsMapa]);

  // ── "Ver mais": a classificação abre aqui, com as imagens inteiras ──
  if (verMais) {
    const imgs = imgsPor[verMais] ?? [];
    const subs = subsOrdenadas(subsMapa, verMais);
    const subDe = (img: GalleryImage) => subDoArquivo(subsMapa, verMais, img.filename);
    const subAtual = subs.find((x) => x.id === subAtiva) ?? null;

    const card = (img: GalleryImage) => (
      <ImgThumb
        key={img.fullPath}
        img={img}
        ativa={urlsAtivas.has(img.url)}
        podeEditar={isAdmin}
        substituindo={substituindo === img.fullPath}
        onAdicionar={() => { onAdicionarImagem(img.url, true); toast.success('Imagem adicionada ao encarte!'); }}
        onRetirar={() => onRemoverDoEncarte(img.url)}
        onReplace={(file) => handleSubstituir(img, file, verMais)}
        onDelete={() => setPendingDelete({ img, classif: verMais })}
        onMove={isAdmin ? () => setMoverImg({ img, classif: verMais }) : undefined}
      />
    );

    const grade = (lista: GalleryImage[]) => (
      <div className="grid grid-cols-3 gap-2">{lista.map(card)}</div>
    );

    let corpo: React.ReactNode;
    if (subAtual) {
      const lista = imgs.filter((i) => subDe(i) === subAtual.id);
      corpo = lista.length === 0
        ? <p className="text-xs text-zinc-500 text-center py-12">Nenhuma imagem em “{subAtual.nome}”. Envie uma pelo botão de upload{isAdmin ? ' ou mova uma imagem pra cá' : ''}.</p>
        : grade(lista);
    } else if (imgs.length === 0) {
      corpo = <p className="text-xs text-zinc-500 text-center py-12">Nenhuma imagem nesta classificação ainda.</p>;
    } else if (subs.length === 0) {
      corpo = grade(imgs);
    } else {
      corpo = (
        <GruposPorSubcategoria
          subs={subs}
          itens={imgs}
          subDe={subDe}
          card={card}
          chave={(img) => img.fullPath}
          larguraCard="w-[30%]"
          onAbrir={setSubAtiva}
        />
      );
    }

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => (subAtiva ? setSubAtiva(null) : abrirVerMais(null))}
            title={subAtiva ? 'Voltar pra todos' : 'Voltar'}
            className="p-1.5 -ml-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-black uppercase tracking-widest flex-grow truncate">
            {nomeClassificacao(verMais, categoria)}
            {subAtual && <span className="text-zinc-500"> / {subAtual.nome}</span>}
          </h2>
          <UploadImg
            classif={verMais}
            ocupado={uploadAlvo === verMais}
            onArquivo={(file, classif) => handleUpload(file, classif, subAtual?.id ?? null)}
          />
        </div>

        <SubcategoriasBarra
          key={verMais}
          classif={verMais}
          mapa={subsMapa}
          ativa={subAtiva}
          onMudar={setSubAtiva}
          contagem={(id) => imgs.filter((i) => subDe(i) === id).length}
          total={imgs.length}
          isAdmin={isAdmin}
          gravar={gravarSubs}
        />

        {corpo}

        {pendingDelete && (
          <ModalApagarImg ocupado={isDeleting} onCancelar={() => setPendingDelete(null)} onConfirmar={handleConfirmDelete} />
        )}
        {moverImg && (
          <ModalMoverSub
            subs={subs}
            atual={subDoArquivo(subsMapa, moverImg.classif, moverImg.img.filename)}
            ocupado={movendo}
            onEscolher={confirmarMover}
            onCancelar={() => setMoverImg(null)}
          />
        )}
      </div>
    );
  }

  // ── Lista: uma linha por classificação ─────────────────────────────
  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-emerald-500" />
        <div className="flex-grow min-w-0">
          <h2 className="text-sm font-black uppercase tracking-widest">{titulo}</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">{subtitulo}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar ${titulo.toLowerCase()} por nome...`}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-8 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50"
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {carregando ? (
        <p className="text-xs text-zinc-500 text-center py-10">Carregando...</p>
      ) : buscaNorm ? (
        resultadosBusca.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-10">Nenhuma imagem encontrada pra "{busca}".</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {resultadosBusca.map(({ img, cat }) => (
              <ImgThumb
                key={img.fullPath}
                img={img}
                ativa={urlsAtivas.has(img.url)}
                podeEditar={isAdmin}
                substituindo={substituindo === img.fullPath}
                onAdicionar={() => { onAdicionarImagem(img.url, true); toast.success('Imagem adicionada ao encarte!'); }}
                onRetirar={() => onRemoverDoEncarte(img.url)}
                onReplace={(file) => handleSubstituir(img, file, cat)}
                onDelete={() => setPendingDelete({ img, classif: cat })}
              />
            ))}
          </div>
        )
      ) : classifs.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-10">Nenhuma imagem ainda. Envie a primeira abaixo.</p>
      ) : (
        <div className="space-y-6">
          {classifs.map((cat) => (
            <LinhaClassificacaoImg
              key={cat}
              cat={cat}
              base={categoria}
              imgs={imgsPor[cat] ?? []}
              urlsAtivas={urlsAtivas}
              isAdmin={isAdmin}
              substituindo={substituindo}
              onAdicionar={(url) => onAdicionarImagem(url, true)}
              onRetirar={onRemoverDoEncarte}
              onSubstituir={handleSubstituir}
              onApagar={(img, classif) => setPendingDelete({ img, classif })}
              onVerMais={(c) => abrirVerMais(c)}
              subs={subsOrdenadas(subsMapa, cat)}
              onAbrirSub={(c, id) => abrirVerMais(c, id)}
            />
          ))}
        </div>
      )}

      {/* Enviar nova imagem (vai pra classificação "Geral") */}
      <div className="flex items-center gap-2 pt-1">
        <UploadImg classif={categoria} ocupado={uploadAlvo === categoria} onArquivo={handleUpload} />
        <span className="text-[11px] text-zinc-500">Envia pra “Geral”. Pra outra classificação, abra ela em “Ver mais”.</span>
      </div>

      {/* Admin: criar / renomear / excluir / visibilidade das classificações */}
      {isAdmin && (
        <div className="pt-2 border-t border-zinc-800">
          <button
            onClick={() => setGerenciar((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Gerenciar classificações
            <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', gerenciar && 'rotate-90')} />
          </button>
          {gerenciar && (
            <div className="mt-3">
              <ClassificacaoBar
                base={categoria}
                ativa={classifAdmin}
                onMudar={(c) => { setClassifAdmin(c); carregarTudo(); }}
                onEstruturaMudou={carregarTudo}
              />
            </div>
          )}
        </div>
      )}

      {pendingDelete && (
        <ModalApagarImg ocupado={isDeleting} onCancelar={() => setPendingDelete(null)} onConfirmar={handleConfirmDelete} />
      )}
    </div>
  );
}
