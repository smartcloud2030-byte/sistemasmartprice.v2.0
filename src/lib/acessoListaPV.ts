// Quem pode abrir a Lista PV. Usado na tela e no servidor (api.ts), então
// sem dependência de React nem de xlsx.
//
// No cadastro da loja (users_and_flags.allowedStores):
//   listaPVAcesso: undefined/'nenhum' → só o admin
//                  'todos'            → qualquer usuário que entrar com esse CNPJ
//                  'usuarios'         → só os nomes de listaPVUsuarios
// Cada CNPJ tem a própria lista em settings.lista_pv_<cnpj>; a do admin
// continua em settings.lista_pv.

export type ModoAcessoListaPV = 'nenhum' | 'todos' | 'usuarios';

export interface AcessoListaPV {
  listaPVAcesso?: ModoAcessoListaPV;
  listaPVUsuarios?: string[];
}

/** "  Érika " → "erika": compara nome de usuário sem acento, caixa ou espaço sobrando. */
export const normalizarUsuarioPV = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export function podeAcessarListaPV(loja: AcessoListaPV | null | undefined, usuario: string | null | undefined): boolean {
  if (!loja) return false;
  if (loja.listaPVAcesso === 'todos') return true;
  if (loja.listaPVAcesso === 'usuarios') {
    const u = normalizarUsuarioPV(usuario);
    return !!u && (loja.listaPVUsuarios || []).some((n) => normalizarUsuarioPV(n) === u);
  }
  return false;
}

export const chaveListaPV = (cnpj?: string | null) => {
  const d = String(cnpj ?? '').replace(/\D/g, '');
  return d ? `lista_pv_${d}` : 'lista_pv';
};
