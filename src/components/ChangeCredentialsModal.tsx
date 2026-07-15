import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { X, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ChangeCredentialsModal() {
  const { isChangeCredsModalOpen, setChangeCredsModalOpen, currentUser, changeAdminCredentials, logout } = useStore();
  const [credsForm, setCredsForm] = useState({ currentPassword: '', newUsername: '', newPassword: '' });
  const [credsError, setCredsError] = useState('');
  const [isChangingCreds, setIsChangingCreds] = useState(false);

  useEffect(() => {
    if (isChangeCredsModalOpen) {
      setCredsForm({ currentPassword: '', newUsername: currentUser?.username || '', newPassword: '' });
      setCredsError('');
    }
  }, [isChangeCredsModalOpen, currentUser?.username]);

  if (!isChangeCredsModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.username) return;
    setCredsError('');
    setIsChangingCreds(true);
    const result = await changeAdminCredentials(
      currentUser.username,
      credsForm.currentPassword,
      credsForm.newUsername.trim(),
      credsForm.newPassword
    );
    setIsChangingCreds(false);
    if (!result.success) {
      setCredsError(result.error || 'Erro ao alterar credenciais.');
      return;
    }
    setChangeCredsModalOpen(false);
    toast.success('Credenciais alteradas! Faça login novamente com o novo usuário e senha.');
    logout();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-black dark:text-white uppercase tracking-tighter">Minhas Credenciais</h3>
              <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Usuário atual: {currentUser?.username}</p>
            </div>
          </div>
          <button
            onClick={() => setChangeCredsModalOpen(false)}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">Senha Atual</label>
            <input
              type="password"
              value={credsForm.currentPassword}
              onChange={(e) => setCredsForm({ ...credsForm, currentPassword: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">Novo Usuário</label>
            <input
              type="text"
              value={credsForm.newUsername}
              onChange={(e) => setCredsForm({ ...credsForm, newUsername: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">Nova Senha</label>
            <input
              type="password"
              value={credsForm.newPassword}
              onChange={(e) => setCredsForm({ ...credsForm, newPassword: e.target.value })}
              className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {credsError && (
            <p className="text-red-500 text-xs font-bold text-center">{credsError}</p>
          )}

          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest text-center">
            Você será deslogado e precisará entrar com o novo usuário e senha
          </p>

          <button
            type="submit"
            disabled={isChangingCreds}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase tracking-tighter text-sm hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isChangingCreds ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Salvar e Sair
          </button>
        </form>
      </div>
    </div>
  );
}
