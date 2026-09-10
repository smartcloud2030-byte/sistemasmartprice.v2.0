import { useEffect, useMemo, useState } from 'react';
import { Upload, Check, Image, Ban, Repeat, Trash2, Loader2, ChevronRight, ArrowLeft, Settings2 } from 'lucide-react';
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
import { getProxyUrl, cn } from '../../lib/utils';
import ClassificacaoBar from './ClassificacaoBar';

const CATEGORIA = 'encarte-temas';
const PREVIA = 6; // quantos temas aparecem na tira antes do "Ver mais"

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

/** Card de um tema — usado na tira horizontal e na grade em tela cheia. */
function TemaThumb({
  img,
  ativa,
  podeEditar,
  substituindo,
  onSelect,
  onReplace,
  onDelete,
}: {
  img: GalleryImage;
  ativa: boolean;
  podeEditar: boolean;
  substituindo: boolean;
  onSelect: () => void;
  onReplace: (file: File) => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative rounded-lg overflow-hidden border-2 aspect-[16/10] bg-zinc-800 transition-colors cursor-pointer',
        ativa ? 'border-emerald-500' : 'border-transparent hover:border-zinc-600',
      )}
    >
      <img src={getProxyUrl(img.url, { thumbnail: true })} className="w-full h-full object-cover" />
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
  const [telaCheia, setTelaCheia] = useState<string | null>(null); // classificação aberta em tela cheia
  const [gerenciar, setGerenciar] = useState(false);
  const [classifAdmin, setClassifAdmin] = useState(CATEGORIA);

  const [uploadAlvo, setUploadAlvo] = useState<string | null>(null); // classificação recebendo upload agora
  const [substituindo, setSubstituindo] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ img: GalleryImage; classif: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const carregarTudo = async () => {
    setCarregando(true);
    try {
      const [todas, mapa] = await Promise.all([listGalleryCategories(), carregarVisibilidade()]);
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

  const handleUpload = async (file: File, classif: string) => {
    setUploadAlvo(classif);
    try {
      const { url } = await uploadBackgroundImage(file, classif);
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

  // ── Tela cheia de uma classificação ────────────────────────────────
  if (telaCheia) {
    const imgs = imgsPor[telaCheia] ?? [];
    return (
      <div className="fixed inset-0 z-[60] bg-zinc-950 text-zinc-100 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <button onClick={() => setTelaCheia(null)} className="p-1.5 -ml-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-sm font-black uppercase tracking-widest flex-grow truncate">
            {nomeClassificacao(telaCheia, CATEGORIA)}
          </h2>
          <UploadTema classif={telaCheia} ocupado={uploadAlvo === telaCheia} onArquivo={handleUpload} />
        </div>

        <div className="flex-grow overflow-y-auto p-4">
          {imgs.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-16">Nenhum tema nesta classificação ainda.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {imgs.map((img) => (
                <TemaThumb
                  key={img.fullPath}
                  img={img}
                  ativa={selecionada === img.url}
                  podeEditar={isAdmin}
                  substituindo={substituindo === img.fullPath}
                  onSelect={() => { onSelecionar(img.url); setTelaCheia(null); }}
                  onReplace={(file) => handleSubstituir(img, file, telaCheia)}
                  onDelete={() => setPendingDelete({ img, classif: telaCheia })}
                />
              ))}
            </div>
          )}
        </div>

        {pendingDelete && (
          <ModalApagarTema ocupado={isDeleting} onCancelar={() => setPendingDelete(null)} onConfirmar={handleConfirmDelete} />
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

      {carregando ? (
        <p className="text-xs text-zinc-500 text-center py-10">Carregando temas...</p>
      ) : classifs.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-10">Nenhum tema ainda. Envie o primeiro abaixo.</p>
      ) : (
        <div className="space-y-6">
          {classifs.map((cat) => {
            const imgs = imgsPor[cat] ?? [];
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-bold text-zinc-100 truncate">
                    {nomeClassificacao(cat, CATEGORIA)}
                  </h3>
                  <button
                    onClick={() => setTelaCheia(cat)}
                    className="text-[12px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex-shrink-0"
                  >
                    Ver mais
                  </button>
                </div>

                <div className="flex items-stretch gap-2">
                  <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                            onReplace={(file) => handleSubstituir(img, file, cat)}
                            onDelete={() => setPendingDelete({ img, classif: cat })}
                          />
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    onClick={() => setTelaCheia(cat)}
                    title="Ver todos os temas desta classificação"
                    className="flex-shrink-0 self-center w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300 flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
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
