/**
 * A window's utilization is always a server-reported percentage — from the
 * Anthropic API, or from `claude -p "/usage"` via claudeUsage's `--live`.
 * It is never computed from token counts against a limit: a hardcoded limit
 * is silently wrong during an account boost, and the limits this extension
 * shipped were calibrated on a differently-weighted token total than the one
 * they were divided into. A window with no server figure is absent, not
 * estimated.
 */
export interface UsageWindow {
  utilization: number;
  resets_at: string | null;
}

export interface ClaudeUsage {
  five_hour?: UsageWindow;
  seven_day?: UsageWindow;
  seven_day_opus?: UsageWindow;
  seven_day_sonnet?: UsageWindow;
}

export interface ExtensionConfig {
  updateInterval: number;
  showNotifications: boolean;
  warningThreshold: number;
  disableApiSync: boolean;
  statusBarTemplate: string;
  statusBarSymbols: string[];
  weeklyStatusBarSymbols: string[];
}

export enum UsageLevel {
  Normal = 'normal',
  Warning = 'warning',
  Critical = 'critical'
}
