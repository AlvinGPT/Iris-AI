import { HourlyTelemetryRecord } from '../types';

const HOURLY_SNAPSHOTS_KEY = 'iris_hourly_telemetry_snapshots_v1';

export class HourlyTelemetryService {
  /**
   * Aggregate blink counts, average distance, and blink rates into hourly batches
   */
  public static recordSnapshot(blinkRate: number, distanceCm: number, totalBlinks: number): void {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const hourKey = `${year}-${month}-${day}-${hour}`;
      const hourNum = now.getHours();
      const hourLabel =
        hourNum === 0
          ? '12am - 1am'
          : hourNum === 12
          ? '12pm - 1pm'
          : hourNum > 12
          ? `${hourNum - 12}pm - ${hourNum - 11}pm`
          : `${hourNum}am - ${hourNum + 1}am`;

      const snapshots = this.getHourlySnapshots();
      const existingIdx = snapshots.findIndex((s) => s.hourKey === hourKey);

      if (existingIdx >= 0) {
        const cur = snapshots[existingIdx];
        const newMinutes = cur.monitoredMinutes + 1;
        const newAvgBlinkRate = Math.round((cur.avgBlinkRate * cur.monitoredMinutes + blinkRate) / newMinutes);
        const newAvgDistance = Math.round((cur.avgDistanceCm * cur.monitoredMinutes + distanceCm) / newMinutes);
        snapshots[existingIdx] = {
          ...cur,
          avgBlinkRate: newAvgBlinkRate,
          avgDistanceCm: newAvgDistance,
          totalBlinks: Math.max(cur.totalBlinks, totalBlinks),
          monitoredMinutes: newMinutes,
        };
      } else {
        snapshots.push({
          hourKey,
          timestamp: Date.now(),
          hourLabel,
          avgBlinkRate: Math.round(blinkRate),
          avgDistanceCm: Math.round(distanceCm),
          totalBlinks,
          monitoredMinutes: 1,
        });
      }

      // Retain last 168 hours (7 days)
      const trimmed = snapshots.slice(-168);
      localStorage.setItem(HOURLY_SNAPSHOTS_KEY, JSON.stringify(trimmed));
    } catch {
      // safe fallback
    }
  }

  /**
   * Retrieve stored hourly snapshots
   */
  public static getHourlySnapshots(): HourlyTelemetryRecord[] {
    try {
      const raw = localStorage.getItem(HOURLY_SNAPSHOTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return [];
  }

  /**
   * Clear hourly snapshots
   */
  public static clearSnapshots(): void {
    try {
      localStorage.removeItem(HOURLY_SNAPSHOTS_KEY);
    } catch {
      // ignore
    }
  }
}
