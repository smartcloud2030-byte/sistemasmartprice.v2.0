import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Building2, Flag, User, Lock, ArrowRight, Moon, Sun, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, useReducedMotion } from 'motion/react';

// Curva de ease-out forte (cubic-bezier(0.23, 1, 0.32, 1)) — a padrão do CSS é fraca demais.
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
// prefers-reduced-motion: mantém o fade (ajuda a orientar), remove o deslocamento.
const entrance = (delay: number, reduceMotion: boolean | null) => ({
  initial: { opacity: 0, y: reduceMotion ? 0 : 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: reduceMotion ? 0.2 : 0.45, ease: EASE_OUT, delay: reduceMotion ? 0 : delay },
});

export default function Login() {
  const { login, verifyAdminLogin, allowedStores, flags, theme, toggleTheme, maxConcurrentStores, cnpjUserLimits } = useStore();
  const shouldReduceMotion = useReducedMotion();
  const [formData, setFormData] = useState({
    cnpj: '',
    bandeira: '',
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastCnpj, setLastCnpj] = useState<string | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  // Alterna manualmente entre login de loja e administrativo — usuário e
  // senha de admin não ficam fixos no front-end (podem ser trocados pelo
  // próprio admin), então não dá para detectar o modo pelo texto digitado.
  const [isAdmin, setIsAdmin] = useState(false);

  // Auto-fill bandeira based on CNPJ
  useEffect(() => {
    if (!isAdmin) {
      const normalizedInputCnpj = formData.cnpj.replace(/[^\d]/g, '');
      if (normalizedInputCnpj.length >= 14) { // Only check if it looks like a full CNPJ
        const store = allowedStores.find(s => s.cnpj.replace(/[^\d]/g, '') === normalizedInputCnpj);
        if (store && store.bandeira) {
          setFormData(prev => ({ ...prev, bandeira: store.bandeira }));
        } else {
          setFormData(prev => ({ ...prev, bandeira: '' }));
        }
      } else if (normalizedInputCnpj.length === 0) {
        setFormData(prev => ({ ...prev, bandeira: '' }));
      }
    }
  }, [formData.cnpj, isAdmin, allowedStores]);

  useEffect(() => {
    const savedCnpj = localStorage.getItem('smartprice_last_cnpj');
    if (savedCnpj) {
      setLastCnpj(savedCnpj);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isAdmin) {
        const ok = await verifyAdminLogin(formData.username, formData.password);
        if (ok) {
          await login('admin', {
            username: formData.username,
            cnpj: 'Administrativo',
            bandeira: 'Master'
          });
        } else {
          setError('Senha de administrador incorreta.');
          setIsLoading(false);
        }
      } else {
        if (formData.cnpj && formData.bandeira && formData.username) {
          // Normalize CNPJ for comparison
          const normalizedInputCnpj = formData.cnpj.replace(/[^\d]/g, '');

          // Check if CNPJ is allowed
          const store = allowedStores.find(store => store.cnpj?.replace(/[^\d]/g, '') === normalizedInputCnpj);

          if (store) {
            if (store.isSuspended) {
              setError('Este CNPJ está suspenso e não pode acessar o sistema.');
              setIsLoading(false);
              return;
            }

            // Limite global de CNPJs simultaneamente online (não conta o próprio
            // CNPJ se ele já estiver online, ex.: reabrindo em outra aba)
            if (!store.isOnline && maxConcurrentStores !== null) {
              const onlineCount = allowedStores.filter(s => s.isOnline).length;
              if (onlineCount >= maxConcurrentStores) {
                setError(`Limite de ${maxConcurrentStores} acesso(s) simultâneo(s) do sistema atingido. Tente novamente mais tarde.`);
                setIsLoading(false);
                return;
              }
            }

            // Limite de acesso simultâneo por CNPJ individual — só existe um
            // online/offline por CNPJ (não um contador de sessões), então na
            // prática só 0 (bloqueia) e 1 (uma sessão por vez) têm efeito.
            // Ignora sessões "paradas" há mais de 10 min (sem heartbeat) para
            // não travar quem esqueceu de sair do sistema em outro aparelho.
            const cnpjLimit = cnpjUserLimits[normalizedInputCnpj];
            if (cnpjLimit !== undefined) {
              const STALE_MS = 10 * 60 * 1000;
              const isReallyOnline = !!store.isOnline && !!store.lastAccess && (Date.now() - new Date(store.lastAccess).getTime() < STALE_MS);
              if ((isReallyOnline ? 1 : 0) >= cnpjLimit) {
                setError(
                  cnpjLimit === 0
                    ? 'Este CNPJ está bloqueado para acesso pelo administrador.'
                    : `Este CNPJ já está em uso em outro dispositivo. Limite de ${cnpjLimit} acesso(s) simultâneo(s) atingido.`
                );
                setIsLoading(false);
                return;
              }
            }

            // Save last used CNPJ
            localStorage.setItem('smartprice_last_cnpj', formData.cnpj);

            await login('user', {
              username: formData.username,
              cnpj: formData.cnpj,
              bandeira: formData.bandeira
            });
          } else {
            setError('Este CNPJ não está autorizado a acessar o sistema.');
            setIsLoading(false);
          }
        } else {
          setError('Por favor, preencha todos os campos.');
          setIsLoading(false);
        }
      }
    } catch (err) {
      setError('Erro ao acessar o sistema. Tente novamente.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <motion.div {...entrance(0, shouldReduceMotion)} className="flex flex-col items-center mb-8 relative">
          <img src="/logo-light.png" alt="SmartPrice" className="h-8 md:h-9 w-auto mb-3 dark:hidden" />
          <img src="/logo-dark.png" alt="SmartPrice" className="h-8 md:h-9 w-auto mb-3 hidden dark:block" />
          <p className="text-zinc-500 text-sm font-medium mt-1 uppercase tracking-widest">Acesso ao Sistema</p>
        </motion.div>

        {/* Card */}
        <motion.div {...entrance(0.08, shouldReduceMotion)} className="bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl shadow-black/5 dark:shadow-black/20 border border-zinc-200 dark:border-zinc-800 p-8 md:p-10 transition-colors">
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={() => {
                setIsAdmin(prev => !prev);
                setError('');
                setFormData({ cnpj: '', bandeira: '', username: '', password: '' });
              }}
              className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-blue-600 transition-colors"
            >
              {isAdmin ? 'Sou uma loja' : 'Acesso administrativo'}
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            {!isAdmin && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">CNPJ da Loja</label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="00.000.000/0000-00"
                      className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl py-4 pl-12 pr-4 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      value={formData.cnpj}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      onFocus={() => lastCnpj && setShowSuggestion(true)}
                      onBlur={() => setTimeout(() => setShowSuggestion(false), 200)}
                    />
                    {showSuggestion && lastCnpj && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevent input blur before click
                            setFormData({ ...formData, cnpj: lastCnpj });
                            setShowSuggestion(false);
                          }}
                          className="w-full px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-left"
                        >
                          <span className="text-sm font-bold text-zinc-900 dark:text-white">{lastCnpj}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">Bandeira</label>
                  <div className="relative">
                    <Flag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      type="text"
                      readOnly
                      placeholder="Identificada pelo CNPJ"
                      className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl py-4 pl-12 pr-4 text-sm text-zinc-900 dark:text-white focus:ring-1 focus:ring-blue-500/30 outline-none transition-all cursor-default"
                      value={formData.bandeira}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">Usuário</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Seu usuário"
                  className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl py-4 pl-12 pr-4 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
            </div>

            {isAdmin && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">Senha de Administrador</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="password"
                    placeholder="••••"
                    className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl py-4 pl-12 pr-4 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    autoFocus
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-red-500 text-xs font-bold text-center animate-pulse">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-tighter py-4 rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 group transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Atualizando Dados...
                </>
              ) : (
                <>
                  Acessar Sistema
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </motion.div>

        <motion.p {...entrance(0.16, shouldReduceMotion)} className="text-center mt-8 text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em]">
          SistemaSmartPrice v2.0 • Gestão de Etiquetas Inteligentes
        </motion.p>
      </div>
    </div>
  );
}
