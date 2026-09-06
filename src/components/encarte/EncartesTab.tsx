import { useState } from 'react';
import { LayoutGrid, Trash2, Pencil } from 'lucide-react';
import { EncarteSalvo } from './persistencia';

interface EncartesTabProps {
  historico: EncarteSalvo[];
  onAbrir: (entry: EncarteSalvo) => void;
  onApagar: (id: string) => void;
}

export default function EncartesTab({ historico, onAbrir, onApagar }: EncartesTabProps) {
  const [pendingDelete, setPendingDelete] = useState<EncarteSalvo | null>(null);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <LayoutGrid className="w-4 h-4 text-emerald-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Encartes</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Encartes salvos — clique em Editar pra continuar de onde parou</p>
        </div>
      </div>

      {historico.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-8">
          Nenhum encarte salvo ainda — use o botão <b className="text-zinc-300">Salvar</b> no topo pra guardar
          o encarte (fundo, produtos, tags, marca, formas e textos, frente e verso).
        </p>
      ) : (
        <div className="space-y-2">
          {historico.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 bg-zinc-800/60 border border-zinc-800 rounded-xl p-2">
              <img
                src={entry.imagemPreview}
                className="w-12 h-12 rounded-lg object-cover bg-zinc-900 flex-shrink-0"
              />
              <div className="flex-grow min-w-0">
                <p className="text-xs font-semibold text-zinc-200 truncate">{entry.nome}</p>
                <p className="text-[10px] text-zinc-500">
                  {new Date(entry.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
              <button
                onClick={() => onAbrir(entry)}
                title="Abrir este encarte no editor"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors flex-shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={() => setPendingDelete(entry)}
                title="Apagar este encarte"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-zinc-100">Apagar encarte</h3>
            </div>
            <p className="text-sm text-zinc-400">
              Você deseja realmente apagar esse encarte? Essa ação é irreversível.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingDelete(null)}
                className="flex-1 px-4 py-2 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-sm font-bold text-zinc-200"
              >
                Não
              </button>
              <button
                onClick={() => { onApagar(pendingDelete.id); setPendingDelete(null); }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
