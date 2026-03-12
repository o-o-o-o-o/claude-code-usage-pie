import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeUsage } from '../types';

interface JsonlRecord {
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  timestamp?: string;
  created_at?: string;
  type?: string;
}

interface TimestampedRecord {
  ts: number;
  tokens: number;
  isOpus: boolean;
}

export interface LocalUsageTotals {
  fiveHourTokens: number;
  sevenDayTokens: number;
  sevenDayOpusTokens: number;
}

export interface UsageLimits {
  fiveHourLimit: number;
  sevenDayLimit: number;
  sevenDayOpusLimit: number;
}

export interface UsageResetAnchors {
  sevenDayResetsAt?: string | null;
  sevenDayOpusResetsAt?: string | null;
}

export interface WeeklyResetConfig {
  /** Day of week: 0=Sunday, 1=Monday, ..., 6=Saturday */
  dayOfWeek: number;
  /** Hour of day in local time: 0-23 */
  hour: number;
}

export interface LocalUsageSnapshot {
  usage: ClaudeUsage;
  totals: LocalUsageTotals;
}

export class JsonlUsageReader {
  private static readonly CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
  private static readonly DEFAULT_LIMITS: UsageLimits = {
    fiveHourLimit: 5_000_000,
    sevenDayLimit: 200_000_000,
    sevenDayOpusLimit: 50_000_000
  };

  /**
   * Read usage from local JSONL files in ~/.claude/projects/
   * This follows the ccusage technique for offline usage analysis
   */
  static async readUsageFromLocal(
    limits?: Partial<UsageLimits>,
    resetAnchors?: UsageResetAnchors,
    weeklyReset?: WeeklyResetConfig
  ): Promise<ClaudeUsage | null> {
    const snapshot = await this.readUsageSnapshotFromLocal(limits, resetAnchors, weeklyReset);
    return snapshot?.usage ?? null;
  }

  static async readUsageSnapshotFromLocal(
    limits?: Partial<UsageLimits>,
    resetAnchors?: UsageResetAnchors,
    weeklyReset?: WeeklyResetConfig
  ): Promise<LocalUsageSnapshot | null> {
    try {
      if (!fs.existsSync(this.CLAUDE_PROJECTS_DIR)) {
        console.warn(`[JsonlUsageReader] Claude projects directory not found: ${this.CLAUDE_PROJECTS_DIR}`);
        return null;
      }

      return await this.calculateUsageFromJsonl(this.CLAUDE_PROJECTS_DIR, limits, resetAnchors, weeklyReset);
    } catch (error) {
      console.error('[JsonlUsageReader] Error reading local usage:', error);
      return null;
    }
  }

