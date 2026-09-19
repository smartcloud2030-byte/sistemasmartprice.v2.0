import { useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '../../store';
import LayoutSelectorModal from '../LayoutSelectorModal';
import { EncarteProduto } from './encarteProduto';
import { gerarPlaquinhasDoEncarte } from './gerarPlaquinhas';

/**
 * "Add placa de preço" no Encarte Online — reaproveita a MESMA galeria de
 * "Modelos disponíveis" (`LayoutSelectorModal`) usada no editor de
 * plaquinha avulsa, já filtrada pelos modelos liberados pra esse usuário/
 * loja. Ao escolher um modelo, gera uma plaquinha por produto do encarte
 * (frente + verso) nesse estilo e manda tudo pra fila de impressão.
 */
export default function GerarPlaquinhasModal({
  produtos,
  onClose,
}: {
  produtos: EncarteProduto[];
  onClose: () => void;
}) {
  const { layouts, userRole, currentUser, allowedStores, activeLayoutIndex } = useStore();
  const [gerando, setGerando] = useState(false);
  // Ref (não state) porque precisa estar correto na hora síncrona em que o
  // LayoutSelectorModal chama onClose logo depois de onSelect — um state
  // só comitaria depois, tarde demais pra essa checagem.
  const emGeracaoRef = useRef(false);

  const filteredLayouts = useMemo(() => {
    let base = layouts.map((l, i) => ({ ...l, originalIndex: i }));
    if (userRole !== 'admin') {
      const cnpj = currentUser?.cnpj?.replace(/[^\d]/g, '') || '';
      const loja = allowedStores.find((s) => s.cnpj?.replace(/[^\d]/g, '') === cnpj);
      if (!loja || !loja.allowedLayouts || loja.allowedLayouts.length === 0) return [];
      base = base.filter((_, index) => loja.allowedLayouts?.includes(index));
    }
    return base.filter((l) => !l.hidden).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [layouts, userRole, currentUser, allowedStores]);

  const handleSelect = async (layoutIndex: number) => {
    if (emGeracaoRef.current) return;
    emGeracaoRef.current = true;
    setGerando(true);
    const toastId = toast.loading('Gerando placas de preço...');
    try {
      const qtd = await gerarPlaquinhasDoEncarte(layoutIndex, produtos);
      if (qtd > 0) {
        toast.success(`${qtd} ${qtd === 1 ? 'placa adicionada' : 'placas adicionadas'} à fila de impressão!`, { id: toastId });
      } else {
        toast.error('Nenhum produto no encarte pra gerar placa.', { id: toastId });
      }
    } catch (err) {
      console.error('Erro ao gerar placas do encarte:', err);
      toast.error('Erro ao gerar as placas — tente novamente.', { id: toastId });
    } finally {
      onClose();
    }
  };

  const handleCloseGaleria = () => {
    // O LayoutSelectorModal chama isso tanto quando o usuário cancela (X,
    // clicar fora) quanto logo depois de escolher um modelo — só fecha
    // tudo aqui se for cancelamento; se já escolheu, quem fecha é o
    // `finally` de handleSelect, depois de terminar a geração.
    if (!emGeracaoRef.current) onClose();
  };

  return (
    <>
      <LayoutSelectorModal
        isOpen
        onClose={handleCloseGaleria}
        layouts={filteredLayouts}
        onSelect={handleSelect}
        activeLayoutIndex={activeLayoutIndex}
      />
      {gerando && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3 text-zinc-200">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm font-semibold">Gerando placas de preço...</p>
          </div>
        </div>
      )}
    </>
  );
}
