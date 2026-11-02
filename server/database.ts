import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface StoredMinuteTelemetryInput {
  timestamp: number;
  timeLabel?: string;
  durationSeconds?: number;
  blinksDetected?: number;
  avgBlinkRate?: number;
  avgDistanceCm?: number;
  proximityAlertsCount?: number;
  trackingQualityPct?: number;
  fatigueScore?: number;
}

export interface StoredBreakLogInput {
  id?: string;
  timestamp: number;
  time?: string;
  type?: string;
  routineId?: string;
  routineTitle?: string;
  durationSeconds?: number;
  complianceScore?: number;
  status?: string;
  telemetrySnapshot?: Record<string, unknown> | null;
}

export interface StoredSessionSnapshotInput {
  id?: string;
  sessionId?: string;
  timestamp: number;
  totalObservedSeconds?: number;
  totalBlinks?: number;
  avgBlinkRate?: number;
  avgDistanceCm?: number;
  fatigueScore?: number;
  completedBreaks?: number;
  distanceWarnings?: number;
  rawPayload?: Record<string, unknown> | null;
}

export interface DeterministicSnapshot {
  reportingPeriod: string;
  calculatedAt: number;
  hasSufficientData: boolean;
  totalMonitoredMinutes24h: number;
  totalMonitoredHours24h: number;
  totalMonitoredHours7d: number;
  activeDaysCount7d: number;
  metrics: {
    blink_rate_bpm: {
      value: number | null;
      formatted: string;
      unit: string;
      isReliable: boolean;
    };
    total_validated_blinks: {
      value: number;
      formatted: string;
      unit: string;
      isReliable: boolean;
    };
    observed_duration: {
      value: number; // in seconds
      formatted: string;
      unit: string;
      isReliable: boolean;
    };
    avg_distance_cm: {
      value: number | null;
      formatted: string;
      unit: string;
      isReliable: boolean;
    };
    distance_warnings: {
      value: number;
      formatted: string;
      unit: string;
      isReliable: boolean;
    };
    fatigue_score: {
      value: number;
      formatted: string;
      unit: string;
      isReliable: boolean;
    };
    completed_breaks: {
      value: number;
      formatted: string;
      unit: string;
      isReliable: boolean;
    };
    seven_day_avg_blink_rate: {
      value: number | null;
      formatted: string;
      unit: string;
      isReliable: boolean;
    };
    seven_day_avg_distance_cm: {
      value: number | null;
      formatted: string;
      unit: string;
      isReliable: boolean;
    };
  };
  sqlGroundTruth: {
    samples24h: number;
    samples7d: number;
    earliestSampleTimestamp: number | null;
    latestSampleTimestamp: number | null;
  };
}

export class IrisDatabase {
  private db: Database.Database;
  private dbPath: string;
  private pruneIntervalTimer: NodeJS.Timeout | null = null;

  constructor(customPath?: string) {
    this.dbPath = customPath || IrisDatabase.resolveDefaultDbPath();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.initPragmas();
    this.initTables();
    this.pruneOldTelemetry(30);

    // Schedule pruning every 60 minutes
    this.pruneIntervalTimer = setInterval(() => {
      try {
        this.pruneOldTelemetry(30);
      } catch (err) {
        console.error('[IrisDatabase] Scheduled pruning failed:', err);
      }
    }, 60 * 60 * 1000);
  }

  public static resolveDefaultDbPath(): string {
    if (process.env.IRIS_DB_PATH && process.env.IRIS_DB_PATH.trim()) {
      return path.resolve(process.env.IRIS_DB_PATH.trim());
    }

    const appData =
      process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config'));

    const baseDir = path.join(appData, 'IrisAI');
    return path.join(baseDir, 'iris_telemetry.db');
  }