  /**
   * Calculate usage statistics from JSONL files
   */
  private static async calculateUsageFromJsonl(
    dirPath: string,
    limits?: Partial<UsageLimits>,
    resetAnchors?: UsageResetAnchors,
    weeklyReset?: WeeklyResetConfig
  ): Promise<LocalUsageSnapshot | null> {
    try {
      const now = new Date();
      const SESSION_WINDOW_MS = 5 * 60 * 60 * 1000;
      const sevenDaysAgo = weeklyReset
        ? this.getLastWeeklyReset(weeklyReset.dayOfWeek, weeklyReset.hour)
        : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const mergedLimits = this.mergeLimits(limits);

      // Collect all timestamped records from the past 7 days in one pass
      const allRecords: TimestampedRecord[] = [];
      for (const file of this.findJsonlFiles(dirPath)) {
        try {
          const mtime = fs.statSync(file).mtime;
          if (mtime < sevenDaysAgo) {
            continue;
          }
        } catch {
          // If stat fails, fall through and try to parse the file anyway
        }
        allRecords.push(...this.parseJsonlFile(file, sevenDaysAgo));
      }

      // Infer the current session start from timestamps in the last 10h
      const tenHoursAgo = now.getTime() - 2 * SESSION_WINDOW_MS;
      const recentTimestamps = allRecords
        .filter(r => r.ts >= tenHoursAgo)
        .map(r => r.ts)
        .sort((a, b) => a - b);
      const sessionStart = this.findSessionStart(recentTimestamps, now, SESSION_WINDOW_MS);

      // Aggregate token counts
      const totals: LocalUsageTotals = { fiveHourTokens: 0, sevenDayTokens: 0, sevenDayOpusTokens: 0 };
      for (const r of allRecords) {
        if (r.ts >= sessionStart.getTime()) {
          totals.fiveHourTokens += r.tokens;
        }
        totals.sevenDayTokens += r.tokens;
        if (r.isOpus) {
          totals.sevenDayOpusTokens += r.tokens;
        }
      }

      const fiveHourUtilization = this.toUtilization(totals.fiveHourTokens, mergedLimits.fiveHourLimit);
      const sevenDayUtilization = this.toUtilization(totals.sevenDayTokens, mergedLimits.sevenDayLimit);
      const sevenDayOpusUtilization = this.toUtilization(
        totals.sevenDayOpusTokens,
        mergedLimits.sevenDayOpusLimit
      );

      const fiveHourReset = new Date(sessionStart.getTime() + SESSION_WINDOW_MS).toISOString();
      const sevenDayReset = weeklyReset
        ? (() => { const d = new Date(sevenDaysAgo); d.setDate(d.getDate() + 7); return d.toISOString(); })()
        : (resetAnchors?.sevenDayResetsAt ?? this.getResetTime(7 * 24 * 60 * 60 * 1000));
      const sevenDayOpusReset = weeklyReset
        ? sevenDayReset
        : (resetAnchors?.sevenDayOpusResetsAt ?? this.getResetTime(7 * 24 * 60 * 60 * 1000));

      return {
        usage: {
          five_hour: { utilization: fiveHourUtilization, resets_at: fiveHourReset },
          seven_day: { utilization: sevenDayUtilization, resets_at: sevenDayReset },
          seven_day_opus: { utilization: sevenDayOpusUtilization, resets_at: sevenDayOpusReset }
        },
        totals
      };
    } catch (error) {
      console.error('[JsonlUsageReader] Error calculating usage:', error);
      return null;
    }
  }

  /**
   * Infer the session start by scanning backwards through sorted timestamps.
   * A gap larger than the session window means a new session began after it.
   * Falls back to a rolling window if there's no active session.
   */
  private static findSessionStart(sortedTimestamps: number[], now: Date, windowMs: number): Date {
    const fallback = new Date(now.getTime() - windowMs);

    if (sortedTimestamps.length === 0) {
      return fallback;
    }

    // If the most recent activity was more than one window ago, the session has expired
    const mostRecent = sortedTimestamps[sortedTimestamps.length - 1];
    if (now.getTime() - mostRecent > windowMs) {
      return fallback;
    }

    // Walk backwards; the session started at the record right after the first big gap
    let sessionStartMs = sortedTimestamps[0];
    for (let i = sortedTimestamps.length - 1; i > 0; i--) {
      if (sortedTimestamps[i] - sortedTimestamps[i - 1] > windowMs) {
        sessionStartMs = sortedTimestamps[i];
        break;
      }
    }

    // If the block has expired (sessionStart + window < now), re-detect using only
    // timestamps after the block expired. Handles continuous usage crossing a boundary.
    if (now.getTime() - sessionStartMs > windowMs) {
      const blockExpiry = sessionStartMs + windowMs;
      const afterExpiry = sortedTimestamps.filter(ts => ts >= blockExpiry);
      if (afterExpiry.length === 0) {
        // No activity after block expired — no active block, usage is zero
        return now;
      }
      return this.findSessionStart(afterExpiry, now, windowMs);
    }

    return new Date(sessionStartMs);
  }

