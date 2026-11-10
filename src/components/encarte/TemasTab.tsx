import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Upload, Check, Image, Ban, Repeat, Trash2, Loader2, ChevronRight, ArrowLeft, Settings2, Search, X, FolderInput, FolderPlus, Pencil, Folder } from 'lucide-react';
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
import ClassificacaoBar from './ClassificacaoBar';
import {
  MapaSubcategorias,
  Subcategoria,
  carregarSubcategorias,
  salvarSubcategorias,
  subsOrdenadas,
  subDoArquivo,
  criarSub,
  renomearSub,
  excluirSub,
  definirSub,
} from '../../lib/temasSubcategorias';

const CATEGORIA = 'encarte-temas';
const PREVIA = 12; // até quantos temas a tira horizontal carrega

interface TemasTabProps {
  selecionada: string | null;
  onSelecionar: (url: string) => void;
}

/** Botão de upload de tema pra uma classificação específica. */
function UploadTema({
  classif,
  ocupado,
  onArquivo,
  className,
}: {
  classif: string;
  ocupado: boolean;
  onArquivo: (file: File, classif: string) => void;
  className?: string;
}) {
  return (
    <label
      title="Enviar novo tema"
      className={cn(
        'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-emerald-500/50 hover:text-emerald-500 transition-colors cursor-pointer',
        className,
      )}
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

/** Card de um tema — usado na tira horizontal e na grade da classificação. */
function TemaThumb({
  img,
  ativa,
  podeEditar,
  substituindo,
  ajuste = 'cover',
  onSelect,
  onReplace,
  onDelete,
  onMove,
}: {
  img: GalleryImage;
  ativa: boolean;
  podeEditar: boolean;
  substituindo: boolean;
  /** 'cover' preenche o quadro (tira); 'contain' mostra a imagem inteira (grade) */
  ajuste?: 'cover' | 'contain';
  onSelect: () => void;
  onReplace: (file: File) => void;
  onDelete: () => void;
  /** admin: mover o tema pra uma subcategoria */
  onMove?: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative rounded-lg overflow-hidden border-2 aspect-[16/10] transition-colors cursor-pointer',
        ajuste === 'contain' ? 'bg-zinc-900' : 'bg-zinc-800',
        ativa ? 'border-emerald-500' : 'border-transparent hover:border-zinc-600',
      )}
    >
      <img
        src={getProxyUrl(img.url, { thumbnail: true })}
        className={cn('w-full h-full', ajuste === 'contain' ? 'object-contain' : 'object-cover object-top')}
      />
      {ativa && (
        <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}

      {podeEditar && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1.5 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
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
        </div>
      )}
    </div>
  );
}

