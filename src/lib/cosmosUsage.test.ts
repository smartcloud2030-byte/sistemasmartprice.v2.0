import assert from 'node:assert';
import { getBrazilDateString, getUsageState, COSMOS_DAILY_LIMIT } from './cosmosUsage';

function dataConvertidaParaHorarioDeBrasilia() {
  // 02:30 UTC = 23:30 do dia anterior em Brasilia (UTC-3, sem horario de verao)
  assert.strictEqual(getBrazilDateString(new Date('2026-08-12T02:30:00Z')), '2026-08-11');
  // 12:00 UTC = 09:00 em Brasilia, mesmo dia
  assert.strictEqual(getBrazilDateString(new Date('2026-08-12T12:00:00Z')), '2026-08-12');
}

function estadoOkAteSetentaPorCentoDaCota() {
  assert.strictEqual(getUsageState(0, COSMOS_DAILY_LIMIT), 'ok');
  assert.strictEqual(getUsageState(17, COSMOS_DAILY_LIMIT), 'ok');
}

function estadoAlertaEntreSetentaENoventaENovePorCento() {
  assert.strictEqual(getUsageState(18, COSMOS_DAILY_LIMIT), 'warning');
  assert.strictEqual(getUsageState(24, COSMOS_DAILY_LIMIT), 'warning');
}

function estadoCriticoNoLimiteOuAcima() {
  assert.strictEqual(getUsageState(25, COSMOS_DAILY_LIMIT), 'critical');
  assert.strictEqual(getUsageState(30, COSMOS_DAILY_LIMIT), 'critical');
}

try {
  dataConvertidaParaHorarioDeBrasilia();
  estadoOkAteSetentaPorCentoDaCota();
  estadoAlertaEntreSetentaENoventaENovePorCento();
  estadoCriticoNoLimiteOuAcima();
  console.log('PASS: todos os testes de cosmosUsage passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