  private initPragmas(): void {
    // High-performance concurrency and data integrity WAL setup
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('cache_size = -64000'); // 64 MB cache
    this.db.pragma('temp_store = MEMORY');
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS minute_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        time_label TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 60,
        blinks_detected INTEGER NOT NULL DEFAULT 0,
        avg_blink_rate REAL NOT NULL DEFAULT 0,
        avg_distance_cm REAL NOT NULL DEFAULT 0,
        proximity_alerts_count INTEGER NOT NULL DEFAULT 0,
        tracking_quality_pct REAL NOT NULL DEFAULT 100,
        fatigue_score INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_minute_telemetry_timestamp ON minute_telemetry(timestamp);

      CREATE TABLE IF NOT EXISTS break_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        time_label TEXT NOT NULL,
        routine_id TEXT NOT NULL,
        routine_title TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        compliance_score REAL NOT NULL DEFAULT 100,
        status TEXT NOT NULL DEFAULT 'Completed',
        telemetry_snapshot TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_break_logs_timestamp ON break_logs(timestamp);

      CREATE TABLE IF NOT EXISTS session_snapshots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        total_observed_seconds INTEGER NOT NULL DEFAULT 0,
        total_blinks INTEGER NOT NULL DEFAULT 0,
        avg_blink_rate REAL NOT NULL DEFAULT 0,
        avg_distance_cm REAL NOT NULL DEFAULT 0,
        fatigue_score INTEGER NOT NULL DEFAULT 0,
        completed_breaks INTEGER NOT NULL DEFAULT 0,
        distance_warnings INTEGER NOT NULL DEFAULT 0,
        raw_payload TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_session_snapshots_timestamp ON session_snapshots(timestamp);
    `);
  }

  /**
   * Insert or update a 1-minute aggregate telemetry bucket
   */
  public saveMinuteTelemetry(record: StoredMinuteTelemetryInput): void {
    const stmt = this.db.prepare(`
      INSERT INTO minute_telemetry (
        timestamp,
        time_label,
        duration_seconds,
        blinks_detected,
        avg_blink_rate,
        avg_distance_cm,
        proximity_alerts_count,
        tracking_quality_pct,
        fatigue_score
      ) VALUES (
        @timestamp,
        @time_label,
        @duration_seconds,
        @blinks_detected,
        @avg_blink_rate,
        @avg_distance_cm,
        @proximity_alerts_count,
        @tracking_quality_pct,
        @fatigue_score
      )
    `);

    stmt.run({
      timestamp: record.timestamp,
      time_label: record.timeLabel || new Date(record.timestamp).toLocaleTimeString(),
      duration_seconds: record.durationSeconds ?? 60,
      blinks_detected: record.blinksDetected ?? 0,
      avg_blink_rate: Number((record.avgBlinkRate ?? 0).toFixed(1)),
      avg_distance_cm: Number((record.avgDistanceCm ?? 0).toFixed(1)),
      proximity_alerts_count: record.proximityAlertsCount ?? 0,
      tracking_quality_pct: Number((record.trackingQualityPct ?? 100).toFixed(1)),
      fatigue_score: Math.round(record.fatigueScore ?? 0),
    });
  }

  /**
   * Bulk insert multiple 1-minute buckets in a single SQLite transaction
   */
  public saveMinuteTelemetryBatch(records: StoredMinuteTelemetryInput[]): number {
    if (!records || records.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT INTO minute_telemetry (
        timestamp,
        time_label,
        duration_seconds,
        blinks_detected,
        avg_blink_rate,
        avg_distance_cm,
        proximity_alerts_count,
        tracking_quality_pct,
        fatigue_score
      ) VALUES (
        @timestamp,
        @time_label,
        @duration_seconds,
        @blinks_detected,
        @avg_blink_rate,
        @avg_distance_cm,
        @proximity_alerts_count,
        @tracking_quality_pct,
        @fatigue_score
      )
    `);

    const insertMany = this.db.transaction((items: StoredMinuteTelemetryInput[]) => {
      let count = 0;
      for (const item of items) {
        stmt.run({
          timestamp: item.timestamp,
          time_label: item.timeLabel || new Date(item.timestamp).toLocaleTimeString(),
          duration_seconds: item.durationSeconds ?? 60,
          blinks_detected: item.blinksDetected ?? 0,
          avg_blink_rate: Number((item.avgBlinkRate ?? 0).toFixed(1)),
          avg_distance_cm: Number((item.avgDistanceCm ?? 0).toFixed(1)),
          proximity_alerts_count: item.proximityAlertsCount ?? 0,
          tracking_quality_pct: Number((item.trackingQualityPct ?? 100).toFixed(1)),
          fatigue_score: Math.round(item.fatigueScore ?? 0),
        });
        count++;
      }
      return count;
    });