  /**
   * Parse a single JSONL file, returning all token records at or after cutoff.
   */
  private static parseJsonlFile(filePath: string, cutoff: Date): TimestampedRecord[] {
    const records: TimestampedRecord[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const line of content.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      try {
        const record = JSON.parse(line) as JsonlRecord;
        const tokens = this.extractTokensFromRecord(record);
        if (tokens === 0) {
          continue;
        }
        const date = this.getRecordDate(record);
        if (!date || date < cutoff) {
          continue;
        }
        records.push({ ts: date.getTime(), tokens, isOpus: this.isOpusRecord(record) });
      } catch {
        continue;
      }
    }

    return records;
  }

  private static isOpusRecord(record: JsonlRecord): boolean {
    const model = record.message?.model;
    if (!model) {
      return false;
    }

    return model.toLowerCase().includes('opus');
  }

  /**
   * Extract tokens that count toward usage limits from a JSONL record.
   * Cache reads (cache_read_input_tokens) are excluded — they are served at
   * reduced cost and do not count toward rate limits the same way.
   */
  private static extractTokensFromRecord(record: JsonlRecord): number {
    // Claude Code stores usage in message.usage
    if (!record.message?.usage) {
      return 0;
    }

    const usage = record.message.usage;
    return (
      (usage.input_tokens ?? 0) +
      (usage.output_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0)
      // cache_read_input_tokens intentionally excluded: not counted toward limits
    );
  }

  /**
   * Get the timestamp from a JSONL record
   */
  private static getRecordDate(record: JsonlRecord): Date | null {
    const timestamp = record.created_at || record.timestamp;
    if (!timestamp) {
      return null;
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  /**
   * Get reset time as ISO string (window duration from now)
   */
  private static getResetTime(windowMs: number): string {
    const resetTime = new Date(Date.now() + windowMs);
    return resetTime.toISOString();
  }

  /**
   * Get the most recent occurrence of the given day-of-week and hour (local time).
   * If today is the reset day but the reset hour hasn't passed yet, returns last week's reset.
   */
  private static getLastWeeklyReset(dayOfWeek: number, hour: number): Date {
    const now = new Date();
    const result = new Date(now);
    result.setHours(hour, 0, 0, 0);

    const currentDay = now.getDay();
    let daysBack = (currentDay - dayOfWeek + 7) % 7;

    // Same day but reset hour hasn't arrived yet → go back a full week
    if (daysBack === 0 && now < result) {
      daysBack = 7;
    }

    result.setDate(result.getDate() - daysBack);
    return result;
  }

  private static mergeLimits(limits?: Partial<UsageLimits>): UsageLimits {
    return {
      fiveHourLimit: limits?.fiveHourLimit ?? this.DEFAULT_LIMITS.fiveHourLimit,
      sevenDayLimit: limits?.sevenDayLimit ?? this.DEFAULT_LIMITS.sevenDayLimit,
      sevenDayOpusLimit: limits?.sevenDayOpusLimit ?? this.DEFAULT_LIMITS.sevenDayOpusLimit
    };
  }

  private static toUtilization(tokens: number, limit: number): number {
    if (limit <= 0) {
      return 0;
    }

    const utilization = Math.round((tokens / limit) * 100);
    return Math.max(0, Math.min(100, utilization));
  }

  /**
   * Recursively find all JSONL files in a directory
   */
  private static findJsonlFiles(dirPath: string): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          files.push(...this.findJsonlFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`[JsonlUsageReader] Error reading directory ${dirPath}:`, error);
    }

    return files;
  }

  /**
   * Get custom JSONL directory (for testing or alternative locations)
   */
  static async readUsageFromDirectory(dirPath: string): Promise<ClaudeUsage | null> {
    try {
      if (!fs.existsSync(dirPath)) {
        console.warn(`[JsonlUsageReader] Directory not found: ${dirPath}`);
        return null;
      }

      const snapshot = await this.calculateUsageFromJsonl(dirPath);
      return snapshot?.usage ?? null;
    } catch (error) {
      console.error('[JsonlUsageReader] Error reading from custom directory:', error);
      return null;
    }
  }
}
