import React, { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Globe, Sparkles, Tag, X } from 'lucide-react';
import { useStore } from '../store';
import type { Despesa } from '../lib/despesas';
import { despesasDoMes, formatMesAno } from '../lib/despesas';
import { cn } from '../lib/utils';

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

interface FormState {
  descricao: string;
  categoria: Despesa['categoria'];
  valor: string;
  recorrente: boolean;
  data: string;
  fornecedor: string;
}

const emptyForm: FormState = {
  descricao: '',
  categoria: 'outros',
  valor: '',
  recorrente: true,
  data: new Date().toISOString().slice(0, 10),
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
      recorrente: d.recorrente,
      data: d.data.slice(0, 10),
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
      recorrente: form.recorrente,
      data: form.data,
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
    updateDespesa(d.id, { dataFim: new Date().toISOString().slice(0, 10) });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-6 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onPrevMonth} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-bold text-black dark:text-white w-32 text-center">{formatMesAno(year, month)}</p>
          <button onClick={onNextMonth} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
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
            <button type="button" onClick={closeForm} className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full">
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
            <input
              type="date"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
              required
            />
            <label className="flex items-center gap-2 text-sm text-black dark:text-white px-1">
              <input
                type="checkbox"
                checked={form.recorrente}
                onChange={(e) => setForm({ ...form, recorrente: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              Recorrente (todo mês)
            </label>
          </div>
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
            return (
              <div key={d.id} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', badgeClass)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-black dark:text-white truncate">{d.descricao}</p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {label} · {currency(d.valor)}{d.recorrente ? '/mês' : ''}
                      {d.fornecedor && <> · {d.fornecedor}</>}
                    </p>
                  </div>
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
                  <button onClick={() => openEditForm(d)} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
                    <Pencil className="w-4 h-4 text-zinc-400" />
                  </button>
                  <button onClick={() => removeDespesa(d.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors">
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