    return insertMany(records);
  }

  /**
   * Save a completed or updated break log
   */
  public saveBreakLog(log: StoredBreakLogInput): void {
    const timestamp = Number(log.timestamp) || Date.now();
    const id = log.id || `break_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
    const timeLabel = log.time || new Date(timestamp).toLocaleTimeString();
    const routineId = log.routineId || log.type || 'standard-break';
    const routineTitle = log.routineTitle || log.type || 'Eye Rest Routine';
    const snapshotStr = log.telemetrySnapshot ? JSON.stringify(log.telemetrySnapshot) : null;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO break_logs (
        id,
        timestamp,
        time_label,
        routine_id,
        routine_title,
        duration_seconds,
        compliance_score,
        status,
        telemetry_snapshot
      ) VALUES (
        @id,
        @timestamp,
        @time_label,
        @routine_id,
        @routine_title,
        @duration_seconds,
        @compliance_score,
        @status,
        @telemetry_snapshot
      )
    `);

    stmt.run({
      id,
      timestamp,
      time_label: timeLabel,
      routine_id: routineId,
      routine_title: routineTitle,
      duration_seconds: Math.round(log.durationSeconds ?? 60),
      compliance_score: Number((log.complianceScore ?? 100).toFixed(1)),
      status: log.status || 'Completed',
      telemetry_snapshot: snapshotStr,
    });
  }

  /**
   * Save a session snapshot record
   */
  public saveSessionSnapshot(snapshot: StoredSessionSnapshotInput): void {
    const id = snapshot.id || `snap_${snapshot.timestamp}_${Math.random().toString(36).substring(2, 7)}`;
    const sessionId = snapshot.sessionId || `session_${snapshot.timestamp}`;
    const rawPayloadStr = snapshot.rawPayload ? JSON.stringify(snapshot.rawPayload) : null;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO session_snapshots (
        id,
        session_id,
        timestamp,
        total_observed_seconds,
        total_blinks,
        avg_blink_rate,
        avg_distance_cm,
        fatigue_score,
        completed_breaks,
        distance_warnings,
        raw_payload
      ) VALUES (
        @id,
        @session_id,
        @timestamp,
        @total_observed_seconds,
        @total_blinks,
        @avg_blink_rate,
        @avg_distance_cm,
        @fatigue_score,
        @completed_breaks,
        @distance_warnings,
        @raw_payload
      )
    `);

    stmt.run({
      id,
      session_id: sessionId,
      timestamp: snapshot.timestamp,
      total_observed_seconds: Math.round(snapshot.totalObservedSeconds ?? 0),
      total_blinks: Math.round(snapshot.totalBlinks ?? 0),
      avg_blink_rate: Number((snapshot.avgBlinkRate ?? 0).toFixed(1)),
      avg_distance_cm: Number((snapshot.avgDistanceCm ?? 0).toFixed(1)),
      fatigue_score: Math.round(snapshot.fatigueScore ?? 0),
      completed_breaks: Math.round(snapshot.completedBreaks ?? 0),
      distance_warnings: Math.round(snapshot.distanceWarnings ?? 0),
      raw_payload: rawPayloadStr,
    });
  }

  /**
   * Compute deterministic analytical queries for RETIS and OCURE prompts.
   * Pulls exact SQL aggregates across 24 hours and 7 days.
   */
  public getDeterministicSnapshot(): DeterministicSnapshot {
    const now = Date.now();
    const cutoff24h = now - 24 * 60 * 60 * 1000;
    const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;

    // 24-Hour SQL aggregate
    const row24h = this.db
      .prepare(`
        SELECT
          COUNT(*) AS minute_count,
          COALESCE(SUM(duration_seconds), 0) AS total_observed_seconds,
          COALESCE(SUM(blinks_detected), 0) AS total_blinks,
          COALESCE(SUM(proximity_alerts_count), 0) AS total_proximity_alerts,
          AVG(CASE WHEN avg_blink_rate > 0 THEN avg_blink_rate ELSE NULL END) AS avg_blink_rate,
          AVG(CASE WHEN avg_distance_cm > 0 THEN avg_distance_cm ELSE NULL END) AS avg_distance_cm,
          AVG(fatigue_score) AS avg_fatigue_score,
          MIN(timestamp) AS earliest_timestamp,
          MAX(timestamp) AS latest_timestamp
        FROM minute_telemetry
        WHERE timestamp >= ?
      `)
      .get(cutoff24h) as any;

    // 7-Day SQL aggregate
    const row7d = this.db
      .prepare(`
        SELECT
          COUNT(*) AS minute_count_7d,
          AVG(CASE WHEN avg_blink_rate > 0 THEN avg_blink_rate ELSE NULL END) AS avg_blink_rate_7d,
          AVG(CASE WHEN avg_distance_cm > 0 THEN avg_distance_cm ELSE NULL END) AS avg_distance_cm_7d,
          COUNT(DISTINCT date(timestamp / 1000, 'unixepoch', 'localtime')) AS active_days_count
        FROM minute_telemetry
        WHERE timestamp >= ?
      `)
      .get(cutoff7d) as any;

    // Breaks completed in 24h
    const breaks24h = this.db
      .prepare(`
        SELECT COUNT(*) AS completed_count
        FROM break_logs
        WHERE timestamp >= ? AND status = 'Completed'
      `)
      .get(cutoff24h) as any;

    const minuteCount24h = Number(row24h?.minute_count || 0);
    const minuteCount7d = Number(row7d?.minute_count_7d || 0);
    const totalObservedSec = Number(row24h?.total_observed_seconds || minuteCount24h * 60);
    const totalBlinks = Number(row24h?.total_blinks || 0);
    const proximityWarnings = Number(row24h?.total_proximity_alerts || 0);
    const breaksCount = Number(breaks24h?.completed_count || 0);

    const avgBpm =
      row24h?.avg_blink_rate !== null && row24h?.avg_blink_rate !== undefined
        ? Number(Number(row24h.avg_blink_rate).toFixed(1))
        : null;

    const avgDistance =
      row24h?.avg_distance_cm !== null && row24h?.avg_distance_cm !== undefined
        ? Number(Number(row24h.avg_distance_cm).toFixed(1))
        : null;

    const avgFatigue =
      row24h?.avg_fatigue_score !== null && row24h?.avg_fatigue_score !== undefined
        ? Math.round(Number(row24h.avg_fatigue_score))
        : 0;

    const avgBpm7d =
      row7d?.avg_blink_rate_7d !== null && row7d?.avg_blink_rate_7d !== undefined
        ? Number(Number(row7d.avg_blink_rate_7d).toFixed(1))
        : null;

    const avgDistance7d =
      row7d?.avg_distance_cm_7d !== null && row7d?.avg_distance_cm_7d !== undefined
        ? Number(Number(row7d.avg_distance_cm_7d).toFixed(1))
        : null;

    const activeDays = Number(row7d?.active_days_count || (minuteCount24h > 0 ? 1 : 0));
    const hours24h = Number((minuteCount24h / 60).toFixed(1));
    const hours7d = Number((minuteCount7d / 60).toFixed(1));

    const formatDurationStr = (sec: number): string => {
      const mins = Math.floor(sec / 60);
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      if (hrs > 0) return `${hrs}h ${remMins}m`;
      return `${mins}m`;
    };

    return {
      reportingPeriod: '24-hour deterministic rolling window (30-day SQLite WAL store)',
      calculatedAt: now,
      hasSufficientData: minuteCount24h >= 2,
      totalMonitoredMinutes24h: minuteCount24h,
      totalMonitoredHours24h: hours24h,
      totalMonitoredHours7d: hours7d,
      activeDaysCount7d: activeDays,
      metrics: {
        blink_rate_bpm: {
          value: avgBpm,
          formatted: avgBpm !== null ? `${avgBpm} BPM` : 'Unavailable',
          unit: 'BPM',
          isReliable: minuteCount24h >= 2,
        },
        total_validated_blinks: {
          value: totalBlinks,
          formatted: totalBlinks.toLocaleString(),
          unit: 'blinks',
          isReliable: true,
        },
        observed_duration: {
          value: totalObservedSec,
          formatted: formatDurationStr(totalObservedSec),
          unit: 'seconds',
          isReliable: true,
        },
        avg_distance_cm: {
          value: avgDistance,
          formatted: avgDistance !== null ? `${avgDistance} cm` : 'Unavailable',
          unit: 'cm',
          isReliable: minuteCount24h >= 2,
        },
        distance_warnings: {
          value: proximityWarnings,
          formatted: proximityWarnings.toString(),
          unit: 'warnings',
          isReliable: true,
        },
        fatigue_score: {
          value: avgFatigue,
          formatted: `${avgFatigue}%`,
          unit: '%',
          isReliable: minuteCount24h > 0,
        },
        completed_breaks: {
          value: breaksCount,
          formatted: breaksCount.toString(),
          unit: 'breaks',
          isReliable: true,
        },
        seven_day_avg_blink_rate: {
          value: avgBpm7d,
          formatted: avgBpm7d !== null ? `${avgBpm7d} BPM` : 'Unavailable',
          unit: 'BPM',
          isReliable: minuteCount7d >= 5,
        },
        seven_day_avg_distance_cm: {
          value: avgDistance7d,
          formatted: avgDistance7d !== null ? `${avgDistance7d} cm` : 'Unavailable',
          unit: 'cm',
          isReliable: minuteCount7d >= 5,
        },
      },
      sqlGroundTruth: {
        samples24h: minuteCount24h,
        samples7d: minuteCount7d,
        earliestSampleTimestamp: row24h?.earliest_timestamp || null,
        latestSampleTimestamp: row24h?.latest_timestamp || null,
      },
    };
  }

  /**
   * Retrieve stored minute telemetry within the retention window
   */
  public getMinuteTelemetry(limit: number = 500, days: number = 30): StoredMinuteTelemetryInput[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = this.db
      .prepare(`
        SELECT
          timestamp,
          time_label AS timeLabel,
          duration_seconds AS durationSeconds,
          blinks_detected AS blinksDetected,
          avg_blink_rate AS avgBlinkRate,
          avg_distance_cm AS avgDistanceCm,
          proximity_alerts_count AS proximityAlertsCount,
          tracking_quality_pct AS trackingQualityPct,
          fatigue_score AS fatigueScore
        FROM minute_telemetry
        WHERE timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT ?
      `)
      .all(cutoff, limit) as StoredMinuteTelemetryInput[];

    return rows;
  }

  /**
   * Retrieve break logs
   */
  public getBreakLogs(limit: number = 50, days: number = 30): StoredBreakLogInput[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = this.db
      .prepare(`
        SELECT
          id,
          timestamp,
          time_label AS time,
          routine_id AS routineId,
          routine_title AS routineTitle,
          duration_seconds AS durationSeconds,
          compliance_score AS complianceScore,
          status,
          telemetry_snapshot AS telemetrySnapshotRaw
        FROM break_logs
        WHERE timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT ?
      `)
      .all(cutoff, limit) as any[];

    return rows.map((r) => {
      let snap = null;
      if (r.telemetrySnapshotRaw) {
        try {
          snap = JSON.parse(r.telemetrySnapshotRaw);
        } catch {
          // ignore
        }
      }
      return {
        id: r.id,
        timestamp: r.timestamp,
        time: r.time,
        routineId: r.routineId,
        routineTitle: r.routineTitle,
        durationSeconds: r.durationSeconds,
        complianceScore: r.complianceScore,
        status: r.status,
        telemetrySnapshot: snap,
      };
    });
  }

  /**
   * Prune records strictly older than the retention period (default 30 days)
   */
  public pruneOldTelemetry(days: number = 30): {
    prunedMinutes: number;
    prunedBreaks: number;
    prunedSnapshots: number;
    cutoffTimestamp: number;
  } {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const delMinutes = this.db
      .prepare(`DELETE FROM minute_telemetry WHERE timestamp < ?`)
      .run(cutoff);
    const delBreaks = this.db
      .prepare(`DELETE FROM break_logs WHERE timestamp < ?`)
      .run(cutoff);
    const delSnapshots = this.db
      .prepare(`DELETE FROM session_snapshots WHERE timestamp < ?`)
      .run(cutoff);

    return {
      prunedMinutes: delMinutes.changes,
      prunedBreaks: delBreaks.changes,
      prunedSnapshots: delSnapshots.changes,
      cutoffTimestamp: cutoff,
    };
  }

  /**
   * Safe shutdown and flush WAL
   */
  public close(): void {
    if (this.pruneIntervalTimer) {
      clearInterval(this.pruneIntervalTimer);
      this.pruneIntervalTimer = null;
    }
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      this.db.close();
    } catch (err) {
      console.error('[IrisDatabase] Error closing database:', err);
    }
  }

  public getDbPath(): string {
    return this.dbPath;
  }
}

// Default singleton instance
let defaultDbInstance: IrisDatabase | null = null;

export function getIrisDatabase(customPath?: string): IrisDatabase {
  if (!defaultDbInstance || (customPath && defaultDbInstance.getDbPath() !== customPath)) {
    if (defaultDbInstance) {
      defaultDbInstance.close();
    }
    defaultDbInstance = new IrisDatabase(customPath);
  }
  return defaultDbInstance;
}
