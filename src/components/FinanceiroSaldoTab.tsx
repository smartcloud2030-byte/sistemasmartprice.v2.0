import React, { useState } from 'react';
import { Plus, ArrowDownCircle, ArrowUpCircle, RotateCcw, Pencil, X } from 'lucide-react';
import { useStore } from '../store';
import { ordenarPorDataDesc, type LancamentoSaldo } from '../lib/lancamentosSaldo';
import { cn } from '../lib/utils';

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ICONE_TIPO: Record<LancamentoSaldo['tipo'], React.ElementType> = {
  deposito: ArrowUpCircle,
  despesa: ArrowDownCircle,
  estorno: RotateCcw,
  ajuste: Pencil,
};

const LABEL_TIPO: Record<LancamentoSaldo['tipo'], string> = {
  deposito: 'Depósito',
  despesa: 'Pagamento',
  estorno: 'Estorno',
  ajuste: 'Ajuste manual',
};

export default function FinanceiroSaldoTab() {
  const { saldoEmConta, lancamentosSaldo, registrarLancamentoSaldo } = useStore();
  const [showDeposito, setShowDeposito] = useState(false);
  const [showAjuste, setShowAjuste] = useState(false);
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [ajusteValor, setAjusteValor] = useState('');

  const devedor = (saldoEmConta || 0) < 0;
  const extrato = ordenarPorDataDesc(lancamentosSaldo);

  const closeDeposito = () => {
    setShowDeposito(false);
    setValor('');
    setDescricao('');
  };

  const handleDepositar = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(valor.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    registrarLancamentoSaldo({ tipo: 'deposito', descricao: descricao.trim() || 'Depósito', valor: v });
    closeDeposito();
  };

  const closeAjuste = () => {
    setShowAjuste(false);
    setAjusteValor('');
  };

  const handleAjustar = (e: React.FormEvent) => {
    e.preventDefault();
    const novoSaldo = Number(ajusteValor.replace(',', '.'));
    if (!Number.isFinite(novoSaldo)) return;
    const delta = novoSaldo - (saldoEmConta || 0);
    if (delta === 0) { closeAjuste(); return; }
    registrarLancamentoSaldo({ tipo: 'ajuste', descricao: 'Ajuste manual do saldo', valor: delta });
    closeAjuste();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-6 pt-4">
        <div className={cn(
          'rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap',
          devedor ? 'bg-red-50 dark:bg-red-900/20' : 'bg-zinc-50 dark:bg-zinc-800/50',
        )}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
              {devedor ? 'Saldo devedor' : 'Saldo em conta'}
            </p>
            <p className={cn('text-3xl font-black tracking-tighter', devedor ? 'text-red-600' : 'text-black dark:text-white')}>
              {currency(Math.abs(saldoEmConta || 0))}
            </p>
            {devedor && (
              <p className="text-[11px] text-red-500 mt-0.5">Você pagou mais despesa do que tinha registrado em conta.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAjusteValor(String(saldoEmConta || '')); setShowAjuste(true); }}
              title="Ajustar saldo manualmente (correção)"
              className="p-2.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-400"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowDeposito(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar ao saldo
            </button>
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar p-6 pt-4 space-y-2">
        {showDeposito && (
          <form onSubmit={handleDepositar} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl space-y-3 mb-2">
            <div className="flex justify-between items-center">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Adicionar ao saldo</p>
              <button type="button" onClick={closeDeposito} aria-label="Fechar formulário" className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              autoFocus
              placeholder="Valor depositado (R$)"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
              required
            />
            <input
              type="text"
              placeholder="Descrição (opcional, ex.: Pix da bandeira X)"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
            />
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
            >
              Confirmar depósito
            </button>
          </form>
        )}

        {showAjuste && (
          <form onSubmit={handleAjustar} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl space-y-3 mb-2">
            <div className="flex justify-between items-center">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Ajustar saldo (correção)</p>
              <button type="button" onClick={closeAjuste} aria-label="Fechar formulário" className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 px-1">Use só pra corrigir um erro de digitação — mudanças de dinheiro de verdade entram por "Adicionar ao saldo" ou efetivando uma despesa.</p>
            <input
              type="number"
              step="0.01"
              autoFocus
              placeholder="Novo saldo total (R$)"
              value={ajusteValor}
              onChange={(e) => setAjusteValor(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
              required
            />
            <button
              type="submit"
              className="w-full py-2.5 bg-zinc-700 hover:bg-zinc-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
            >
              Salvar ajuste
            </button>
          </form>
        )}

        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1 pt-2">Extrato</p>
        {extrato.length === 0 ? (
          <p className="text-center text-xs font-bold uppercase tracking-widest text-zinc-400 py-10">
            Nenhum lançamento ainda.
          </p>
        ) : (
          extrato.map((l) => {
            const Icon = ICONE_TIPO[l.tipo];
            const positivo = l.valor >= 0;
            return (
              <div key={l.id} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                    positivo ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600',
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-black dark:text-white truncate">{l.descricao}</p>
                    <p className="text-[11px] text-zinc-400">
                      {LABEL_TIPO[l.tipo]} · {new Date(l.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <p className={cn('text-sm font-black tracking-tighter flex-shrink-0', positivo ? 'text-emerald-600' : 'text-red-600')}>
                  {positivo ? '+' : ''}{currency(l.valor)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
