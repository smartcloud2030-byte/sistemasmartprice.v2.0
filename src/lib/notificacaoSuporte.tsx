import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { useStore } from '../store';

interface MensagemSuporte {
  id: string;
  sender_name?: string;
  sender_type: 'user' | 'admin';
  text?: string;
  attachment_url?: string;
}

let ctxAudio: AudioContext | null = null;
let notificacoesLigadas = false;

const temNotificacaoSistema = () => typeof window !== 'undefined' && 'Notification' in window;

/** Pede permissão pro navegador mostrar notificações do sistema (idempotente). */
export function pedirPermissaoNotificacoes() {
  try {
    if (!temNotificacaoSistema() || Notification.permission !== 'default') return;
    Notification.requestPermission().catch(() => {});
  } catch {
    /* alguns navegadores ainda usam callback — ignora */
  }
}

/**
 * Notificação nativa do computador (aparece na central de notificações do SO,
 * mesmo com a aba em segundo plano). Clicar foca a janela e abre a conversa.
 */
function mostrarNotificacaoSistema(opts: {
  titulo: string;
  corpo: string;
  cnpj: string;
  ehAdmin: boolean;
}) {
  try {
    if (!temNotificacaoSistema() || Notification.permission !== 'granted') return;
    const n = new Notification(opts.titulo, {
      body: opts.corpo,
      tag: `suporte-${opts.cnpj || 'geral'}`,
      icon: '/favicon-32x32.png',
      // re-alerta quando chega outra mensagem da mesma conversa (mesma tag)
      renotify: true,
    } as NotificationOptions & { renotify?: boolean });
    n.onclick = () => {
      try {
        window.focus();
        const st = useStore.getState();
        if (opts.ehAdmin) st.setSelectedUserCnpj(opts.cnpj);
        st.setSupportChatOpen(true);
      } catch {
        /* ignora */
      }
      n.close();
    };
  } catch {
    /* ignora */
  }
}

/** "Ding" curto de duas notas via Web Audio — sem depender de arquivo de áudio. */
export function tocarSomSuporte() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctxAudio) ctxAudio = new AC();
    if (ctxAudio.state === 'suspended') ctxAudio.resume().catch(() => {});
    const t0 = ctxAudio.currentTime;
    ([[880, 0], [1318.5, 0.11]] as [number, number][]).forEach(([freq, atraso]) => {
      const osc = ctxAudio!.createOscillator();
      const gain = ctxAudio!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + atraso);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + atraso + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + 0.2);
      osc.connect(gain).connect(ctxAudio!.destination);
      osc.start(t0 + atraso);
      osc.stop(t0 + atraso + 0.22);
    });
  } catch {
    /* silêncio: som é opcional */
  }
}

/**
 * Liga (uma vez só) o pop-up + som quando chega mensagem de suporte do
 * OUTRO lado — vale pros dois sentidos: usuário → admin e admin → usuário.
 * Clicar no pop-up abre a conversa direto. Não incomoda se a pessoa já está
 * com o chat aberto naquela conversa e a aba visível.
 */
export function ligarNotificacoesSuporte(s: Socket) {
  if (notificacoesLigadas) return;
  notificacoesLigadas = true;

  const jaAvisados = new Set<string>();

  s.on('message:receive', (payload: { cnpj: string; message: MensagemSuporte }) => {
    const msg = payload?.message;
    if (!msg?.id || jaAvisados.has(msg.id)) return;

    const st = useStore.getState();
    if (!st.userRole) return;

    const daOutraParte =
      st.userRole === 'admin' ? msg.sender_type === 'user' : msg.sender_type === 'admin';
    if (!daOutraParte) return;

    const cnpjMsg = (payload.cnpj || '').replace(/\D/g, '');
    const vendoEssaConversa =
      st.userRole === 'admin' ? (st.selectedUserCnpj || '').replace(/\D/g, '') === cnpjMsg : true;
    const abaVisivel = typeof document === 'undefined' || document.visibilityState === 'visible';
    // Já está de olho exatamente nessa conversa, com a aba na frente → não incomoda.
    if (st.isSupportChatOpen && vendoEssaConversa && abaVisivel) return;

    jaAvisados.add(msg.id);
    if (jaAvisados.size > 300) jaAvisados.clear();

    const ehAdmin = st.userRole === 'admin';
    const titulo = ehAdmin ? 'Nova mensagem no suporte' : 'Resposta do suporte';
    const remetente = msg.sender_name || (ehAdmin ? 'Usuário' : 'Suporte');
    const txt = (msg.text || '').trim();
    const previa = txt
      ? txt.length > 140
        ? `${txt.slice(0, 140)}…`
        : txt
      : msg.attachment_url
        ? '📎 Imagem'
        : 'Nova mensagem';

    tocarSomSuporte();
    mostrarNotificacaoSistema({ titulo, corpo: `${remetente}: ${previa}`, cnpj: cnpjMsg, ehAdmin });

    toast.custom(
      (id) => (
        <button
          type="button"
          onClick={() => {
            const s2 = useStore.getState();
            if (s2.userRole === 'admin') s2.setSelectedUserCnpj(cnpjMsg);
            s2.setSupportChatOpen(true);
            toast.dismiss(id);
          }}
          className="w-[340px] max-w-[88vw] text-left flex gap-3 items-start rounded-xl border border-emerald-500/50 bg-zinc-900 px-4 py-3 shadow-2xl hover:border-emerald-400 transition-colors"
        >
          <MessageCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-emerald-300">
              {titulo}
            </span>
            <span className="block text-[13px] font-bold text-zinc-100 truncate">{remetente}</span>
            <span className="block text-xs text-zinc-400 whitespace-pre-wrap break-words line-clamp-3">
              {previa}
            </span>
            <span className="block text-[10px] text-zinc-600 mt-1">clique pra abrir a conversa</span>
          </span>
        </button>
      ),
      { duration: 9000 },
    );
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    notificacoesLigadas = false;
    ctxAudio?.close().catch(() => {});
    ctxAudio = null;
  });
}
