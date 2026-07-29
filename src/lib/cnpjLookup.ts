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
