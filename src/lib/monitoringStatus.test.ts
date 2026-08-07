import assert from 'node:assert';
import { isMachineOffline, evaluateAlertState, alertStateLabel } from './monitoringStatus';

const NOW = new Date('2026-08-07T12:00:00Z');
const thresholds = { diskPercent: 90, memPercent: 90, offlineMinutes: 5 };

function offlineDetectaAusenciaDeReporte() {
  assert.strictEqual(isMachineOffline(null, 5, NOW), true);
  assert.strictEqual(isMachineOffline('2026-08-07T11:59:00Z', 5, NOW), false); // 1 min atrás
  assert.strictEqual(isMachineOffline('2026-08-07T11:50:00Z', 5, NOW), true); // 10 min atrás
}

function offlineTemPrioridadeSobreLimiteDeDiscoEMemoria() {
  const machine = { lastDiskPercent: 99, lastMemPercent: 99, lastSeenAt: '2026-08-07T11:50:00Z' };
  assert.strictEqual(evaluateAlertState(machine, thresholds, NOW), 'offline');
}

function discoAcimaDoLimiteDisparaAlertaDeDisco() {
  const machine = { lastDiskPercent: 95, lastMemPercent: 10, lastSeenAt: '2026-08-07T11:59:30Z' };
  assert.strictEqual(evaluateAlertState(machine, thresholds, NOW), 'disk_alert');
}

function memoriaAcimaDoLimiteDisparaAlertaDeMemoriaQuandoDiscoOk() {
  const machine = { lastDiskPercent: 10, lastMemPercent: 95, lastSeenAt: '2026-08-07T11:59:30Z' };
  assert.strictEqual(evaluateAlertState(machine, thresholds, NOW), 'mem_alert');
}

function tudoDentroDoLimiteEOk() {
  const machine = { lastDiskPercent: 10, lastMemPercent: 10, lastSeenAt: '2026-08-07T11:59:30Z' };
  assert.strictEqual(evaluateAlertState(machine, thresholds, NOW), 'ok');
}

function labelsEmPortugues() {
  assert.strictEqual(alertStateLabel('ok'), 'Normal');
  assert.strictEqual(alertStateLabel('offline'), 'Offline');
  assert.strictEqual(alertStateLabel('disk_alert'), 'Disco crítico');
  assert.strictEqual(alertStateLabel('mem_alert'), 'Memória crítica');
}

try {
  offlineDetectaAusenciaDeReporte();
  offlineTemPrioridadeSobreLimiteDeDiscoEMemoria();
  discoAcimaDoLimiteDisparaAlertaDeDisco();
  memoriaAcimaDoLimiteDisparaAlertaDeMemoriaQuandoDiscoOk();
  tudoDentroDoLimiteEOk();
  labelsEmPortugues();
  console.log('PASS: todos os testes de monitoringStatus passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
