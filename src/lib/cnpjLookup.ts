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

export async function fetchCnpjDataEstruturado(cnpj: string): Promise<CnpjDataEstruturado | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!res.ok) return null;

  const raw = await res.json();
  return parseCnpjResponseEstruturado(raw);
}
