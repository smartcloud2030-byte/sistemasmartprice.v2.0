import { Rows3, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FORMATOS, Formato, FormatoId } from './formatos';

interface FormatosTabProps {
  selecionado: FormatoId;
  onSelecionar: (formato: Formato) => void;
}

export default function FormatosTab({ selecionado, onSelecionar }: FormatosTabProps) {
  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Rows3 className="w-4 h-4 text-emerald-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Formatos</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Escolha o tamanho da página</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {FORMATOS.map((f) => {
          const ativo = f.id === selecionado;
          return (
            <button
              key={f.id}
              onClick={() => onSelecionar(f)}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                ativo
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : 'border-zinc-800 bg-zinc-800/40 hover:border-zinc-600 hover:bg-zinc-800',
              )}
            >
              <div className="w-12 flex-shrink-0 flex items-center justify-center">
                <div
                  className={cn(
                    'rounded-sm border-2',
                    ativo ? 'border-emerald-500 bg-emerald-500/20' : 'border-zinc-600 bg-zinc-700/50',
                  )}
                  style={{ width: 40 * Math.min(1, f.ratio), height: 40 / Math.max(1, f.ratio) }}
                />
              </div>
              <div className="flex-grow min-w-0">
                <p className={cn('text-xs font-bold', ativo ? 'text-emerald-300' : 'text-zinc-200')}>{f.label}</p>
                <p className="text-[10px] text-zinc-500">{f.sublabel}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5 tabular-nums">
                  {f.width} × {f.height} px
                </p>
              </div>
              {ativo && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
