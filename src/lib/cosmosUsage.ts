export const COSMOS_DAILY_LIMIT = 25;

export type CosmosUsageState = 'ok' | 'warning' | 'critical';

// A cota da Cosmos zera à meia-noite de Brasília, não UTC — a chave do
// contador precisa ser calculada em America/Sao_Paulo, senão o reset
// acontece 3h adiantado ou atrasado dependendo de onde a VPS roda.
export function getBrazilDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function getUsageState(count: number, limit: number = COSMOS_DAILY_LIMIT): CosmosUsageState {
  if (count >= limit) return 'critical';
  if (count / limit > 0.7) return 'warning';
  return 'ok';
}