function ModalApagarTema({
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
          <h3 className="text-lg font-bold text-zinc-100">Apagar tema?</h3>
        </div>
        <p className="text-sm text-zinc-400">Deseja realmente apagar esse tema? Essa ação é irreversível.</p>
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

function ModalMoverTema({
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
          <h3 className="text-sm font-bold text-zinc-100 flex-1">Mover tema para</h3>
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

/** Uma linha da lista: nome + "Ver mais" + tira horizontal com seta que desliza. */
function LinhaClassificacao({
  cat,
  imgs,
  selecionada,
  isAdmin,
  substituindo,
  uploadAlvo,
  onSelecionar,
  onSubstituir,
  onApagar,
  onVerMais,
  subs,
  onAbrirSub,
}: {
  cat: string;
  imgs: GalleryImage[];
  selecionada: string | null;
  isAdmin: boolean;
  substituindo: string | null;
  uploadAlvo: string | null;
  onSelecionar: (url: string) => void;
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
    if (el.scrollLeft >= fim) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      el.scrollBy({ left: Math.max(el.clientWidth * 0.8, 120), behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold text-zinc-100 truncate">{nomeClassificacao(cat, CATEGORIA)}</h3>
        <button
          onClick={() => onVerMais(cat)}
          className="text-[12px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex-shrink-0"
        >
          Ver mais
        </button>
      </div>

      {subs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {subs.map((sub) => (
            <button
              key={sub.id}
              onClick={() => onAbrirSub(cat, sub.id)}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
            >
              <Folder className="w-3 h-3 opacity-70" />
              {sub.nome}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-stretch gap-2">
        <div
          ref={tiraRef}
          className="flex-1 min-w-0 flex gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {imgs.length === 0 ? (
            <div className="w-[44%] flex-shrink-0 aspect-[16/10] rounded-lg border border-dashed border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600">
              vazia
            </div>
          ) : (
            imgs.slice(0, PREVIA).map((img) => (
              <div key={img.fullPath} className="w-[44%] flex-shrink-0">
                <TemaThumb
                  img={img}
                  ativa={selecionada === img.url}
                  podeEditar={isAdmin}
                  substituindo={substituindo === img.fullPath}
                  onSelect={() => onSelecionar(img.url)}
                  onReplace={(file) => onSubstituir(img, file, cat)}
                  onDelete={() => onApagar(img, cat)}
                />
              </div>
            ))
          )}
        </div>
        <button
          onClick={deslizar}
          title="Deslizar pra ver mais temas"
          className="flex-shrink-0 self-center w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300 flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function TemasTab({ selecionada, onSelecionar }: TemasTabProps) {
  const { userRole, currentUser, allowedStores } = useStore();
  const isAdmin = userRole === 'admin';

  const ctx = useMemo(() => {
    const nc = (currentUser?.cnpj || '').replace(/\D/g, '');
    const loja = allowedStores.find((s) => (s.cnpj || '').replace(/\D/g, '') === nc);
    return { isAdmin, cnpj: currentUser?.cnpj, bandeira: currentUser?.bandeira, grupoId: loja?.groupId };
  }, [isAdmin, currentUser, allowedStores]);

  const [classifs, setClassifs] = useState<string[]>([]);
  const [imgsPor, setImgsPor] = useState<Record<string, GalleryImage[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [verMais, setVerMais] = useState<string | null>(null); // classificação aberta na aba (imagens inteiras)
  const [gerenciar, setGerenciar] = useState(false);
  const [classifAdmin, setClassifAdmin] = useState(CATEGORIA);
  const [busca, setBusca] = useState('');

  const [uploadAlvo, setUploadAlvo] = useState<string | null>(null); // classificação recebendo upload agora
  const [substituindo, setSubstituindo] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ img: GalleryImage; classif: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // subcategorias (etiquetas dentro de cada classificação)
  const [subsMapa, setSubsMapa] = useState<MapaSubcategorias>({});
  const [subAtiva, setSubAtiva] = useState<string | null>(null); // null = "Todos" no "Ver mais"
  const [subEdicao, setSubEdicao] = useState<null | { modo: 'criar' | 'renomear'; nome: string }>(null);
  const [confirmarExcluirSub, setConfirmarExcluirSub] = useState(false);
  const [moverTema, setMoverTema] = useState<{ img: GalleryImage; classif: string } | null>(null);
  const [salvandoSub, setSalvandoSub] = useState(false);

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

  const carregarTudo = async () => {
    setCarregando(true);
    try {
      const [todas, mapa, subs] = await Promise.all([listGalleryCategories(), carregarVisibilidade(), carregarSubcategorias()]);
      setSubsMapa(subs);
      const visiveis = classificacoesDaBase(todas, CATEGORIA).filter(
        (c) => c === CATEGORIA || podeVerClassificacao(c, mapa, ctx),
      );
      const listas = await Promise.all(
        visiveis.map((c) => listGalleryImages(c).catch(() => [] as GalleryImage[])),
      );
      const mapaImgs: Record<string, GalleryImage[]> = {};
      visiveis.forEach((c, i) => { mapaImgs[c] = listas[i]; });
      setClassifs(visiveis);
      setImgsPor(mapaImgs);
    } catch {
      toast.error('Não foi possível carregar os temas.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregarTudo(); /* eslint-disable-next-line */ }, [ctx]);

  const handleUpload = async (file: File, classif: string, subId: string | null = null) => {
    setUploadAlvo(classif);
    try {
      const { url } = await uploadBackgroundImage(file, classif);
      if (subId) {
        const atual = await carregarSubcategorias();
        await salvarSubcategorias(definirSub(atual, classif, nomeArquivo(url), subId)).catch(() =>
          toast.error('Tema enviado, mas não entrou na subcategoria.'),
        );
      }
      await carregarTudo();
      onSelecionar(url);
      toast.success('Tema enviado!');
    } catch {
      toast.error('Falha ao enviar o tema. Tente novamente.');
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
      if (selecionada === img.url) onSelecionar(url);
      toast.success('Tema substituído!');
    } catch {
      toast.error('Falha ao substituir o tema. Tente novamente.');
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
      if (selecionada === pendingDelete.img.url) onSelecionar('');
      await carregarTudo();
      toast.success('Tema apagado!');
      setPendingDelete(null);
    } catch {
      toast.error('Falha ao apagar o tema. Tente novamente.');
    } finally {
      setIsDeleting(false);
    }
  };

  const buscaNorm = useMemo(() => normalizarBusca(busca), [busca]);
  const resultadosBusca = useMemo(() => {
    if (!buscaNorm) return [];
    const achados: { img: GalleryImage; cat: string }[] = [];
    classifs.forEach((cat) => {
      const nomeCat = normalizarBusca(nomeClassificacao(cat, CATEGORIA));
      const subs = subsOrdenadas(subsMapa, cat);
      (imgsPor[cat] ?? []).forEach((img) => {
        const alvo = normalizarBusca(img.displayName || '');
        const subId = subDoArquivo(subsMapa, cat, img.filename);
        const nomeSub = subId ? normalizarBusca(subs.find((x) => x.id === subId)?.nome || '') : '';
        if (alvo.includes(buscaNorm) || nomeCat.includes(buscaNorm) || (nomeSub && nomeSub.includes(buscaNorm))) achados.push({ img, cat });
      });
    });
    return achados;
  }, [buscaNorm, classifs, imgsPor, subsMapa]);

  const abrirVerMais = (cat: string | null, sub: string | null = null) => {
    setVerMais(cat);
    setSubAtiva(sub);
    setSubEdicao(null);
    setConfirmarExcluirSub(false);
  };

  const salvarSubEdicao = async () => {
    if (!verMais || !subEdicao || salvandoSub) return;
    const nome = subEdicao.nome.trim().slice(0, 40);
    if (!nome) return;
    const existentes = subsOrdenadas(subsMapa, verMais);
    const repetido = existentes.some(
      (x) => normalizarBusca(x.nome) === normalizarBusca(nome) && !(subEdicao.modo === 'renomear' && x.id === subAtiva),
    );
    if (repetido) { toast.error('Já existe uma subcategoria com esse nome.'); return; }
    setSalvandoSub(true);
    if (subEdicao.modo === 'criar') {
      const { mapa, id } = criarSub(subsMapa, verMais, nome);
      if (await gravarSubs(mapa)) { setSubAtiva(id); setSubEdicao(null); toast.success('Subcategoria criada!'); }
    } else if (subAtiva) {
      if (await gravarSubs(renomearSub(subsMapa, verMais, subAtiva, nome))) { setSubEdicao(null); toast.success('Subcategoria renomeada!'); }
    }
    setSalvandoSub(false);
  };

  const excluirSubAtiva = async () => {
    if (!verMais || !subAtiva || salvandoSub) return;
    setSalvandoSub(true);
    if (await gravarSubs(excluirSub(subsMapa, verMais, subAtiva))) {
      setSubAtiva(null);
      setConfirmarExcluirSub(false);
      toast.success('Subcategoria excluída. Os temas dela continuam em “Todos”.');
    }
    setSalvandoSub(false);
  };

  const confirmarMover = async (id: string | null) => {
    if (!moverTema || salvandoSub) return;
    setSalvandoSub(true);
    if (await gravarSubs(definirSub(subsMapa, moverTema.classif, moverTema.img.filename, id))) {
      setMoverTema(null);
      toast.success(id ? 'Tema movido!' : 'Tema tirado da subcategoria.');
    }
    setSalvandoSub(false);
  };

  // ── "Ver mais": a classificação abre aqui na aba, com as imagens inteiras ──
  if (verMais) {
    const imgs = imgsPor[verMais] ?? [];
    const subs = subsOrdenadas(subsMapa, verMais);
    const subDe = (img: GalleryImage) => subDoArquivo(subsMapa, verMais, img.filename);
    const contagem = (id: string | null) => imgs.filter((i) => subDe(i) === id).length;
    const subAtual = subs.find((x) => x.id === subAtiva) ?? null;

    const grade = (lista: GalleryImage[]) => (
      <div className="grid grid-cols-2 gap-2">
        {lista.map((img) => (
          <TemaThumb
            key={img.fullPath}
            img={img}
            ativa={selecionada === img.url}
            podeEditar={isAdmin}
            substituindo={substituindo === img.fullPath}
            ajuste="contain"
            onSelect={() => onSelecionar(img.url)}
            onReplace={(file) => handleSubstituir(img, file, verMais)}
            onDelete={() => setPendingDelete({ img, classif: verMais })}
            onMove={isAdmin ? () => setMoverTema({ img, classif: verMais }) : undefined}
          />
        ))}
      </div>
    );

    const chip = (id: string | null, nome: string, n: number) => (
      <button
        key={id ?? '_todos'}
        onClick={() => { setSubAtiva(id); setSubEdicao(null); setConfirmarExcluirSub(false); }}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors',
          subAtiva === id
            ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
            : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600',
        )}
      >
        {id && <Folder className="w-3 h-3 opacity-70" />}
        {nome}
        <span className="text-zinc-500 font-normal">{n}</span>
      </button>
    );

    let corpo: ReactNode;
    if (subAtual) {
      const lista = imgs.filter((i) => subDe(i) === subAtual.id);
      corpo = lista.length === 0
        ? <p className="text-xs text-zinc-500 text-center py-12">Nenhum tema em “{subAtual.nome}”. Envie um pelo botão de upload{isAdmin ? ' ou mova um tema pra cá' : ''}.</p>
        : grade(lista);
    } else if (imgs.length === 0) {
      corpo = <p className="text-xs text-zinc-500 text-center py-12">Nenhum tema nesta classificação ainda.</p>;
    } else if (subs.length === 0) {
      corpo = grade(imgs);
    } else {
      const soltos = imgs.filter((i) => !subDe(i));
      corpo = (
        <div className="space-y-5">
          {subs.map((sub) => {
            const lista = imgs.filter((i) => subDe(i) === sub.id);
            if (!lista.length) return null;
            return (
              <div key={sub.id} className="space-y-2">
                <button
                  onClick={() => setSubAtiva(sub.id)}
                  className="flex items-center gap-1.5 text-[12px] font-bold text-zinc-200 hover:text-emerald-300 transition-colors"
                >
                  <Folder className="w-3.5 h-3.5 text-zinc-500" />
                  {sub.nome}
                  <span className="text-zinc-500 font-normal">({lista.length})</span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                </button>
                {grade(lista)}
              </div>
            );
          })}
          {soltos.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-zinc-400">Sem subcategoria <span className="font-normal text-zinc-500">({soltos.length})</span></p>
              {grade(soltos)}
            </div>
          )}
        </div>
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
            {nomeClassificacao(verMais, CATEGORIA)}
            {subAtual && <span className="text-zinc-500"> / {subAtual.nome}</span>}
          </h2>
          <UploadTema
            classif={verMais}
            ocupado={uploadAlvo === verMais}
            onArquivo={(file, classif) => handleUpload(file, classif, subAtual?.id ?? null)}
          />
        </div>

        {(subs.length > 0 || isAdmin) && (
          <div className="flex flex-wrap gap-1.5">
            {chip(null, 'Todos', imgs.length)}
            {subs.map((sub) => chip(sub.id, sub.nome, contagem(sub.id)))}
            {isAdmin && !subEdicao && (
              <button
                onClick={() => { setConfirmarExcluirSub(false); setSubEdicao({ modo: 'criar', nome: '' }); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-dashed border-zinc-600 text-[11px] font-semibold text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors"
              >
                <FolderPlus className="w-3 h-3" /> Subcategoria
              </button>
            )}
          </div>
        )}

        {isAdmin && subEdicao && (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={subEdicao.nome}
              onChange={(e) => setSubEdicao({ ...subEdicao, nome: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') salvarSubEdicao(); if (e.key === 'Escape') setSubEdicao(null); }}
              placeholder={subEdicao.modo === 'criar' ? 'Nome da subcategoria (ex.: Black Friday)' : 'Novo nome'}
              maxLength={40}
              className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
            />
            <button onClick={salvarSubEdicao} disabled={salvandoSub || !subEdicao.nome.trim()} title="Salvar" className="p-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-40">
              {salvandoSub ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setSubEdicao(null)} title="Cancelar" className="p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isAdmin && subAtual && !subEdicao && (
          confirmarExcluirSub ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2">
              <p className="text-[11px] text-red-200 flex-1">
                Excluir a subcategoria <b>“{subAtual.nome}”</b>? Os temas não são apagados, só voltam pra “Todos”.
              </p>
              <button onClick={excluirSubAtiva} disabled={salvandoSub} className="px-2 py-1 rounded-md bg-red-600 text-white text-[11px] font-bold disabled:opacity-40">
                {salvandoSub ? 'Excluindo...' : 'Excluir'}
              </button>
              <button onClick={() => setConfirmarExcluirSub(false)} className="px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 text-[11px] font-bold">Não</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setSubEdicao({ modo: 'renomear', nome: subAtual.nome })}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700 text-[11px] font-semibold text-zinc-400 hover:text-zinc-100"
              >
                <Pencil className="w-3 h-3" /> Renomear
              </button>
              <button
                onClick={() => setConfirmarExcluirSub(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700 text-[11px] font-semibold text-zinc-400 hover:text-red-300 hover:border-red-500/40"
              >
                <Trash2 className="w-3 h-3" /> Excluir subcategoria
              </button>
            </div>
          )
        )}

        {corpo}

        {pendingDelete && (
          <ModalApagarTema ocupado={isDeleting} onCancelar={() => setPendingDelete(null)} onConfirmar={handleConfirmDelete} />
        )}
        {moverTema && (
          <ModalMoverTema
            subs={subs}
            atual={subDoArquivo(subsMapa, moverTema.classif, moverTema.img.filename)}
            ocupado={salvandoSub}
            onEscolher={confirmarMover}
            onCancelar={() => setMoverTema(null)}
          />
        )}
      </div>
    );
  }

  // ── Lista: uma linha por classificação ─────────────────────────────
  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Image className="w-4 h-4 text-emerald-500" />
        <div className="flex-grow min-w-0">
          <h2 className="text-sm font-black uppercase tracking-widest">Temas</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Escolha o fundo do seu encarte</p>
        </div>
        <button
          onClick={() => onSelecionar('')}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wide transition-colors flex-shrink-0',
            !selecionada
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200',
          )}
        >
          <Ban className="w-3 h-3" />
          Sem fundo
        </button>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar tema por nome..."
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
        <p className="text-xs text-zinc-500 text-center py-10">Carregando temas...</p>
      ) : buscaNorm ? (
        resultadosBusca.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-10">Nenhum tema encontrado pra "{busca}".</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {resultadosBusca.map(({ img, cat }) => (
              <TemaThumb
                key={img.fullPath}
                img={img}
                ativa={selecionada === img.url}
                podeEditar={isAdmin}
                substituindo={substituindo === img.fullPath}
                ajuste="contain"
                onSelect={() => onSelecionar(img.url)}
                onReplace={(file) => handleSubstituir(img, file, cat)}
                onDelete={() => setPendingDelete({ img, classif: cat })}
              />
            ))}
          </div>
        )
      ) : classifs.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-10">Nenhum tema ainda. Envie o primeiro abaixo.</p>
      ) : (
        <div className="space-y-6">
          {classifs.map((cat) => (
            <LinhaClassificacao
              key={cat}
              cat={cat}
              imgs={imgsPor[cat] ?? []}
              selecionada={selecionada}
              isAdmin={isAdmin}
              substituindo={substituindo}
              uploadAlvo={uploadAlvo}
              onSelecionar={onSelecionar}
              onSubstituir={handleSubstituir}
              onApagar={(img, classif) => setPendingDelete({ img, classif })}
              onVerMais={(c) => abrirVerMais(c)}
              subs={subsOrdenadas(subsMapa, cat)}
              onAbrirSub={(c, id) => abrirVerMais(c, id)}
            />
          ))}
        </div>
      )}

      {/* Enviar novo tema (vai pra classificação "Geral") */}
      <div className="flex items-center gap-2 pt-1">
        <UploadTema classif={CATEGORIA} ocupado={uploadAlvo === CATEGORIA} onArquivo={handleUpload} />
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
                base={CATEGORIA}
                ativa={classifAdmin}
                onMudar={(c) => { setClassifAdmin(c); carregarTudo(); }}
                onEstruturaMudou={carregarTudo}
              />
            </div>
          )}
        </div>
      )}

      {pendingDelete && (
        <ModalApagarTema ocupado={isDeleting} onCancelar={() => setPendingDelete(null)} onConfirmar={handleConfirmDelete} />
      )}
    </div>
  );
}
