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
  localFiveHourLimit: number;
  localSevenDayLimit: number;
  localSevenDayOpusLimit: number;
  statusBarTemplate: string;
  statusBarSymbols: string[];
  weeklyResetDay: string;
  weeklyResetHour: number;
  weeklyStatusBarSymbols: string[];
}

export enum UsageLevel {
  Normal = 'normal',
  Warning = 'warning',
  Critical = 'critical'
}
