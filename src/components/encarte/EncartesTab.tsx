import { useState } from 'react';
import { LayoutGrid, Trash2, FolderOpen } from 'lucide-react';
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
          <p className="text-[11px] text-zinc-400 mt-0.5">Histórico dos últimos encartes baixados</p>
        </div>
      </div>

      {historico.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-8">
          Nenhum encarte no histórico ainda — aparece aqui assim que você baixar um.
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
                title="Recuperar este encarte"
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-300 hover:bg-zinc-700 transition-colors flex-shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPendingDelete(entry)}
                title="Apagar do histórico"
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
              <h3 className="text-lg font-bold text-zinc-100">Apagar do histórico?</h3>
            </div>
            <p className="text-sm text-zinc-400">
              Deseja realmente apagar "{pendingDelete.nome}" do histórico? Essa ação é irreversível.
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
