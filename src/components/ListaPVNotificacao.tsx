import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { useStore } from '../store';
import { chaveListaPV, normalizarUsuarioPV } from '../lib/acessoListaPV';
import { normalizarFaixas, dataBR, type ItemPV } from '../lib/listaPV';
import { avisosPendentes, limparVistos, textoDias, ROTULO_MARCO, type AvisoPV, type MarcoPV } from '../lib/avisosListaPV';
import { cn } from '../lib/utils';

// Aviso no canto da tela pro usuário liberado na Lista PV quando um produto
// entra no período mais próximo do vencimento, quando falta 1 semana e quando
// falta 1 dia. Cada marco avisa UMA vez por usuário: fica marcado como avisado
// no momento em que aparece (recarregar a página ou outra aba não repete).
// Se o usuário permitir, também sai a notificação do Windows/Mac.

const INTERVALO_MS = 30 * 60 * 1000;

const COR_MARCO: Record<MarcoPV, string> = {
  umDia: 'text-red-700 dark:text-red-400',
  semana: 'text-red-600 dark:text-red-400',
  vermelho: 'text-amber-700 dark:text-amber-400',
};

function lerVistos(chave: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(chave) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

function gravarVistos(chave: string, vistos: Set<string>) {
  try { localStorage.setItem(chave, JSON.stringify([...vistos])); } catch { /* navegador sem storage */ }
}

export function notificarSistema(avisos: AvisoPV[]) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !avisos.length) return;
  const p = avisos[0];
  const titulo = avisos.length === 1 ? `Lista PV: ${p.item.produto || p.item.codigo}` : `Lista PV: ${avisos.length} produtos perto do vencimento`;
  const corpo = avisos.length === 1
    ? `${ROTULO_MARCO[p.marco]} — ${textoDias(p.dias)} (${dataBR(p.item.vencimento)})`
    : avisos.slice(0, 3).map((a) => `${a.item.produto || a.item.codigo}: ${textoDias(a.dias)}`).join('\n');
  try { new Notification(titulo, { body: corpo, tag: 'lista-pv' }); } catch { /* alguns navegadores só deixam via service worker */ }
}

interface PropsCartao {
  avisos: AvisoPV[];
  onFechar: () => void;
  onVerLista?: () => void;
  /** Aviso de teste do admin: mostra a faixa "Teste" e não grava nada. */
  teste?: boolean;
}

export function CartaoAvisosPV({ avisos, onFechar, onVerLista, teste }: PropsCartao) {
  const [permissao, setPermissao] = useState(() => (typeof Notification === 'undefined' ? 'denied' : Notification.permission));
  const pedirPermissao = async () => {
    if (typeof Notification === 'undefined') return;
    const r = await Notification.requestPermission();
    setPermissao(r);
    if (r === 'granted') notificarSistema(avisos);
  };
  if (!avisos.length) return null;
  const primeiros = avisos.slice(0, 5);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[calc(100%-3rem)] max-w-sm no-print animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 border-l-4 border-l-red-600 bg-white dark:bg-zinc-900 p-4 shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {avisos.length === 1 ? 'Produto perto do vencimento' : `${avisos.length} produtos perto do vencimento`}
            </p>
            {teste && <span className="text-[10px] font-semibold uppercase text-zinc-500 border border-zinc-300 dark:border-zinc-700 rounded px-1">Teste</span>}
          </div>
          <button onClick={onFechar} aria-label="Fechar aviso" className="p-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {primeiros.map((a) => (
            <div key={a.chave} className="py-1.5 text-xs flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{a.item.produto || a.item.codigo}</p>
                <p className={cn('text-[11px]', COR_MARCO[a.marco])}>{ROTULO_MARCO[a.marco]}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-zinc-700 dark:text-zinc-300">{textoDias(a.dias)}</p>
                <p className="text-[11px] text-zinc-500">{dataBR(a.item.vencimento)}{a.item.loja ? ` · ${a.item.loja}` : ''}</p>
              </div>
            </div>
          ))}
          {avisos.length > primeiros.length && (
            <p className="pt-1.5 text-[11px] text-zinc-500">+ {avisos.length - primeiros.length} outro(s)</p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {permissao === 'default' ? (
            <button onClick={pedirPermissao} className="text-[11px] text-blue-600 hover:underline">
              Avisar também no computador
            </button>
          ) : permissao === 'denied' && teste ? (
            <span className="text-[11px] text-zinc-500">Notificação do computador bloqueada no navegador</span>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onFechar} className="px-3 py-1.5 rounded-md text-xs border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">
              Ok
            </button>
            {onVerLista && (
              <button onClick={onVerLista} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white">
                Ver Lista PV
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ListaPVNotificacao() {
  const { currentUser, setView } = useStore();
  const cnpj = String(currentUser?.cnpj ?? '').replace(/\D/g, '');
  const chaveVistos = `sp_pv_avisos_${cnpj}_${normalizarUsuarioPV(currentUser?.username)}`;
  const [avisos, setAvisos] = useState<AvisoPV[]>([]);

  const verificar = useCallback(async () => {
    if (!cnpj) return;
    try {
      const res = await fetch(`/api/settings/${chaveListaPV(cnpj)}`);
      if (!res.ok) return;
      const v = (await res.json())?.value;
      const itens: ItemPV[] = Array.isArray(v?.itens) ? v.itens : [];
      const limite = normalizarFaixas(v?.periodos).limites[0];
      const vistos = limparVistos(lerVistos(chaveVistos), itens);
      const novos = avisosPendentes(itens, limite, vistos);
      // Marca já na hora de mostrar: não volta a avisar o mesmo marco.
      novos.forEach((a) => vistos.add(a.chave));
      gravarVistos(chaveVistos, vistos);
      if (!novos.length) return;
      setAvisos((atuais) => [...atuais, ...novos.filter((n) => !atuais.some((a) => a.chave === n.chave))].sort((a, b) => a.dias - b.dias));
      notificarSistema(novos);
    } catch { /* sem rede: tenta de novo no próximo ciclo */ }
  }, [cnpj, chaveVistos]);

  useEffect(() => {
    verificar();
    const t = setInterval(verificar, INTERVALO_MS);
    const aoVoltar = () => { if (document.visibilityState === 'visible') verificar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [verificar]);

  return (
    <CartaoAvisosPV
      avisos={avisos}
      onFechar={() => setAvisos([])}
      onVerLista={() => { setAvisos([]); setView('lista-pv'); }}
    />
  );
}
