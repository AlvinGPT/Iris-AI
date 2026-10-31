import { StoredAggregateTelemetry, EyeBreakLog, DailyTelemetryRecord, LiveTelemetryPoint, HourlyTelemetryRecord } from '../types';

const STORAGE_KEY = 'iris_telemetry_history_v1';
const LIVE_SAMPLES_KEY = 'iris_live_samples_v2';
const DAILY_KEY = 'iris_weekly_telemetry_v2';
const LOGS_KEY = 'iris_verified_session_logs_v3';
const HOURLY_KEY = 'iris_hourly_telemetry_records_v1';
const MAX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days retention policy

export class TelemetryStorageService {
  /**
   * Save an aggregate 1-minute bucket to local storage and sync to SQLite database
   */
  public static saveBucket(record: StoredAggregateTelemetry): void {
    try {
      const records = this.getRecords();
      records.unshift(record);

      const cutoff = Date.now() - MAX_RETENTION_MS;
      const pruned = records.filter((r) => r.timestamp >= cutoff).slice(0, 500);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      // Safe fallback if localStorage quota exceeded
    }

    // Asynchronously sync bucket to SQLite local database
    this.syncMinuteToDatabase(record).catch(() => {});
  }

  /**
   * Retrieve all saved telemetry records (enforcing 30-day retention policy)
   */
  public static getRecords(): StoredAggregateTelemetry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data) as StoredAggregateTelemetry[];
      if (Array.isArray(parsed)) {
        const cutoff = Date.now() - MAX_RETENTION_MS;
        return parsed.filter((r) => !r.timestamp || r.timestamp >= cutoff);
      }
    } catch {
      // Fallback
    }
    return [];
  }

  /**
   * Clear all telemetry history
   */
  public static clearHistory(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Save a real-time collected telemetry point (sampled while camera runs)
   */
  public static saveLiveSample(sample: LiveTelemetryPoint): void {
    try {
      const samples = this.getLiveSamples();
      samples.push(sample);
      const cutoff = Date.now() - MAX_RETENTION_MS;
      // Keep up to 60 most recent real-time data points within 30-day retention window
      const trimmed = samples.filter((s) => !s.timestamp || s.timestamp >= cutoff).slice(-60);
      localStorage.setItem(LIVE_SAMPLES_KEY, JSON.stringify(trimmed));
    } catch {
      // quota fallback
    }
  }

  /**
   * Get all live collected telemetry samples (enforcing 30-day retention policy)
   */
  public static getLiveSamples(): LiveTelemetryPoint[] {
    try {
      const raw = localStorage.getItem(LIVE_SAMPLES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cutoff = Date.now() - MAX_RETENTION_MS;
          return parsed.filter((s: LiveTelemetryPoint) => !s.timestamp || s.timestamp >= cutoff);
        }
      }
    } catch {
      // fallback
    }
    return [];
  }

  /**
   * Clear live collected telemetry samples
   */
  public static clearLiveSamples(): void {
    try {
      localStorage.removeItem(LIVE_SAMPLES_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Generate summary statistics from local history and real samples
   */
  public static getSummary(): {
    totalMonitoredMinutes: number;
    totalBlinks: number;
    averageBlinkRate: number;
    averageDistanceCm: number;
    totalAlerts: number;
  } {
    const records = this.getRecords();
    const liveSamples = this.getLiveSamples();

    if (records.length === 0 && liveSamples.length === 0) {
      return {
        totalMonitoredMinutes: 0,
        totalBlinks: 0,
        averageBlinkRate: 15,
        averageDistanceCm: 45,
        totalAlerts: 0,
      };
    }

    if (liveSamples.length > 0) {
      const totalBlinks = liveSamples.reduce((acc, s) => acc + (s.blinkRate || 0), 0);
      const avgRate = Math.round(totalBlinks / liveSamples.length);
      const avgDist = Math.round(liveSamples.reduce((acc, s) => acc + (s.distanceCm || 0), 0) / liveSamples.length);
      return {
        totalMonitoredMinutes: Math.max(1, Math.round(liveSamples.length / 10)),
        totalBlinks,
        averageBlinkRate: avgRate,
        averageDistanceCm: avgDist,
        totalAlerts: liveSamples.filter((s) => s.distanceCm < 38 || s.blinkRate < 10).length,
      };
    }

    const totalMinutes = records.length;
    const totalBlinks = records.reduce((acc, r) => acc + (r.blinksDetected || 0), 0);
    const sumRates = records.reduce((acc, r) => acc + (r.avgBlinkRate || 0), 0);
    const sumDist = records.reduce((acc, r) => acc + (r.avgDistanceCm || 0), 0);
    const totalAlerts = records.reduce((acc, r) => acc + (r.proximityAlertsCount || 0), 0);

    return {
      totalMonitoredMinutes: totalMinutes,
      totalBlinks,
      averageBlinkRate: Math.round(sumRates / totalMinutes),
      averageDistanceCm: Math.round(sumDist / totalMinutes),
      totalAlerts,
    };
  }

  /**
   * Get recorded telemetry records strictly from actual database/storage records
   */
  public static getWeeklyRecords(currentTelemetry?: {
    avgBlinkRate: number | null;
    avgScreenDistance: number | null;
    fatigueScore: number | null;
    screenTimeHours: number;
    dayProgress: number;
  }): DailyTelemetryRecord[] {
    let stored: DailyTelemetryRecord[] = [];
    try {
      const raw = localStorage.getItem(DAILY_KEY);
      if (raw) {
        stored = JSON.parse(raw);
        if (Array.isArray(stored)) {
          // Prune records older than 30 days
          const cutoff = Date.now() - MAX_RETENTION_MS;
          stored = stored.filter((r) => r.timestamp >= cutoff);
        } else {
          stored = [];
        }
      }
    } catch {
      stored = [];
    }

    const liveSamples = this.getLiveSamples();
    const logs = this.getSessionLogs();
    const todayDate = new Date();
    const todayStr = todayDate.toISOString().split('T')[0];
    const todayFormatted = todayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Only create a record for today if there is actual telemetry activity or logged breaks
    const hasActivityToday =
      liveSamples.length > 0 ||
      logs.some((l) => l.time) ||
      (currentTelemetry && (currentTelemetry.avgBlinkRate !== null || currentTelemetry.avgScreenDistance !== null || currentTelemetry.screenTimeHours > 0));

    if (hasActivityToday) {
      let calculatedBlink = currentTelemetry?.avgBlinkRate ?? 0;
      let calculatedDistance = currentTelemetry?.avgScreenDistance ?? 0;
      let calculatedFatigue = currentTelemetry?.fatigueScore ?? 1.0;

      if (liveSamples.length > 0) {
        calculatedBlink = Math.round(liveSamples.reduce((a, b) => a + b.blinkRate, 0) / liveSamples.length);
        calculatedDistance = Math.round(liveSamples.reduce((a, b) => a + b.distanceCm, 0) / liveSamples.length);
        calculatedFatigue = Number((liveSamples.reduce((a, b) => a + b.fatigueScore, 0) / liveSamples.length).toFixed(1));
      }

      const todayRecord: DailyTelemetryRecord = {
        day: 'Today',
        date: todayStr,
        formattedDate: todayFormatted,
        timestamp: Date.now(),
        fatigue: calculatedFatigue,
        blinkRate: calculatedBlink,
        distanceCm: calculatedDistance,
        screenHours: currentTelemetry ? Number(currentTelemetry.screenTimeHours.toFixed(1)) : 0,
        compliance: currentTelemetry ? Math.round(currentTelemetry.dayProgress) : 0,
        note: liveSamples.length > 0 ? `Verified Live Data (${liveSamples.length} pts)` : 'Active Monitored Session',
      };

      const baseWithoutToday = stored.filter((r) => r.day !== 'Today' && r.date !== todayStr);
      const combined = [...baseWithoutToday.slice(-6), todayRecord];

      try {
        localStorage.setItem(DAILY_KEY, JSON.stringify(combined));
      } catch {
        // quota safeguard
      }

      return combined;
    }

    return stored;
  }

  /**
   * Record a live telemetry sample into the active day bucket
   */
  public static recordLiveTelemetryPoint(blinkRate: number, distanceCm: number, fatigueScore: number): void {
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.saveLiveSample({
        id: `pt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: Date.now(),
        timeStr,
        blinkRate: Math.round(blinkRate),
        distanceCm: Math.round(distanceCm),
        fatigueScore: Number(fatigueScore.toFixed(1)),
      });

      const raw = localStorage.getItem(DAILY_KEY);
      if (raw) {
        const records = JSON.parse(raw);
        if (Array.isArray(records) && records.length > 0) {
          const lastIdx = records.length - 1;
          records[lastIdx] = {
            ...records[lastIdx],
            blinkRate: Math.round(blinkRate),
            distanceCm: Math.round(distanceCm),
            fatigue: Number(fatigueScore.toFixed(1)),
          };
          localStorage.setItem(DAILY_KEY, JSON.stringify(records));
        }
      }

      // Record hourly log (hourly blink rate, average blink distance, total blinks)
      this.recordHourlySample(blinkRate, distanceCm, 0);
    } catch {
      // quota safeguard
    }
  }

  /**
   * Record or update hourly telemetry metrics
   */
  public static recordHourlySample(blinkRate: number, distanceCm: number, totalBlinksDetected: number): void {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const hourKey = `${year}-${month}-${day}-${hour}`;
      const hourNum = now.getHours();
      const hourLabel = hourNum === 0 ? '12am - 1am' : hourNum === 12 ? '12pm - 1pm' : hourNum > 12 ? `${hourNum - 12}pm - ${hourNum - 11}pm` : `${hourNum}am - ${hourNum + 1}am`;

      const records = this.getHourlyRecords();
      const existingIdx = records.findIndex((r) => r.hourKey === hourKey);

      if (existingIdx >= 0) {
        const cur = records[existingIdx];
        const newMonitoredMinutes = cur.monitoredMinutes + 1;
        const newAvgBlinkRate = Math.round((cur.avgBlinkRate * cur.monitoredMinutes + blinkRate) / newMonitoredMinutes);
        const newAvgDistance = Math.round((cur.avgDistanceCm * cur.monitoredMinutes + distanceCm) / newMonitoredMinutes);
        records[existingIdx] = {
          ...cur,
          avgBlinkRate: newAvgBlinkRate,
          avgDistanceCm: newAvgDistance,
          totalBlinks: Math.max(cur.totalBlinks, totalBlinksDetected),
          monitoredMinutes: newMonitoredMinutes,
        };
      } else {
        records.push({
          hourKey,
          timestamp: Date.now(),
          hourLabel,
          avgBlinkRate: Math.round(blinkRate),
          avgDistanceCm: Math.round(distanceCm),
          totalBlinks: totalBlinksDetected,
          monitoredMinutes: 1,
        });
      }

      const cutoff = Date.now() - MAX_RETENTION_MS;
      const trimmed = records.filter((r) => !r.timestamp || r.timestamp >= cutoff).slice(-168);
      localStorage.setItem(HOURLY_KEY, JSON.stringify(trimmed));
    } catch {
      // safeguard
    }
  }

  /**
   * Get all recorded hourly telemetry records (enforcing 30-day retention policy)
   */
  public static getHourlyRecords(): HourlyTelemetryRecord[] {
    try {
      const raw = localStorage.getItem(HOURLY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cutoff = Date.now() - MAX_RETENTION_MS;
          return parsed.filter((r: HourlyTelemetryRecord) => !r.timestamp || r.timestamp >= cutoff);
        }
      }
    } catch {
      // fallback
    }
    return [];
  }

  /**
   * Retrieve all verified session logs (enforcing 30-day retention policy)
   */
  public static getSessionLogs(): EyeBreakLog[] {
    try {
      const raw = localStorage.getItem(LOGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cutoff = Date.now() - MAX_RETENTION_MS;
          return parsed.filter((l: EyeBreakLog) => {
            const match = l.id ? l.id.match(/\d{10,}/) : null;
            if (match) {
              const ts = Number(match[0]);
              if (!isNaN(ts) && ts > 1600000000000) {
                return ts >= cutoff;
              }
            }
            return true;
          });
        }
      }
    } catch {
      // fallback
    }
    return [];
  }

  public static saveSessionLogs(logs: EyeBreakLog[]): void {
    try {
      localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 100)));
    } catch {
      // ignore
    }
  }

  public static addSessionLog(log: EyeBreakLog): EyeBreakLog[] {
    const current = this.getSessionLogs();
    const updated = [log, ...current].slice(0, 100);
    this.saveSessionLogs(updated);

    // Asynchronously sync break log to SQLite local database
    this.syncBreakLogToDatabase(log).catch(() => {});
    return updated;
  }

  /**
   * Sync a single 1-minute bucket to the local SQLite database
   */
  public static async syncMinuteToDatabase(record: StoredAggregateTelemetry): Promise<void> {
    try {
      await fetch('/api/telemetry/minute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch {
      // Offline fallback
    }
  }

  /**
   * Sync a single break log to the local SQLite database
   */
  public static async syncBreakLogToDatabase(log: EyeBreakLog): Promise<void> {
    try {
      await fetch('/api/telemetry/break-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log),
      });
    } catch {
      // Offline fallback
    }
  }

  /**
   * Sync local storage telemetry records to SQLite database in bulk
   */
  public static async syncLocalToDatabase(): Promise<void> {
    try {
      const records = this.getRecords();
      if (records.length > 0) {
        await fetch('/api/telemetry/minute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(records),
        });
      }
      const logs = this.getSessionLogs();
      for (const log of logs.slice(0, 50)) {
        await this.syncBreakLogToDatabase(log);
      }
    } catch {
      // Offline fallback
    }
  }

  /**
   * Fetch deterministic analytical ground-truth snapshot from local SQLite database
   */
  public static async fetchDeterministicSnapshot(): Promise<any | null> {
    try {
      const res = await fetch('/api/telemetry/deterministic-snapshot');
      if (!res.ok) return null;
      const data = await res.json();
      return data.snapshot || null;
    } catch {
      return null;
    }
  }

  public static clearSessionLogs(): void {
    try {
      localStorage.removeItem(LOGS_KEY);
      localStorage.removeItem(LIVE_SAMPLES_KEY);
      localStorage.removeItem(DAILY_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Calculate realistic hourly distribution from ACTUAL session logs and collected telemetry points
   */
  public static getHourlyGazeDistribution(logs: EyeBreakLog[] = []): {
    hour: string;
    val: number;
    target: boolean;
    hasData: boolean;
    eventCount: number;
  }[] {
    const liveSamples = this.getLiveSamples();
    const currentHour = new Date().getHours();

    // Standard hours around typical workday (9am to 6pm)
    const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

    return hours.map((h) => {
      const hourLabel = h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`;
      
      // Filter live samples that occurred in this specific hour
      const samplesInHour = liveSamples.filter((s) => {
        const d = new Date(s.timestamp);
        return d.getHours() === h;
      });

      // Filter logs in this specific hour
      const logsInHour = logs.filter((l) => {
        // e.g. "14:20" or "02:20 PM"
        try {
          if (l.id && l.id.startsWith('break-') || l.id.startsWith('session-') || l.id.startsWith('monitor-')) {
            const tsMatch = l.id.match(/\d{10,}/);
            if (tsMatch) {
              const d = new Date(Number(tsMatch[0]));
              return d.getHours() === h;
            }
          }
        } catch {
          // ignore
        }
        return false;
      });

      const totalEvents = samplesInHour.length + logsInHour.length;

      if (samplesInHour.length > 0) {
        const avgBlink = Math.round(samplesInHour.reduce((a, b) => a + b.blinkRate, 0) / samplesInHour.length);
        return {
          hour: hourLabel,
          val: avgBlink,
          target: avgBlink >= 14,
          hasData: true,
          eventCount: totalEvents,
        };
      }

      if (logsInHour.length > 0) {
        const blinks = logsInHour
          .map((l) => l.telemetrySnapshot?.blinkRate)
          .filter((b): b is number => typeof b === 'number');
        if (blinks.length > 0) {
          const avgBlink = Math.round(blinks.reduce((a, b) => a + b, 0) / blinks.length);
          return {
            hour: hourLabel,
            val: avgBlink,
            target: avgBlink >= 14,
            hasData: true,
            eventCount: logsInHour.length,
          };
        }
      }

      // If this is the current active hour and camera has been active
      if (h === currentHour && liveSamples.length > 0) {
        const recent = liveSamples.slice(-15);
        const avgBlink = Math.round(recent.reduce((a, b) => a + b.blinkRate, 0) / recent.length);
        return {
          hour: hourLabel,
          val: avgBlink,
          target: avgBlink >= 14,
          hasData: true,
          eventCount: recent.length,
        };
      }

      // Honest representation: No data for this hour yet!
      return {
        hour: hourLabel,
        val: 0,
        target: false,
        hasData: false,
        eventCount: 0,
      };
    });
  }
}
