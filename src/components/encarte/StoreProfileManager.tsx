import React, { useEffect, useState } from 'react';
import { useStore, StoreProfile } from '../../store';
import { uploadBackgroundImage } from '../../lib/gallery';
import { fetchCnpjData } from '../../lib/cnpjLookup';
import { getProxyUrl } from '../../lib/utils';
import { Plus, Trash2, Loader2, Search, Store } from 'lucide-react';
import { toast } from 'sonner';

const emptyProfile = (): StoreProfile => ({
  id: Math.random().toString(36).slice(2, 10),
  cnpj: '',
  nome: '',
  logoUrl: '',
  endereco: '',
  telefone: '',
  instagram: '',
});

export default function StoreProfileManager() {
  const { storeProfiles, fetchStoreProfiles, saveStoreProfiles } = useStore();
  const [editing, setEditing] = useState<StoreProfile | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => { fetchStoreProfiles(); }, []);

  const handleCnpjLookup = async () => {
    if (!editing?.cnpj) return;
    setIsLookingUp(true);
    try {
      const data = await fetchCnpjData(editing.cnpj);
      if (!data) {
        toast.error('CNPJ não encontrado.');
        return;
      }
      setEditing((prev) => prev ? {
        ...prev,
        nome: prev.nome || data.nome,
        endereco: prev.endereco || data.endereco,
      } : prev);
      toast.success('Dados encontrados!');
    } catch {
      toast.error('Não foi possível consultar o CNPJ agora.');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setIsUploadingLogo(true);
    try {
      const { url } = await uploadBackgroundImage(file, 'encarte-logos');
      setEditing((prev) => prev ? { ...prev, logoUrl: url } : prev);
    } catch {
      toast.error('Falha ao enviar a logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!editing || !editing.nome.trim()) {
      toast.error('Informe o nome da loja.');
      return;
    }
    const exists = storeProfiles.some((p) => p.id === editing.id);
    const updated = exists
      ? storeProfiles.map((p) => (p.id === editing.id ? editing : p))
      : [...storeProfiles, editing];
    await saveStoreProfiles(updated);
    setEditing(null);
    toast.success('Loja salva!');
  };

  const handleDelete = async (id: string) => {
    await saveStoreProfiles(storeProfiles.filter((p) => p.id !== id));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest">Lojas cadastradas</h2>
        <button
          onClick={() => setEditing(emptyProfile())}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
        >
          <Plus className="w-4 h-4" /> Nova loja
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {storeProfiles.map((profile) => (
          <div key={profile.id} className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
              {profile.logoUrl ? (
                <img src={getProxyUrl(profile.logoUrl, { thumbnail: true })} className="w-full h-full object-contain p-1" />
              ) : (
                <Store className="w-5 h-5 text-zinc-400" />
              )}
            </div>
            <div className="flex-grow min-w-0">
              <p className="text-xs font-black uppercase truncate">{profile.nome}</p>
              <p className="text-[10px] text-zinc-500 truncate">{profile.endereco}</p>
            </div>
            <button onClick={() => setEditing(profile)} className="text-[10px] font-black uppercase text-emerald-600">Editar</button>
            <button onClick={() => handleDelete(profile.id)} className="text-zinc-400 hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {storeProfiles.length === 0 && (
          <p className="col-span-2 text-center text-xs text-zinc-400 py-8">Nenhuma loja cadastrada ainda.</p>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-black uppercase tracking-widest">Perfil de loja</h3>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="CNPJ (opcional)"
                value={editing.cnpj}
                onChange={(e) => setEditing({ ...editing, cnpj: e.target.value })}
                className="flex-grow px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
              />
              <button
                onClick={handleCnpjLookup}
                disabled={isLookingUp || !editing.cnpj}
                className="px-3 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl disabled:opacity-40"
              >
                {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            <input
              type="text"
              placeholder="Nome da loja"
              value={editing.nome}
              onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
            />

            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                {editing.logoUrl ? (
                  <img src={getProxyUrl(editing.logoUrl, { thumbnail: true })} className="w-full h-full object-contain p-1" />
                ) : (
                  <Store className="w-5 h-5 text-zinc-400" />
                )}
              </div>
              <label className="flex-grow cursor-pointer">
                <span className="text-[10px] font-black uppercase text-emerald-600">
                  {isUploadingLogo ? 'Enviando...' : 'Enviar logo'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                />
              </label>
            </div>

            <input
              type="text"
              placeholder="Endereço"
              value={editing.endereco}
              onChange={(e) => setEditing({ ...editing, endereco: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
            />
            <input
              type="text"
              placeholder="Telefone / WhatsApp"
              value={editing.telefone}
              onChange={(e) => setEditing({ ...editing, telefone: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
            />
            <input
              type="text"
              placeholder="Instagram"
              value={editing.instagram}
              onChange={(e) => setEditing({ ...editing, instagram: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
            />

            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="flex-1 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-black uppercase">
                Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
