import React from 'react';
import { useStore } from '../store';
import { X, LifeBuoy, Server, Printer, Wifi, CreditCard, HardDrive } from 'lucide-react';

export default function SmartHelpModal() {
  const { isSmartHelpModalOpen, setSmartHelpModalOpen } = useStore();

  if (!isSmartHelpModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-lg shadow-emerald-500/20">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tighter uppercase text-black dark:text-white">SmartHelp</h3>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Infraestrutura das lojas do Grupo Fênix</p>
            </div>
          </div>
          <button
            onClick={() => setSmartHelpModalOpen(false)}
            className="p-3 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <p className="text-sm text-black dark:text-white opacity-60">
            Área reservada para suporte de infraestrutura (servidor, máquinas, impressoras, provedor, TEF e sistema de cartão) — separada do suporte de uso do SmartPrice. Em construção.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { icon: Server, label: 'Servidor' },
              { icon: HardDrive, label: 'Máquinas' },
              { icon: Printer, label: 'Impressoras' },
              { icon: Wifi, label: 'Provedor' },
              { icon: CreditCard, label: 'TEF / Cartão' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 text-zinc-400">
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
