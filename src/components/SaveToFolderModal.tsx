import React, { useEffect, useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { useStore } from '../store';
import { toast } from 'sonner';

interface SaveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultName: string;
  onConfirm: (folder: string, name: string) => Promise<void>;
}

const SaveToFolderModal: React.FC<SaveToFolderModalProps> = ({ isOpen, onClose, defaultName, onConfirm }) => {
  const { savedPlaquinhas } = useStore();
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState('');
  const [isNewFolder, setIsNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const existingFolders = Array.from(new Set(savedPlaquinhas.map((p) => p.folder))).sort();

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setFolder('');
      setIsNewFolder(false);
      setNewFolderName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const finalFolder = isNewFolder ? newFolderName.trim() : folder;
    if (!finalFolder) {
      toast.error('Escolha ou digite o nome de uma pasta.');
      return;
    }
    if (!name.trim()) {
      toast.error('Dê um nome pra essa plaquinha.');
      return;
    }
    setIsSaving(true);
    try {
      await onConfirm(finalFolder, name.trim());
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <FolderPlus className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-black dark:text-white">Salvar em Pasta</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">Nome da plaquinha</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">Pasta</label>
            {!isNewFolder ? (
              <>
                <select
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                >
                  <option value="">Selecione uma pasta...</option>
                  {existingFolders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsNewFolder(true)}
                  className="text-xs font-bold text-blue-600 hover:underline mt-1"
                >
                  + Criar nova pasta
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex: Dia da Beleza"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                />
                {existingFolders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsNewFolder(false)}
                    className="text-xs font-bold text-blue-600 hover:underline mt-1"
                  >
                    Usar pasta já existente
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="p-6 pt-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-sm text-black dark:text-white opacity-70 hover:opacity-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSaving}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black text-sm uppercase tracking-tighter hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveToFolderModal;
