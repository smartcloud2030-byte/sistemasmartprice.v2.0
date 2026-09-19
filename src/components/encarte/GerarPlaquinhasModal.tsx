import { useState } from 'react';
import { X, FolderOpen, Loader2, ListPlus } from 'lucide-react';
import { useStore, SavedPlaquinha } from '../../store';
import { groupByFolder } from '../../lib/savedPlaquinhaFolders';
import { EncarteProduto } from './encarteProduto';
import { gerarPlaquinhasDoEncarte } from './gerarPlaquinhas';
import { toast } from 'sonner';

/**
 * "Add Placa de preço" no Encarte Online — o usuário escolhe UM modelo de
 * plaquinha salvo (das pastas dele) e o sistema gera uma plaquinha por
 * produto do encarte (frente + verso), trocando nome/descrição/preço/foto
 * pelos de cada produto, e manda tudo direto pra fila de impressão.
 */
export default function GerarPlaquinhasModal({
  produtos,
  onClose,
}: {
  produtos: EncarteProduto[];
  onClose: () => void;
}) {
  const savedPlaquinhas = useStore((s) => s.savedPlaquinhas);
  const [selecionada, setSelecionada] = useState<SavedPlaquinha | null>(null);
  const [gerando, setGerando] = useState(false);

  const folders = groupByFolder(savedPlaquinhas);
  const qtdProdutos = produtos.filter((p) => p.nome?.trim()).length;

  const handleConfirmar = async () => {
    if (!selecionada || gerando) return;
    setGerando(true);
    try {
      const qtd = await gerarPlaquinhasDoEncarte(selecionada, produtos);
      if (qtd > 0) {
        toast.success(`${qtd} ${qtd === 1 ? 'placa adicionada' : 'placas adicionadas'} à fila de impressão!`);
        onClose();
      } else {
        toast.error('Nenhum produto no encarte pra gerar placa.');
        setGerando(false);
      }
    } catch (err) {
      console.error('Erro ao gerar placas do encarte:', err);
      toast.error('Erro ao gerar as placas — tente novamente.');
      setGerando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] bg-zinc-900 border border-zinc-700 rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-100">Add placa de preço</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Escolha um modelo salvo — {qtdProdutos} {qtdProdutos === 1 ? 'produto do encarte vai virar placa' : 'produtos do encarte vão virar placas'}
            </p>
          </div>
          <button onClick={onClose} disabled={gerando} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {folders.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-2xl">
              <FolderOpen className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-semibold">Nenhuma plaquinha salva ainda</p>
              <p className="text-xs mt-1 opacity-70">Salve um modelo no editor de plaquinhas pra poder usar aqui.</p>
            </div>
          ) : (
            folders.map(({ folder, items }) => (
              <div key={folder} className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{folder}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelecionada(item)}
                      disabled={gerando}
                      className={`relative rounded-xl overflow-hidden border-2 transition-colors text-left disabled:opacity-40 ${
                        selecionada?.id === item.id ? 'border-emerald-500' : 'border-zinc-700 hover:border-zinc-500'
                      }`}
                    >
                      <img src={item.imageData} alt={item.name} className="w-full h-auto bg-zinc-800" />
                      <div className="p-2 bg-zinc-800">
                        <p className="text-xs font-semibold text-zinc-100 truncate">{item.name}</p>
                      </div>
                      {selecionada?.id === item.id && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-black">
                          ✓
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            disabled={gerando}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!selecionada || gerando || qtdProdutos === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:hover:bg-emerald-600"
          >
            {gerando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando placas...
              </>
            ) : (
              <>
                <ListPlus className="w-4 h-4" />
                OK, gerar {qtdProdutos > 0 ? qtdProdutos : ''} {qtdProdutos === 1 ? 'placa' : 'placas'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
