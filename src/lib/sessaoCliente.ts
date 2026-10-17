// Sessão do lado do navegador. O cookie (httpOnly) é do servidor — aqui só
// abrimos/fechamos a sessão e, se ela cair (cookie vencido, deploy novo), a
// loja reabre sozinha com o CNPJ+usuário que já está logado na tela, sem
// pedir login de novo. Admin precisa da senha, então volta pro Login.

type UsuarioAtual = { papel: 'admin' | 'loja'; cnpj: string; username: string } | null;

let obterUsuario: () => UsuarioAtual = () => null;
let aoPerderSessao: (motivo: string) => void = () => {};

export function configurarSessaoCliente(opcoes: {
  obterUsuario: () => UsuarioAtual;
  aoPerderSessao: (motivo: string) => void;
}) {
  obterUsuario = opcoes.obterUsuario;
  aoPerderSessao = opcoes.aoPerderSessao;
}

const fetchOriginal: typeof fetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;

export async function entrarComoLoja(
  cnpj: string,
  username: string,
): Promise<{ ok: true; bandeira: string } | { ok: false; erro: string; status: number }> {
  try {
    const res = await fetchOriginal('/api/sessao/loja', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj, username }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, erro: data?.error || 'Erro ao acessar o sistema. Tente novamente.', status: res.status };
    return { ok: true, bandeira: data?.bandeira || '' };
  } catch {
    return { ok: false, erro: 'Erro ao acessar o sistema. Tente novamente.', status: 0 };
  }
}

export async function buscarBandeiraDoCnpj(cnpj: string): Promise<string | null> {
  try {
    const res = await fetchOriginal(`/api/sessao/loja/bandeira?cnpj=${encodeURIComponent(cnpj)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.bandeira || null;
  } catch {
    return null;
  }
}

export async function sairDaSessao(): Promise<void> {
  try {
    await fetchOriginal('/api/sessao/sair', { method: 'POST' });
  } catch { /* sem rede: o cookie vence sozinho */ }
}

// Uma renovação por vez — vários pedidos dando 401 juntos esperam a mesma.
let renovando: Promise<boolean> | null = null;

export function renovarSessao(): Promise<boolean> {
  const usuario = obterUsuario();
  if (!usuario) return Promise.resolve(false);
  if (usuario.papel === 'admin') {
    aoPerderSessao('Sua sessão de administrador expirou. Entre de novo.');
    return Promise.resolve(false);
  }
  renovando ??= entrarComoLoja(usuario.cnpj, usuario.username)
    .then((r) => {
      if ('erro' in r && r.status === 403) aoPerderSessao(r.erro);
      return r.ok;
    })
    .finally(() => {
      setTimeout(() => { renovando = null; }, 0);
    });
  return renovando;
}

const ROTAS_SEM_RENOVAR = ['/api/sessao', '/api/admin/login'];

function caminhoDoPedido(input: RequestInfo | URL): string | null {
  try {
    const bruto = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(bruto, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

/** Pedido pra API que voltou 401 → renova a sessão e tenta de novo uma vez. */
export function instalarRenovacaoDeSessao() {
  if (typeof window === 'undefined' || (window as any).__sessaoInstalada) return;
  (window as any).__sessaoInstalada = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const caminho = caminhoDoPedido(input);
    const vigiado =
      !!caminho &&
      (caminho.startsWith('/api/') || caminho.startsWith('/gallery/')) &&
      !ROTAS_SEM_RENOVAR.some((r) => caminho.startsWith(r));
    // Request com corpo só pode ser lido uma vez — guarda uma cópia pra repetir.
    const copia = vigiado && input instanceof Request ? input.clone() : null;
    const res = await fetchOriginal(input, init);
    if (!vigiado || res.status !== 401 || !obterUsuario()) return res;
    const ok = await renovarSessao();
    if (!ok) return res;
    return fetchOriginal(copia ?? input, init);
  };
}
