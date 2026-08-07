// ─────────────────────────────────────────
// monitoringStatus.ts — Cálculo puro de status/alerta de máquinas monitoradas
// ─────────────────────────────────────────

export interface MonitoringThresholds {
  diskPercent: number;
  memPercent: number;
  offlineMinutes: number;
}

export type AlertState = 'ok' | 'disk_alert' | 'mem_alert' | 'offline';

export interface MachineSnapshot {
  lastDiskPercent: number | null;
  lastMemPercent: number | null;
  lastSeenAt: string | null;
}

export function isMachineOffline(lastSeenAt: string | null, offlineMinutes: number, now: Date = new Date()): boolean {
  if (!lastSeenAt) return true;
  const diffMs = now.getTime() - new Date(lastSeenAt).getTime();
  return diffMs > offlineMinutes * 60 * 1000;
}

export function evaluateAlertState(machine: MachineSnapshot, thresholds: MonitoringThresholds, now: Date = new Date()): AlertState {
  if (isMachineOffline(machine.lastSeenAt, thresholds.offlineMinutes, now)) return 'offline';
  if (machine.lastDiskPercent !== null && machine.lastDiskPercent >= thresholds.diskPercent) return 'disk_alert';
  if (machine.lastMemPercent !== null && machine.lastMemPercent >= thresholds.memPercent) return 'mem_alert';
  return 'ok';
}

export function alertStateLabel(state: AlertState): string {
  switch (state) {
    case 'offline': return 'Offline';
    case 'disk_alert': return 'Disco crítico';
    case 'mem_alert': return 'Memória crítica';
    default: return 'Normal';
  }
}
