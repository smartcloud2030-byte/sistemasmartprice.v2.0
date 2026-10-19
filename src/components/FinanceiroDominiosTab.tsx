import React, { useEffect, useState } from 'react';
import { Globe, Plus, Pencil, Trash2, X, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Dominio, statusDominio, textoPrazo, formatarData } from '../lib/dominios';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const inputCls = 'w-full mt-1 px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-white';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-zinc-400';
const SUGESTOES_ONDE = ['Locaweb', 'Hostinger', 'Registro.br', 'GoDaddy', 'Cloudflare'];

const VAZIO = { dominio: '', vencimento: '', registrador: '', conta: '' };

export default function FinanceiroDominiosTab() {
  const [dominios, setDominios] = useState<Dominio[] | null>(null);
  const [form, setForm] = useState<typeof VAZIO | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    try {
      const res = await fetch('/api/dominios');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar domínios.');
      setDominios(data);
    } catch (err: any) {
      setErro(err.message);
      setDominios([]);
    }
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => { setEditandoId(null); setForm(VAZIO); setErro(null); };
  const abrirEdicao = (d: Dominio) => {
    setEditandoId(d.id);
    setForm({ dominio: d.dominio, vencimento: d.vencimento, registrador: d.registrador || '', conta: d.conta || '' });
    setErro(null);
  };
  const fecharForm = () => { setForm(null); setEditandoId(null); setErro(null); };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(editandoId ? `/api/dominios/${editandoId}` : '/api/dominios', {
        method: editandoId ? 'PUT' : 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar.');
      fecharForm();
      await carregar();
      window.dispatchEvent(new Event('dominios-mudaram'));
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (d: Dominio) => {
    if (!window.confirm(`Remover ${d.dominio} da lista?`)) return;
    await fetch(`/api/dominios/${d.id}`, { method: 'DELETE' });
    await carregar();
    window.dispatchEvent(new Event('dominios-mudaram'));
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
      {!form && (
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-600 text-white text-sm font-black uppercase tracking-widest hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Adicionar domínio
        </button>
      )}

      {form && (
        <form onSubmit={salvar} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs font-black uppercase tracking-widest text-zinc-400">{editandoId ? 'Editar domínio' : 'Novo domínio'}</p>
            <button type="button" onClick={fecharForm} aria-label="Fechar formulário" className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-zinc-600 dark:text-zinc-200">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Domínio</label>
              <input autoFocus value={form.dominio} onChange={(e) => setForm({ ...form, dominio: e.target.value })} placeholder="meusite.com.br" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Vencimento</label>
              <input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Onde está</label>
              <input list="dominio-onde" value={form.registrador} onChange={(e) => setForm({ ...form, registrador: e.target.value })} placeholder="Locaweb, Hostinger..." className={inputCls} />
              <datalist id="dominio-onde">
                {SUGESTOES_ONDE.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>E-mail da conta</label>
              <input type="email" value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} placeholder="login onde renova" className={inputCls} />
            </div>
          </div>
          {erro && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-xs text-red-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {erro}
            </div>
          )}
          <button
            type="submit"
            disabled={salvando}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black uppercase tracking-widest hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
          </button>
        </form>
      )}

      {dominios === null ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
      ) : dominios.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-10">Nenhum domínio cadastrado.</p>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-200 dark:divide-zinc-800">
          {dominios.map((d) => {
            const status = statusDominio(d.vencimento);
            return (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Globe className={cn('w-4 h-4 flex-shrink-0', status === 'vencido' ? 'text-red-600' : status === 'vence_em_breve' ? 'text-amber-600' : 'text-zinc-400')} />
                <div className="min-w-0 flex-grow">
                  <p className="text-sm font-bold text-black dark:text-white truncate">{d.dominio}</p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {d.registrador || 'Onde está: não informado'}
                    {d.conta && <> · <span className="text-zinc-600 dark:text-zinc-300 select-all">{d.conta}</span></>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-black dark:text-white">{formatarData(d.vencimento)}</p>
                  <p className={cn('text-[10px] font-black uppercase tracking-widest', status === 'vencido' ? 'text-red-600' : status === 'vence_em_breve' ? 'text-amber-600' : 'text-zinc-400')}>
                    {textoPrazo(d.vencimento)}
                  </p>
                </div>
                <button onClick={() => abrirEdicao(d)} title="Editar" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => remover(d)} title="Remover" className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-zinc-400">O painel avisa quando faltar 30 dias ou menos pro vencimento.</p>
    </div>
  );
}
