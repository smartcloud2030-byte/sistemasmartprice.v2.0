import { useState } from 'react';
import { ArrowLeft, Sparkles, Download, Share2, ImagePlus, ShoppingCart, Layers } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';
import { FORMATOS, Formato, getFormato } from '../encarte/formatos';

/**
 * Encarte Digital — nova frente de trabalho, construída do zero.
 * O "Encarte" impresso (EncarteBuilder) está em standby.
 *
 * Por ora é só o esqueleto: cabeçalho, seletor de formato e canvas vazio.
 * A partir daqui a gente monta o fluxo próprio do digital.
 */

type Painel = 'formato' | 'produtos' | 'camadas';

const PAINEIS: { id: Painel; label: string; icon: React.ElementType }[] = [
  { id: 'formato', label: 'Formato', icon: ImagePlus },
  { id: 'produtos', label: 'Produtos', icon: ShoppingCart },
  { id: 'camadas', label: 'Camadas', icon: Layers },
];

export default function EncarteDigital() {
  const { setView } = useStore();
  const [painel, setPainel] = useState<Painel>('formato');
  const [formato, setFormato] = useState<Formato>(getFormato('digital'));

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <header className="h-16 flex-shrink-0 border-b border-zinc-800 bg-zinc-900 flex items-center gap-4 px-6">
        <button onClick={() => setView('editor')} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h1 className="text-lg font-black tracking-tighter uppercase">Encarte Digital</h1>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Beta</span>

        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase hover:bg-emerald-500 transition-colors">
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-black uppercase hover:bg-zinc-800 transition-colors">
            <Share2 className="w-3.5 h-3.5" />
            Compartilhar
          </button>
        </div>
      </header>

      <div className="flex-grow flex min-h-0">
        <nav className="w-20 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-4 gap-1">
          {PAINEIS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPainel(id)}
              className={cn(
                'w-16 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-colors',
                painel === id
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                  : 'text-zinc-400 border border-transparent hover:bg-zinc-800 hover:text-zinc-200',
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </nav>

        <aside className="w-72 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto p-4">
          {painel === 'formato' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest">Formato</h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">Tamanho da arte digital</p>
              </div>
              <div className="space-y-2">
                {FORMATOS.map((f) => {
                  const ativo = f.id === formato.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFormato(f)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                        ativo
                          ? 'border-emerald-500/60 bg-emerald-500/10'
                          : 'border-zinc-800 bg-zinc-800/40 hover:border-zinc-600',
                      )}
                    >
                      <div className="w-10 flex items-center justify-center">
                        <div
                          className={cn('rounded-sm border-2', ativo ? 'border-emerald-500' : 'border-zinc-600')}
                          style={{ width: 34 * Math.min(1, f.ratio), height: 34 / Math.max(1, f.ratio) }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className={cn('text-xs font-bold', ativo ? 'text-emerald-300' : 'text-zinc-200')}>{f.label}</p>
                        <p className="text-[10px] text-zinc-500 tabular-nums">{f.width} × {f.height} px</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 text-center h-full text-zinc-500">
              <Layers className="w-8 h-8 text-zinc-700" />
              <p className="text-xs font-semibold">Em construção</p>
            </div>
          )}
        </aside>

        <div className="flex-grow flex items-center justify-center bg-zinc-950 p-8 overflow-auto">
          <div
            className="relative bg-white rounded-xl overflow-hidden shadow-2xl flex items-center justify-center"
            style={{ width: 460, aspectRatio: `${formato.ratio}` }}
          >
            <div className="text-center px-6">
              <Sparkles className="w-6 h-6 text-zinc-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-400">
                Canvas do Encarte Digital
              </p>
              <p className="text-[10px] text-zinc-400 mt-1">{formato.label} · {formato.width} × {formato.height}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
