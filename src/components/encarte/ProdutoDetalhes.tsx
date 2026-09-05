import { ArrowLeft, ArrowRightLeft, Scissors, Palette, Tag, Trash2, Package, Crown, Images } from 'lucide-react';
import { getProxyUrl, cn } from '../../lib/utils';
import { EncarteProduto, EstiloEncarte, ModeloCard, MODELOS_CARD } from './encarteProduto';

interface ProdutoDetalhesProps {
  produto: EncarteProduto;
  estilo: EstiloEncarte;
  ladoAtivo: 'frente' | 'verso';
  onAtualizar: (patch: Partial<EncarteProduto>) => void;
  onAtualizarEstilo: (patch: Partial<EstiloEncarte>) => void;
  onRemover: () => void;
  onEnviarParaOutroLado: () => void;
  onVoltar: () => void;
}

const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'fardo'];

export default function ProdutoDetalhes({
  produto,
  estilo,
  ladoAtivo,
  onAtualizar,
  onAtualizarEstilo,
  onRemover,
  onEnviarParaOutroLado,
  onVoltar,
}: ProdutoDetalhesProps) {
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
          <p className="text-[11px] text-zinc-400 mt-0.5">Nome, descrição e preço são só deste produto</p>
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
          <BotaoAcaoCor icon={Palette} label="Cor de fundo" value={estilo.corFundo} onChange={(corFundo) => onAtualizarEstilo({ corFundo })} />
          <BotaoAcaoCor icon={Tag} label="Cor da etiqueta" value={estilo.corEtiqueta} onChange={(corEtiqueta) => onAtualizarEstilo({ corEtiqueta })} />
          <BotaoAcao
            icon={ArrowRightLeft}
            label={ladoAtivo === 'frente' ? 'Enviar pro verso' : 'Enviar pra frente'}
            onClick={onEnviarParaOutroLado}
          />
          <BotaoAcao icon={Trash2} label="Remover produto" danger onClick={onRemover} />
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[10px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
        <Crown className="w-3 h-3 mt-px flex-shrink-0" />
        Modelo, cor e tamanho valem para todos os produtos do encarte.
      </p>

      {/* Modelo do card */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Modelo do card</label>
        <div className="grid grid-cols-3 gap-1.5">
          {MODELOS_CARD.map((m) => (
            <button
              key={m.id}
              onClick={() => onAtualizarEstilo({ modeloCard: m.id })}
              title={m.descricao}
              className={cn(
                'rounded-lg border p-2 flex flex-col items-center gap-1.5 transition-colors',
                estilo.modeloCard === m.id
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500',
              )}
            >
              <MiniModelo modelo={m.id} />
              <span className="text-[10px] font-semibold">{m.nome}</span>
            </button>
          ))}
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

      {/* Descrição */}
      <Campo label="Descrição">
        <textarea
          rows={2}
          value={produto.descricao}
          onChange={(e) => onAtualizar({ descricao: e.target.value })}
          placeholder="Ex.: sabor morango, 900g"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
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

      {/* Preços */}
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Preço de">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">R$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="opcional"
              value={produto.precoDe}
              onChange={(e) => onAtualizar({ precoDe: e.target.value })}
              className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 line-through focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </Campo>
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
      </div>

      {/* Produto em destaque */}
      <label className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2.5 cursor-pointer">
        <div>
          <p className="text-xs font-semibold text-zinc-200">Produto em destaque</p>
          <p className="text-[10px] text-zinc-500">Card largo, ignora o modelo do encarte</p>
        </div>
        <input
          type="checkbox"
          checked={produto.emDestaque}
          onChange={(e) => onAtualizar({ emDestaque: e.target.checked })}
          className="w-4 h-4 accent-emerald-500"
        />
      </label>

      {/* Tamanhos */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300">Tamanhos</h3>
          <Crown className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <SliderEscala label="Produto" value={estilo.escalaCard} onChange={(escalaCard) => onAtualizarEstilo({ escalaCard })} />
        <SliderEscala label="Etiqueta" value={estilo.escalaEtiqueta} onChange={(escalaEtiqueta) => onAtualizarEstilo({ escalaEtiqueta })} />
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

function MiniModelo({ modelo }: { modelo: ModeloCard }) {
  const semFundo = modelo === 'destaque';
  const fotoEsquerda = modelo === 'clean';
  const foto = <div className="w-3 h-full rounded-sm bg-current/40 flex-shrink-0" />;
  const linhas = (
    <div className="flex-1 flex flex-col gap-0.5">
      <div className="h-1 w-full rounded-full bg-current/50" />
      <div className="h-1 w-2/3 rounded-full bg-current/30" />
      <div className="h-1 w-1/3 rounded-full bg-current/50 mt-0.5" />
    </div>
  );
  return (
    <div
      className={cn(
        'w-full h-9 rounded flex items-center gap-1 p-1',
        semFundo ? 'border border-dashed border-current/50' : 'border border-current/40 bg-current/10',
      )}
    >
      {fotoEsquerda && foto}
      {linhas}
      {!fotoEsquerda && foto}
    </div>
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
