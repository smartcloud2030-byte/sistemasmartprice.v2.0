import React, { useState } from 'react';
import { X, Ban, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

const AUTH_HEADERS = { 'Content-Type': 'application/json' };

const MOTIVOS = [
  { codigo: '1', label: 'Erro na emissão' },
  { codigo: '2', label: 'Serviço não prestado' },
  { codigo: '9', label: 'Outros' },
];

interface Props {
  nota: { id: number; numero_nota: string | null; nome_tomador: string; valor: string };
  onClose: () => void;
  onCancelada: () => void;
}

const inputCls = 'w-full mt-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-zinc-400';

export default function NotaFiscalCancelarModal({ nota, onClose, onCancelada }: Props) {
  const [cMotivo, setCMotivo] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const faltam = Math.max(0, 15 - motivo.trim().length);
  const valor = Number(nota.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleCancelar = async () => {
    setErro(null);
    setCancelando(true);
    try {
      const res = await fetch(`/api/notafiscal/${nota.id}/cancelar`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ cMotivo, motivo: motivo.trim(), adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cancelar a nota.');
      onCancelada();
    } catch (err: any) {
      setErro(err.message || 'Erro ao cancelar a nota.');
    } finally {
      setCancelando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[210] flex items-center justify-center p-4 animate-in fade-in duration-200 no-print">
      <div className="w-full max-w-md bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-600" />
            <h3 className="text-sm font-black uppercase tracking-tighter text-black dark:text-white">Cancelar nota nº {nota.numero_nota}</h3>
          </div>
          <button onClick={onClose} disabled={cancelando} className="w-9 h-9 rounded-full flex items-center justify-center border border-zinc-300 dark:border-zinc-600 text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-xs text-red-600">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{nota.nome_tomador} · {valor}. O cancelamento vai pra Receita Federal e <b>não tem como desfazer</b>.</span>
          </div>

          <div>
            <label className={labelCls}>Motivo</label>
            <select value={cMotivo} onChange={(e) => setCMotivo(e.target.value)} className={inputCls}>
              {MOTIVOS.map((m) => <option key={m.codigo} value={m.codigo}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Justificativa (mínimo 15 caracteres)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.slice(0, 255))}
              rows={2}
              placeholder="Ex.: Nota emitida em teste, serviço não foi prestado."
              className={cn(inputCls, 'resize-none')}
            />
            <p className="text-[10px] text-zinc-400 mt-1">{faltam > 0 ? `Faltam ${faltam} caracteres` : `${motivo.trim().length}/255`}</p>
          </div>

          <div>
            <label className={labelCls}>Confirme sua senha de admin</label>
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Sua senha de administrador" className={inputCls} />
          </div>

          {erro && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-xs text-red-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {erro}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={cancelando}
              className="flex-1 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-black dark:text-white hover:border-zinc-400 transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={handleCancelar}
              disabled={cancelando || faltam > 0 || !adminPassword}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white text-sm font-black uppercase tracking-widest hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {cancelando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />} Cancelar nota
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
