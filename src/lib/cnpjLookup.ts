export interface CnpjData {
  nome: string;
  endereco: string;
  telefone: string;
}

function formatTelefone(raw: string | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return '';
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

export function parseCnpjResponse(raw: any): CnpjData {
  const nome = (raw?.nome_fantasia || '').trim() || (raw?.razao_social || '').trim();

  const ruaComNumero = [
    [raw?.descricao_tipo_de_logradouro, raw?.logradouro].filter(Boolean).join(' ').trim(),
    raw?.numero,
  ].filter(Boolean).join(', ');
  const endereco = [ruaComNumero, raw?.bairro, [raw?.municipio, raw?.uf].filter(Boolean).join(' - ')]
    .filter(Boolean)
    .join(' - ');

  const telefone = formatTelefone(raw?.ddd_telefone_1);

  return { nome, endereco, telefone };
}

export async function fetchCnpjData(cnpj: string): Promise<CnpjData | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!res.ok) return null;

  const raw = await res.json();
  return parseCnpjResponse(raw);
}

export interface EnderecoEstruturado {
  xLgr: string;
  nro: string;
  xCpl: string;
  xBairro: string;
  cMun: string;
  cep: string;
  uf: string;
}

export interface CnpjDataEstruturado {
  nome: string;
  email: string;
  telefone: string;
  endereco: EnderecoEstruturado;
}

export function parseCnpjResponseEstruturado(raw: any): CnpjDataEstruturado {
  const nome = (raw?.nome_fantasia || '').trim() || (raw?.razao_social || '').trim();
  const xLgr = [raw?.descricao_tipo_de_logradouro, raw?.logradouro].filter(Boolean).join(' ').trim();

  return {
    nome,
    email: (raw?.email || '').trim(),
    telefone: formatTelefone(raw?.ddd_telefone_1),
    endereco: {
      xLgr,
      nro: (raw?.numero || '').toString().trim(),
      xCpl: (raw?.complemento || '').trim(),
      xBairro: (raw?.bairro || '').trim(),
      cMun: raw?.codigo_municipio_ibge ? String(raw.codigo_municipio_ibge) : '',
      cep: (raw?.cep || '').toString().replace(/\D/g, ''),
      uf: (raw?.uf || '').trim(),
    },
  };
}

// Fallback: publica.cnpj.ws (formato diferente — converte pro mesmo shape).
function parseCnpjWs(raw: any): CnpjDataEstruturado {
  const e = raw?.estabelecimento || {};
  const nome = (e.nome_fantasia || '').trim() || (raw?.razao_social || '').trim();
  return {
    nome,
    email: (e.email || '').trim(),
    telefone: formatTelefone(e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : ''),
    endereco: {
      xLgr: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(' ').trim(),
      nro: (e.numero || '').toString().trim(),
      xCpl: (e.complemento || '').trim(),
      xBairro: (e.bairro || '').trim(),
      cMun: e.cidade?.ibge_id ? String(e.cidade.ibge_id) : '',
      cep: (e.cep || '').toString().replace(/\D/g, ''),
      uf: (e.estado?.sigla || '').trim(),
    },
  };
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// BrasilAPI falha de vez em quando (429 em sequência, 5xx, rede) — tenta de
// novo e, se não der, cai pra cnpj.ws. Lança erro com o motivo se tudo falhar.
export async function fetchCnpjDataEstruturado(cnpj: string): Promise<CnpjDataEstruturado | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

  const motivos: string[] = [];
  let naoExiste = false;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa) await pausa(2000 * tentativa);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (res.ok) {
        const dados = parseCnpjResponseEstruturado(await res.json());
        if (dados.nome) return dados;
      }
      motivos.push(`BrasilAPI ${res.status}`);
      if (res.status === 404 || res.status === 400) { naoExiste = true; break; }
    } catch (err: any) {
      motivos.push(`BrasilAPI ${err?.message || 'falhou'}`);
    }
  }

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (tentativa) await pausa(3000);
    try {
      const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`);
      if (res.ok) {
        const dados = parseCnpjWs(await res.json());
        if (dados.nome) return dados;
      }
      motivos.push(`cnpj.ws ${res.status}`);
      if (res.status === 404 || res.status === 400) { naoExiste = true; break; }
    } catch (err: any) {
      motivos.push(`cnpj.ws ${err?.message || 'falhou'}`);
    }
  }

  throw new Error(naoExiste
    ? 'CNPJ não encontrado na Receita — confira se os 14 dígitos estão certos.'
    : `Consulta do CNPJ fora do ar agora (${motivos.join(', ')}). Tente de novo em alguns minutos.`);
}
