import React, { useState } from 'react';
import { useStore } from '../store';
import { ArrowLeft, Folder, FolderOpen, Pencil, Trash2, ListPlus, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { groupByFolder } from '../lib/savedPlaquinhaFolders';

const SavedFolders = () => {
  const { savedPlaquinhas, setView, editSavedPlaquinha, deleteSavedPlaquinha, renameFolder, deleteFolder, addToQueue } = useStore();
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const folders = groupByFolder(savedPlaquinhas);

  const handleAddToQueue = (item: (typeof savedPlaquinhas)[number]) => {
    addToQueue(item.imageData, item.isLandscape, item.editorState);
    toast.success('Adicionado à fila de impressão!');
  };

  const handleDeletePlaquinha = (id: string) => {
    if (!window.confirm('Excluir essa plaquinha salva?')) return;
    deleteSavedPlaquinha(id).catch((err) => {
      console.error(err);
      toast.error('Erro ao excluir — tente novamente.');
    });
  };

  const handleDeleteFolder = (folder: string) => {
    if (!window.confirm(`Excluir a pasta "${folder}" e todas as plaquinhas dentro dela?`)) return;
    deleteFolder(folder).catch((err) => {
      console.error(err);
      toast.error('Erro ao excluir — tente novamente.');
    });
    setOpenFolder(null);
  };

  const handleConfirmRename = (oldName: string) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== oldName) {
      renameFolder(oldName, trimmed).catch((err) => {
        console.error(err);
        toast.error('Erro ao renomear — tente novamente.');
      });
      if (openFolder === oldName) setOpenFolder(trimmed);
    }
    setRenamingFolder(null);
  };

  if (openFolder !== null) {
    const items = folders.find((f) => f.folder === openFolder)?.items || [];
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center flex-wrap justify-between gap-y-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setOpenFolder(null)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-black dark:text-white"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white">{openFolder}</h1>
                <p className="text-black dark:text-white opacity-60 text-sm font-medium uppercase tracking-widest">
                  {items.length} {items.length === 1 ? 'plaquinha salva' : 'plaquinhas salvas'}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDeleteFolder(openFolder)}
              className="whitespace-nowrap px-4 py-2 text-black dark:text-white opacity-60 hover:text-red-500 font-bold text-sm uppercase tracking-tighter flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Pasta
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <div key={item.id} className="group relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden border-2 border-zinc-200 dark:border-zinc-800 hover:shadow-2xl hover:-translate-y-1 transition-all">
                <img src={item.imageData} alt={item.name} className="w-full h-auto" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <button
                    onClick={() => editSavedPlaquinha(item.id)}
                    className="p-3 bg-amber-500 text-white rounded-full hover:scale-110 active:scale-90 transition-all shadow-lg"
                    title="Editar esta plaquinha"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleAddToQueue(item)}
                    className="p-3 bg-blue-600 text-white rounded-full hover:scale-110 active:scale-90 transition-all shadow-lg"
                    title="Adicionar à fila de impressão"
                  >
                    <ListPlus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeletePlaquinha(item.id)}
                    className="p-3 bg-red-600 text-white rounded-full hover:scale-110 active:scale-90 transition-all shadow-lg"
                    title="Excluir"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-black dark:text-white truncate">{item.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('editor')}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-black dark:text-white"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white">MINHAS <span className="text-blue-600">PASTAS</span></h1>
            <p className="text-black dark:text-white opacity-60 text-sm font-medium uppercase tracking-widest">
              {folders.length} {folders.length === 1 ? 'pasta' : 'pastas'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {folders.map(({ folder, items }) => (
            <div
              key={folder}
              className="group relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border-2 border-zinc-200 dark:border-zinc-800 hover:shadow-2xl hover:-translate-y-1 transition-all p-6 cursor-pointer"
              onClick={() => setOpenFolder(folder)}
            >
              <Folder className="w-10 h-10 text-blue-600 mb-3" />
              {renamingFolder === folder ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => handleConfirmRename(folder)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename(folder)}
                  className="w-full px-2 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-black dark:text-white font-bold"
                />
              ) : (
                <h3 className="font-black text-black dark:text-white truncate">{folder}</h3>
              )}
              <p className="text-xs text-black dark:text-white opacity-60 mt-1">
                {items.length} {items.length === 1 ? 'plaquinha' : 'plaquinhas'}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingFolder(folder);
                  setRenameValue(folder);
                }}
                className="absolute top-3 right-3 p-1.5 bg-white dark:bg-zinc-800 rounded-md shadow border border-zinc-200 dark:border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Renomear pasta"
              >
                <PencilLine className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            </div>
          ))}

          {folders.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-black dark:text-white opacity-40 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
              <FolderOpen className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-bold uppercase tracking-widest text-sm text-black dark:text-white opacity-60">Nenhuma pasta salva ainda</p>
              <button
                onClick={() => setView('editor')}
                className="mt-4 text-blue-600 font-bold hover:underline opacity-100"
              >
                Voltar ao editor pra salvar sua primeira plaquinha
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SavedFolders;
