import React, { useEffect, useRef, useState } from 'react';
import { X, Copy, CreditCard, QrCode, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useStore } from '../store';
import { getSocket } from '../hooks/useSupportSocket';

interface ChargeData {
  paymentId: string;
  status: string;
  value: number;
  invoiceUrl: string;
  pixQrCode: { encodedImage: string; payload: string } | null;
}

interface Props {
  cnpj: string;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 5000;

export default function PaymentCheckoutModal({ cnpj, onClose }: Props) {
  const loadUsersAndFlags = useStore((s) => s.loadUsersAndFlags);
  const [charge, setCharge] = useState<ChargeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pix' | 'card'>('pix');
  const [cleared, setCleared] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCharge = async () => {
    try {
      const res = await fetch(`/api/payments/charge/${cnpj}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar cobrança');
      setCharge(data);
      setError(null);
      if (data.status === 'CONFIRMED' || data.status === 'RECEIVED') handleCleared();
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar cobrança');
    }
  };

  const handleCleared = async () => {
    if (cleared) return;
    setCleared(true);
    if (pollRef.current) clearInterval(pollRef.current);
    await loadUsersAndFlags();
    toast.success('Pagamento confirmado! Acesso liberado.');
    setTimeout(onClose, 1500);
  };

  useEffect(() => {
    fetchCharge();
    pollRef.current = setInterval(fetchCharge, POLL_INTERVAL_MS);

    const socket = getSocket();
    const onPaymentCleared = () => handleCleared();
    socket.on('payment:cleared', onPaymentCleared);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      socket.off('payment:cleared', onPaymentCleared);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj]);

  const copyPixCode = () => {
    if (!charge?.pixQrCode) return;
    navigator.clipboard.writeText(charge.pixQrCode.payload);
    toast.success('Código PIX copiado!');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="text-sm font-black uppercase tracking-tighter text-black dark:text-white">Regularizar Pagamento</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="p-6">
          {cleared ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="text-sm font-bold text-black dark:text-white">Pagamento confirmado!</p>
              <p className="text-xs text-zinc-500">Liberando o acesso...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-red-600 font-bold">{error}</p>
              <button onClick={fetchCharge} className="text-xs font-black uppercase tracking-widest text-blue-600">Tentar novamente</button>
            </div>
          ) : !charge ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-5 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl">
                <button
                  onClick={() => setTab('pix')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                    tab === 'pix' ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500'
                  )}
                >
                  <QrCode className="w-3.5 h-3.5" /> PIX
                </button>
                <button
                  onClick={() => setTab('card')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                    tab === 'card' ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500'
                  )}
                >
                  <CreditCard className="w-3.5 h-3.5" /> Cartão
                </button>
              </div>

              <p className="text-center text-2xl font-black tracking-tighter text-black dark:text-white mb-5">
                {charge.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>

              {tab === 'pix' ? (
                charge.pixQrCode ? (
                  <div className="space-y-4">
                    <img
                      src={`data:image/png;base64,${charge.pixQrCode.encodedImage}`}
                      alt="QR Code PIX"
                      className="w-48 h-48 mx-auto rounded-xl border border-zinc-200 dark:border-zinc-800"
                    />
                    <button
                      onClick={copyPixCode}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl text-xs font-bold text-black dark:text-white transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copiar código PIX
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-xs text-zinc-500 py-8">PIX indisponível para esta cobrança — use a aba Cartão.</p>
                )
              ) : (
                <div className="space-y-3 text-center py-4">
                  <p className="text-xs text-zinc-500">Você será redirecionado ao ambiente seguro de pagamento.</p>
                  <a
                    href={charge.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Pagar com Cartão
                  </a>
                </div>
              )}

              <p className="text-center text-[10px] text-zinc-400 mt-5">
                O acesso é liberado automaticamente assim que o pagamento é confirmado.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
