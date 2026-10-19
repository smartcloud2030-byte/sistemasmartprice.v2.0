import React, { useState } from 'react';
import { FileText, Files } from 'lucide-react';
import NotaFiscalModal from './NotaFiscalModal';
import NotaFiscalLoteModal from './NotaFiscalLoteModal';
import NotaFiscalHistorico from './NotaFiscalHistorico';
import NotaFiscalAgendamentos from './NotaFiscalAgendamentos';

export default function FinanceiroNotasTab() {
  const [aberto, setAberto] = useState<'uma' | 'lote' | null>(null);
  const [historicoKey, setHistoricoKey] = useState(0);
  const atualizarHistorico = () => setHistoricoKey((k) => k + 1);
  const fechar = () => { setAberto(null); atualizarHistorico(); };

  return (
    <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setAberto('uma')}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors"
        >
          <FileText className="w-4 h-4" /> Emitir nota fiscal
        </button>
        <button
          onClick={() => setAberto('lote')}
          className="flex items-center gap-2 px-5 py-3 rounded-xl border border-emerald-600 text-emerald-600 text-sm font-black uppercase tracking-widest hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
        >
          <Files className="w-4 h-4" /> Emitir em lote
        </button>
      </div>

      <NotaFiscalAgendamentos key={`ag-${historicoKey}`} onMudou={atualizarHistorico} />

      <NotaFiscalHistorico key={historicoKey} />

      {aberto === 'uma' && <NotaFiscalModal onClose={fechar} onEmitted={atualizarHistorico} />}
      {aberto === 'lote' && <NotaFiscalLoteModal onClose={fechar} onEmitted={atualizarHistorico} />}
    </div>
  );
}
