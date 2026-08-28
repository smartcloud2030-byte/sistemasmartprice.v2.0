import { ArrowLeft, Scissors, Palette, Tag, Trash2, Package, Crown, Images } from 'lucide-react';
import { getProxyUrl, cn } from '../../lib/utils';
import { EncarteProduto } from './encarteProduto';

interface ProdutoDetalhesProps {
  produto: EncarteProduto;
  onAtualizar: (patch: Partial<EncarteProduto>) => void;
  onRemover: () => void;
  onVoltar: () => void;
}

const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'fardo'];

export default function ProdutoDetalhes({ produto, onAtualizar, onRemover, onVoltar }: ProdutoDetalhesProps) {
  const { product } = produto;

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onVoltar} className="p-1.5 -ml-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Detalhes do produto</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Ajustes valem só neste encarte</p>
        </div>
      </div>

      {/* Imagem + ações */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-between p-2.5">
          <div className="flex-grow flex items-center justify-center py-1">
            {product.image ? (
              <img
                src={getProxyUrl(product.thumb_image || product.image, { thumbnail: true })}
                className="max-h-20 w-auto object-contain"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            ) : (
              <Package className="w-10 h-10 text-zinc-600" />
            )}
          </div>
          <button
            disabled
            className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 cursor-not-allowed"
            title="Em breve"
          >
            <Images className="w-3 h-3" />
            Ver mais imagens
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <BotaoAcao icon={Scissors} label="Remover fundo" premium disabled />
          <BotaoAcaoCor icon={Palette} label="Cor de fundo" value={produto.corFundo} onChange={(corFundo) => onAtualizar({ corFundo })} />
          <BotaoAcaoCor icon={Tag} label="Cor da etiqueta" value={produto.corEtiqueta} onChange={(corEtiqueta) => onAtualizar({ corEtiqueta })} />
          <BotaoAcao icon={Trash2} label="Remover produto" danger onClick={onRemover} />
        </div>
      </div>

      {/* Nome */}
      <Campo label="Nome">
        <input
          type="text"
          value={produto.nome}
          onChange={(e) => onAtualizar({ nome: e.target.value })}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
        />
      </Campo>

      {/* Medida */}
      <Campo label="Medida">
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Qtd"
            value={produto.medidaQtd}
            onChange={(e) => onAtualizar({ medidaQtd: e.target.value })}
            className="w-24 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <input
            type="text"
            list="encarte-unidades"
            placeholder="un, kg, L..."
            value={produto.medidaUnidade}
            onChange={(e) => onAtualizar({ medidaUnidade: e.target.value })}
            className="flex-grow px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <datalist id="encarte-unidades">
            {UNIDADES.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
      </Campo>

      {/* Tipo */}
      <Campo label="Tipo">
        <select
          value={produto.tipo}
          onChange={(e) => onAtualizar({ tipo: e.target.value as EncarteProduto['tipo'] })}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          <option value="simples">Simples</option>
        </select>
        <p className="text-[11px] text-zinc-500 mt-1">Preço único</p>
      </Campo>

      {/* Preço oferta */}
      <Campo label="Preço oferta">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={produto.precoOferta}
            onChange={(e) => onAtualizar({ precoOferta: e.target.value })}
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-emerald-500 rounded-lg text-sm font-semibold text-emerald-300 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      </Campo>

      {/* Tamanhos */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300">Tamanhos</h3>
          <Crown className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <SliderEscala label="Produto" value={produto.escalaProduto} onChange={(escalaProduto) => onAtualizar({ escalaProduto })} />
        <SliderEscala label="Etiqueta" value={produto.escalaEtiqueta} onChange={(escalaEtiqueta) => onAtualizar({ escalaEtiqueta })} />
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

function BotaoAcao({
  icon: Icon,
  label,
  premium,
  danger,
  disabled,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  premium?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Em breve' : undefined}
      className={cn(
        'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors',
        disabled
          ? 'border-zinc-800 text-zinc-600 cursor-not-allowed'
          : danger
            ? 'border-zinc-700 text-zinc-300 hover:border-red-500/60 hover:text-red-400 hover:bg-red-500/10'
            : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800',
      )}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate">{label}</span>
      {premium && <Crown className="w-3 h-3 text-amber-400 ml-auto flex-shrink-0" />}
    </button>
  );
}

function BotaoAcaoCor({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 transition-colors cursor-pointer">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate">{label}</span>
      <span
        className="ml-auto w-4 h-4 rounded border border-zinc-600 flex-shrink-0"
        style={{ backgroundColor: value }}
      />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
    </label>
  );
}

function SliderEscala({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-400">{label}</span>
        <span className="text-[10px] tabular-nums text-zinc-500">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0.5}
        max={1.5}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
    </div>
  );
}
