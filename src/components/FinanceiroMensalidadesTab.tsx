import React, { useEffect, useMemo, useState } from 'react';
import { Store, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useStore } from '../store';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const SETTING_ID = 'mensalidades_grupos';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-zinc-400';
const inputCls = 'w-full mt-1 px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-white';
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const soDigitos = (c: string) => (c || '').replace(/\D/g, '');
const formatCnpj = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);

// O que fica salvo por grupo/bandeira: valor da mensalidade por loja e as
// lojas que o admin tirou da conta.
interface ConfigGrupo { valor: string; fora: string[] }

interface Alvo { chave: string; nome: string; lojas: { cnpj: string; bandeira: string; usuario?: string; suspensa?: boolean }[] }

export default function FinanceiroMensalidadesTab() {
  const allowedStores = useStore((s) => s.allowedStores);
  const userGroups = useStore((s) => s.userGroups);

  const alvos = useMemo(() => {
    const porNome = (a: Alvo, b: Alvo) => a.nome.localeCompare(b.nome, 'pt-BR');
    const loja = (s: (typeof allowedStores)[number]) => ({
      cnpj: soDigitos(s.cnpj), bandeira: (s.bandeira || '').trim(), usuario: s.lastUsername, suspensa: s.isSuspended,
    });
    const grupos: Alvo[] = userGroups
      .map((g) => ({ chave: `grupo:${g.id}`, nome: g.name, lojas: allowedStores.filter((s) => s.groupId === g.id).map(loja) }))
      .filter((g) => g.lojas.length > 0)
      .sort(porNome);
    const nomesBandeira = [...new Set(allowedStores.map((s) => (s.bandeira || '').trim()).filter(Boolean))];
    const bandeiras: Alvo[] = nomesBandeira
      .map((b) => ({ chave: `bandeira:${b}`, nome: b, lojas: allowedStores.filter((s) => (s.bandeira || '').trim() === b).map(loja) }))
      .sort(porNome);
    return { grupos, bandeiras };
  }, [allowedStores, userGroups]);

  const [chave, setChave] = useState('');
  const [configs, setConfigs] = useState<Record<string, ConfigGrupo>>({});
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Edição do grupo aberto — só vai pro servidor no "Salvar".
  const [rascunho, setRascunho] = useState<ConfigGrupo | null>(null);

  useEffect(() => {
    fetch(`/api/settings/${SETTING_ID}`, { headers: JSON_HEADERS })
      .then((res) => res.json())
      .then((data) => { if (data?.value && typeof data.value === 'object') setConfigs(data.value); })
      .catch(() => { /* começa em branco */ })
      .finally(() => setCarregado(true));
  }, []);

  const alvo = [...alvos.grupos, ...alvos.bandeiras].find((a) => a.chave === chave) || null;
  const salvo: ConfigGrupo = (chave && configs[chave]) || { valor: '', fora: [] };
  const config: ConfigGrupo = rascunho || salvo;
  const alterado = !!rascunho && JSON.stringify(rascunho) !== JSON.stringify(salvo);

  const escolher = (nova: string) => {
    if (alterado && !window.confirm('Tem alteração não salva nesse grupo. Trocar mesmo assim?')) return;
    setRascunho(null);
    setChave(nova);
  };

  const atualizar = (mudanca: Partial<ConfigGrupo>) => {
    if (!chave) return;
    setRascunho({ ...config, ...mudanca });
  };

  const salvar = async () => {
    if (!chave || !rascunho) return;
    const novos = { ...configs, [chave]: rascunho };
    setSalvando(true);
    try {
      const res = await fetch(`/api/settings/${SETTING_ID}`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ value: novos }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Erro ao salvar.');
      setConfigs(novos);
      setRascunho(null);
      toast.success(`Mensalidade de ${alvo?.nome || 'grupo'} salva.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  // "39,97", "1.039,97" ou "39.97"
  const valorDe = (c: ConfigGrupo) => {
    const t = String(c.valor || '');
    return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0;
  };
  const valor = valorDe(config);

  // Grupos que já têm mensalidade salva, com o total de cada um.
  const salvos = [...alvos.grupos, ...alvos.bandeiras]
    .filter((a) => configs[a.chave] && valorDe(configs[a.chave]) > 0)
    .map((a) => {
      const c = configs[a.chave];
      const qtd = a.lojas.filter((l) => !c.fora.includes(l.cnpj)).length;
      return { chave: a.chave, nome: a.nome, valor: valorDe(c), qtd, total: qtd * valorDe(c) };
    });
  const totalGeral = salvos.reduce((s, g) => s + g.total, 0);
  const lojas = alvo?.lojas || [];
  const dentro = lojas.filter((l) => !config.fora.includes(l.cnpj));
  const total = dentro.length * valor;
  const todasDentro = lojas.length > 0 && dentro.length === lojas.length;

  const alternar = (cnpj: string, entra: boolean) =>
    atualizar({ fora: entra ? config.fora.filter((c) => c !== cnpj) : [...config.fora, cnpj] });

  return (
    <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
      {salvos.length > 0 && (
        <div className="space-y-2">
          <p className={labelCls}>Mensalidades salvas</p>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
            {salvos.map((g) => (
              <button
                key={g.chave}
                onClick={() => escolher(g.chave)}
                className={cn('w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50', g.chave === chave && 'bg-zinc-50 dark:bg-zinc-800/50')}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-black dark:text-white truncate">{g.nome}</p>
                  <p className="text-[11px] text-zinc-400">{g.qtd} loja{g.qtd === 1 ? '' : 's'} × {moeda(g.valor)}</p>
                </div>
                <span className="text-sm font-bold text-black dark:text-white">{moeda(g.total)}</span>
              </button>
            ))}
            <div className="flex items-center justify-between px-3 py-2">
              <span className={labelCls}>Total de todos</span>
              <span className="text-sm font-bold text-emerald-600">{moeda(totalGeral)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Grupo ou bandeira</label>
          <select value={chave} onChange={(e) => escolher(e.target.value)} className={inputCls} disabled={!carregado}>
            <option value="">Selecione...</option>
            {alvos.grupos.length > 0 && (
              <optgroup label="Grupos">
                {alvos.grupos.map((g) => <option key={g.chave} value={g.chave}>{g.nome} ({g.lojas.length})</option>)}
              </optgroup>
            )}
            {alvos.bandeiras.length > 0 && (
              <optgroup label="Bandeiras">
                {alvos.bandeiras.map((b) => <option key={b.chave} value={b.chave}>{b.nome} ({b.lojas.length})</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label className={labelCls}>Mensalidade por loja (R$)</label>
          <input
            type="text"
            inputMode="decimal"
            value={config.valor}
            onChange={(e) => atualizar({ valor: e.target.value.replace(/[^\d.,]/g, '') })}
            disabled={!alvo}
            placeholder="39,97"
            className={inputCls}
          />
        </div>
      </div>

      {alvo && (
        <>
          <div className="grid grid-cols-3 border border-zinc-200 dark:border-zinc-700 rounded-xl divide-x divide-zinc-200 dark:divide-zinc-700">
            <div className="p-3">
              <p className={labelCls}>Lojas</p>
              <p className="text-lg font-bold text-black dark:text-white">{dentro.length}</p>
            </div>
            <div className="p-3">
              <p className={labelCls}>Por loja</p>
              <p className="text-lg font-bold text-black dark:text-white">{moeda(valor)}</p>
            </div>
            <div className="p-3">
              <p className={labelCls}>Total do mês</p>
              <p className="text-lg font-bold text-emerald-600">{moeda(total)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={todasDentro}
                ref={(el) => { if (el) el.indeterminate = dentro.length > 0 && !todasDentro; }}
                onChange={(e) => atualizar({ fora: e.target.checked ? [] : lojas.map((l) => l.cnpj) })}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="text-xs font-bold text-black dark:text-white">{todasDentro ? 'Desmarcar todas' : 'Marcar todas'}</span>
            </label>
            <span className="text-[11px] text-zinc-400">{dentro.length} de {lojas.length} na conta</span>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
            {lojas.map((l) => {
              const entra = !config.fora.includes(l.cnpj);
              return (
                <label key={l.cnpj} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={entra} onChange={(e) => alternar(l.cnpj, e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-mono', entra ? 'text-black dark:text-white' : 'text-zinc-400')}>{formatCnpj(l.cnpj)}</p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {[l.bandeira, l.usuario].filter(Boolean).join(' · ')}
                      {l.suspensa && <span className="text-red-500"> · suspensa</span>}
                    </p>
                  </div>
                  <span className={cn('text-sm', entra ? 'text-black dark:text-white' : 'text-zinc-400 line-through')}>{moeda(valor)}</span>
                </label>
              );
            })}
          </div>

          <button
            onClick={salvar}
            disabled={!alterado || salvando}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {alterado ? 'Salvar' : 'Salvo'}
          </button>
        </>
      )}

      {!alvo && (
        <p className="flex items-center gap-2 text-xs text-zinc-400">
          <Store className="w-4 h-4" /> Escolha o grupo pra ver quantas lojas ele tem e o total da mensalidade.
        </p>
      )}
    </div>
  );
}
