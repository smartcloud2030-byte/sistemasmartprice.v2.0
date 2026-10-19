import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import NotaFiscalModal from './NotaFiscalModal';
import NotaFiscalHistorico from './NotaFiscalHistorico';

export default function FinanceiroNotasTab() {
  const [emitindo, setEmitindo] = useState(false);
  const [historicoKey, setHistoricoKey] = useState(0);

  return (
    <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
      <button
        onClick={() => setEmitindo(true)}
        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors"
      >
        <FileText className="w-4 h-4" /> Emitir nota fiscal
      </button>

      <NotaFiscalHistorico key={historicoKey} />

      {emitindo && (
        <NotaFiscalModal
          onClose={() => { setEmitindo(false); setHistoricoKey((k) => k + 1); }}
          onEmitted={() => setHistoricoKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
