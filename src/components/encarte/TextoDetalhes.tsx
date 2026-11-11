import { useState } from 'react';
import {
  ArrowLeft, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Minus, Plus, Trash2, ChevronDown,
  ArrowRightLeft, Copy, RotateCcw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { TextoEncarte, TextoAlinhamento } from './encarteProduto';
import FontePicker from './FontePicker';
import { Lado, NOME_LADO } from './ladosEncarte';

const TAM_MIN = 1;
const TAM_MAX = 120;
const CORES_RAPIDAS = ['#ffffff', '#000000', '#16a34a', '#facc15', '#dc2626', '#f97316', '#1d4ed8'];

interface TextoDetalhesProps {
  texto: TextoEncarte;
  ladoAtivo: Lado;
  paginas: Lado[];
  onEditar: (conteudo: string) => void;
  onEstilizar: (patch: Partial<TextoEncarte>) => void;
  onRemover: () => void;
  onEnviarParaOutroLado: (destino: Lado | 'todos', modo: 'copiar' | 'mover') => void;
  onFechar: () => void;
}

/** Painel lateral do texto selecionado no encarte (some ao soltar a seleção). */
export default function TextoDetalhes({
  texto: t, ladoAtivo, paginas, onEditar, onEstilizar, onRemover, onEnviarParaOutroLado, onFechar,
}: TextoDetalhesProps) {
  const [fontesAberta, setFontesAberta] = useState(false);
  const outras = paginas.filter((p) => p !== ladoAtivo);
  const tamanho = (v: number) => onEstilizar({ tamanho: Math.min(TAM_MAX, Math.max(TAM_MIN, Math.round(v))) });
  const temIcones = /\[(whatsapp|instagram)\]/i.test(t.texto);

  const alinhamentos: { id: TextoAlinhamento; Icone: typeof AlignLeft; nome: string }[] = [
    { id: 'left', Icone: AlignLeft, nome: 'Esquerda' },
    { id: 'center', Icone: AlignCenter, nome: 'Centro' },
    { id: 'right', Icone: AlignRight, nome: 'Direita' },
  ];

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onFechar} title="Fechar" className="p-1.5 -ml-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Texto</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Clique fora do texto no encarte pra fechar</p>
        </div>
      </div>

      {/* Conteúdo */}
      <Secao titulo="Escrever">
        <textarea
          value={t.texto}
          onChange={(e) => onEditar(e.target.value)}
          rows={Math.min(8, Math.max(3, t.texto.split('\n').length + 1))}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-y"
        />
        {temIcones && (
          <p className="text-[10px] text-zinc-500">[whatsapp] e [instagram] viram os ícones — não apague.</p>
        )}
      </Secao>

      {/* Fonte */}
      <Secao titulo="Fonte">
        <button
          onClick={() => setFontesAberta((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 hover:border-zinc-600"
          style={{ fontFamily: `'${t.fontFamily}', sans-serif` }}
        >
          <span className="truncate">{t.fontFamily}</span>
          <ChevronDown className={cn('w-4 h-4 text-zinc-500 transition-transform', fontesAberta && 'rotate-180')} />
        </button>
        {fontesAberta && (
          <FontePicker
            valor={t.fontFamily}
            onEscolher={(fontFamily) => onEstilizar({ fontFamily })}
            onFechar={() => setFontesAberta(false)}
            className="!w-full !max-w-none !shadow-none"
          />
        )}
      </Secao>

      {/* Tamanho */}
      <Secao titulo="Tamanho">
        <div className="flex items-center gap-2">
          <button onClick={() => tamanho(t.tamanho - 1)} title="Diminuir" className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <input
            type="number"
            min={TAM_MIN}
            max={TAM_MAX}
            value={Math.round(t.tamanho)}
            onChange={(e) => tamanho(Number(e.target.value) || TAM_MIN)}
            className="w-14 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-center text-zinc-100 outline-none focus:border-emerald-500"
          />
          <button onClick={() => tamanho(t.tamanho + 1)} title="Aumentar" className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <input
          type="range"
          min={4}
          max={80}
          step={1}
          value={Math.min(80, t.tamanho)}
          onChange={(e) => tamanho(Number(e.target.value))}
          className="w-full accent-emerald-500"
        />
      </Secao>

      {/* Estilo + alinhamento */}
      <Secao titulo="Estilo">
        <div className="flex items-center gap-1.5 flex-wrap">
          <BotaoEstado ativo={t.negrito} onClick={() => onEstilizar({ negrito: !t.negrito })} titulo="Negrito"><Bold className="w-4 h-4" /></BotaoEstado>
          <BotaoEstado ativo={t.italico} onClick={() => onEstilizar({ italico: !t.italico })} titulo="Itálico"><Italic className="w-4 h-4" /></BotaoEstado>
          <span className="w-px h-6 bg-zinc-700 mx-1" />
          {alinhamentos.map(({ id, Icone, nome }) => (
            <BotaoEstado key={id} ativo={t.alinhamento === id} onClick={() => onEstilizar({ alinhamento: id })} titulo={nome}>
              <Icone className="w-4 h-4" />
            </BotaoEstado>
          ))}
        </div>
      </Secao>

      {/* Cor */}
      <Secao titulo="Cor">
        <div className="flex items-center gap-1.5 flex-wrap">
          {CORES_RAPIDAS.map((c) => (
            <button
              key={c}
              onClick={() => onEstilizar({ cor: c })}
              title={c}
              className={cn(
                'w-6 h-6 rounded border',
                t.cor.toLowerCase() === c ? 'border-emerald-400 ring-2 ring-emerald-500/50' : 'border-zinc-600',
              )}
              style={{ background: c }}
            />
          ))}
          <label className="flex items-center gap-1.5 ml-1 cursor-pointer" title="Outra cor">
            <input
              type="color"
              value={t.cor}
              onChange={(e) => onEstilizar({ cor: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-[10px] text-zinc-500 uppercase">{t.cor}</span>
          </label>
        </div>
      </Secao>

      {/* Girar */}
      <Secao titulo="Girar">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={t.rotacao ?? 0}
            onChange={(e) => onEstilizar({ rotacao: Number(e.target.value) })}
            className="flex-1 accent-emerald-500"
          />
          <span className="text-[10px] tabular-nums text-zinc-500 w-9 text-right">{Math.round(t.rotacao ?? 0)}°</span>
          <button onClick={() => onEstilizar({ rotacao: 0 })} title="Endireitar" className="p-1 text-zinc-400 hover:text-zinc-100">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </Secao>

      {/* Outras páginas */}
      {outras.length > 0 && (
        <Secao titulo="Outras páginas">
          <div className="space-y-1.5">
            {outras.map((p) => (
              <div key={p} className="flex items-center gap-1.5">
                <button
                  onClick={() => onEnviarParaOutroLado(p, 'copiar')}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar pro {NOME_LADO[p]}
                </button>
                <button
                  onClick={() => onEnviarParaOutroLado(p, 'mover')}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Mandar pro {NOME_LADO[p]}
                </button>
              </div>
            ))}
          </div>
        </Secao>
      )}

      <button
        onClick={onRemover}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-500/40 text-sm font-semibold text-red-400 hover:bg-red-500/10"
      >
        <Trash2 className="w-4 h-4" /> Remover texto
      </button>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300">{titulo}</h3>
      {children}
    </div>
  );
}

function BotaoEstado({ ativo, onClick, titulo, children }: { ativo: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      className={cn(
        'p-1.5 rounded-lg border transition-colors',
        ativo ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 text-zinc-400 hover:text-zinc-100',
      )}
    >
      {children}
    </button>
  );
}
