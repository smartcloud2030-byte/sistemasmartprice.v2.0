import React, { useEffect, useState } from 'react';
import { useStore, EncarteMolde } from '../../store';
import { getProxyUrl } from '../../lib/utils';
import { Plus, Trash2, LayoutTemplate } from 'lucide-react';
import MoldeEditor from './MoldeEditor';

export default function MoldeList() {
  const { encarteMoldes, fetchEncarteMoldes, saveEncarteMoldes } = useStore();
  const [editingMolde, setEditingMolde] = useState<EncarteMolde | 'new' | null>(null);

  useEffect(() => { fetchEncarteMoldes(); }, []);

  const handleDelete = async (id: string, nome: string) => {
    if (!window.confirm(`Excluir o molde "${nome}"? Isso também desvincula os produtos já preenchidos em qualquer encarte semanal que usa esse molde.`)) return;
    await saveEncarteMoldes(encarteMoldes.filter((m) => m.id !== id));
  };

  if (editingMolde) {
    return <MoldeEditor molde={editingMolde === 'new' ? null : editingMolde} onClose={() => setEditingMolde(null)} />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest">Moldes salvos</h2>
        <button onClick={() => setEditingMolde('new')} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
          <Plus className="w-4 h-4" /> Novo molde
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {encarteMoldes.map((molde) => (
          <div key={molde.id} className="group relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 aspect-[3/4] bg-zinc-100 dark:bg-zinc-800">
            {molde.frontBgUrl ? (
              <img src={getProxyUrl(molde.frontBgUrl, { thumbnail: true })} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <LayoutTemplate className="w-8 h-8 text-zinc-400" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
              <p className="text-xs font-black uppercase text-white text-center px-2">{molde.nome}</p>
              <div className="flex gap-2">
                <button onClick={() => setEditingMolde(molde)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase">Editar</button>
                <button onClick={() => handleDelete(molde.id, molde.nome)} className="p-1.5 bg-red-600 text-white rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {encarteMoldes.length === 0 && (
          <p className="col-span-3 text-center text-xs text-zinc-400 py-8">Nenhum molde salvo ainda.</p>
        )}
      </div>
    </div>
  );
}
