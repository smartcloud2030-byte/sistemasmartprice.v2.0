import React, { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Globe, Sparkles, Tag, X, Check, AlertTriangle, Clock } from 'lucide-react';
import { useStore } from '../store';
import type { Despesa } from '../lib/despesas';
import { despesasDoMes, formatMesAno, mesSeguinte, isPago, patchTogglePago, statusVencimento, diaVencimento } from '../lib/despesas';
import { cn } from '../lib/utils';

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MES_POR_NUM = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const CATEGORIAS: Record<Despesa['categoria'], { label: string; icon: React.ElementType; badgeClass: string }> = {
  dominio: { label: 'Domínio', icon: Globe, badgeClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
  ia: { label: 'IA', icon: Sparkles, badgeClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
  outros: { label: 'Outros', icon: Tag, badgeClass: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' },
};

interface Props {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

type Periodicidade = 'unica' | 'mensal' | 'anual';

const PERIODICIDADES: { id: Periodicidade; label: string }[] = [
  { id: 'unica', label: 'Só 1x' },
  { id: 'mensal', label: 'Mensal' },
  { id: 'anual', label: 'Anual' },
];

interface FormState {
  descricao: string;
  categoria: Despesa['categoria'];
  valor: string;
  periodicidade: Periodicidade;
  data: string;
  dataVencimento: string;
  fornecedor: string;
}

const emptyForm: FormState = {
  descricao: '',
  categoria: 'outros',
  valor: '',
  periodicidade: 'mensal',
  data: new Date().toISOString().slice(0, 10),
  dataVencimento: '',
  fornecedor: '',
};

export default function FinanceiroDespesasTab({ year, month, onPrevMonth, onNextMonth }: Props) {
  const { despesas, addDespesa, updateDespesa, removeDespesa } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const doMes = despesasDoMes(despesas, year, month);

  const openNewForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (d: Despesa) => {
    setEditingId(d.id);
    setForm({
      descricao: d.descricao,
      categoria: d.categoria,
      valor: String(d.valor),
      periodicidade: !d.recorrente ? 'unica' : d.frequencia === 'anual' ? 'anual' : 'mensal',
      data: d.data.slice(0, 10),
      dataVencimento: d.dataVencimento?.slice(0, 10) || '',
      fornecedor: d.fornecedor || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = Number(form.valor.replace(',', '.'));
    if (!form.descricao.trim() || !valor || valor <= 0) return;

    const payload = {
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      valor,
      recorrente: form.periodicidade !== 'unica',
      frequencia: form.periodicidade === 'anual' ? ('anual' as const) : undefined,
      data: form.data,
      dataVencimento: form.dataVencimento || undefined,
      fornecedor: form.fornecedor.trim() || undefined,
    };

    if (editingId) {
      updateDespesa(editingId, payload);
    } else {
      addDespesa({ id: crypto.randomUUID(), ...payload });
    }
    closeForm();
  };

  const handleEncerrarRecorrente = (d: Despesa) => {
    const { ano, mes } = mesSeguinte(year, month);
    updateDespesa(d.id, { dataFim: `${ano}-${String(mes).padStart(2, '0')}-01` });
  };

  const handleTogglePago = (d: Despesa) => {
    updateDespesa(d.id, patchTogglePago(d, year, month));
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-6 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onPrevMonth} aria-label="Mês anterior" className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-bold text-black dark:text-white w-32 text-center">{formatMesAno(year, month)}</p>
          <button onClick={onNextMonth} aria-label="Próximo mês" className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nova despesa
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mx-6 mt-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs font-black uppercase tracking-widest text-zinc-400">{editingId ? 'Editar despesa' : 'Nova despesa'}</p>
            <button type="button" onClick={closeForm} aria-label="Fechar formulário" className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Descrição (ex.: Domínio sistemasmartprice.com.br)"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value as Despesa['categoria'] })}
              className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
            >
              {Object.entries(CATEGORIAS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Valor (R$)"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">Contratação</span>
              <input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">Vencimento (opcional)</span>
              <input
                type="date"
                value={form.dataVencimento}
                onChange={(e) => setForm({ ...form, dataVencimento: e.target.value })}
                placeholder="Igual à contratação"
                className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
              />
            </label>
          </div>
          <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs font-bold">
            {PERIODICIDADES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setForm({ ...form, periodicidade: id })}
                className={cn(
                  'flex-1 py-2 transition-colors',
                  form.periodicidade === id
                    ? 'bg-amber-600 text-white'
                    : 'bg-white dark:bg-zinc-950 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {form.periodicidade !== 'unica' && (
            <p className="text-[11px] text-zinc-400 px-1">
              Vence todo dia {Number((form.dataVencimento || form.data || '0000-00-00').slice(8, 10)) || '--'}
              {form.periodicidade === 'anual' ? ` de ${MES_POR_NUM[Number((form.dataVencimento || form.data || '0000-01-00').slice(5, 7))] ?? '--'}, todo ano` : ' do mês'}.
            </p>
          )}
          <input
            type="text"
            placeholder="Fornecedor/link (opcional)"
            value={form.fornecedor}
            onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
          />
          <button
            type="submit"
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
          >
            {editingId ? 'Salvar alterações' : 'Adicionar despesa'}
          </button>
        </form>
      )}

      <div className="flex-grow overflow-y-auto custom-scrollbar p-6 pt-4 space-y-2">
        {doMes.length === 0 ? (
          <p className="text-center text-xs font-bold uppercase tracking-widest text-zinc-400 py-10">
            Nenhuma despesa neste mês.
          </p>
        ) : (
          doMes.map((d) => {
            const { label, icon: Icon, badgeClass } = CATEGORIAS[d.categoria];
            const pago = isPago(d, year, month);
            const status = statusVencimento(d, year, month);
            const sufixoPeriodo = !d.recorrente ? '' : d.frequencia === 'anual' ? '/ano' : '/mês';
            return (
              <div key={d.id} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl gap-3">
                <button
                  onClick={() => handleTogglePago(d)}
                  aria-label={pago ? 'Marcar como não paga' : 'Marcar como paga'}
                  title={pago ? 'Paga — clique pra desmarcar' : 'Marcar como paga'}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                    pago
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-zinc-300 dark:border-zinc-600 text-transparent hover:border-emerald-400',
                  )}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-3 min-w-0 flex-grow">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', badgeClass)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-black dark:text-white truncate">{d.descricao}</p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {label} · {currency(d.valor)}{sufixoPeriodo}
                      {d.fornecedor && <> · {d.fornecedor}</>}
                    </p>
                  </div>
                  {status === 'vencida' && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-100 dark:bg-red-900/30 flex-shrink-0">
                      <AlertTriangle className="w-3 h-3" /> Vencida
                    </span>
                  )}
                  {status === 'vence_em_breve' && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-100 dark:bg-amber-900/30 flex-shrink-0">
                      <Clock className="w-3 h-3" /> Vence dia {diaVencimento(d)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {d.recorrente && !d.dataFim && (
                    <button
                      onClick={() => handleEncerrarRecorrente(d)}
                      className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                    >
                      Encerrar
                    </button>
                  )}
                  <button onClick={() => openEditForm(d)} aria-label="Editar despesa" className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
                    <Pencil className="w-4 h-4 text-zinc-400" />
                  </button>
                  <button onClick={() => removeDespesa(d.id)} aria-label="Excluir despesa" className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
