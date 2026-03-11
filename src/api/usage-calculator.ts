import { ClaudeUsage, UsageLevel } from '../types';

export class UsageCalculator {
  private static readonly PIE_SYMBOLS = ['○', '◔', '◑', '◕', '●'];

  static getMaxUtilization(usage: ClaudeUsage): number {
    return Math.max(
      usage.five_hour?.utilization ?? 0,
      usage.seven_day?.utilization ?? 0,
      usage.seven_day_opus?.utilization ?? 0
    );
  }

  static getStatusUtilization(usage: ClaudeUsage): number {
    // Keep parity with Claude Usage Monitor behavior: prefer 5-hour window in status bar.
    return usage.five_hour?.utilization ?? this.getMaxUtilization(usage);
  }

  static getUsageLevel(utilization: number, threshold: number = 90): UsageLevel {
    if (utilization >= threshold) {
      return UsageLevel.Critical;
    }
    if (utilization >= threshold * 0.75) {
      return UsageLevel.Warning;
    }
    return UsageLevel.Normal;
  }

  static formatUtilization(utilization: number): string {
    return `${Math.round(utilization)}%`;
  }

  static getUnicodePie(utilization: number, symbols: string[] = this.PIE_SYMBOLS): string {
    const bounded = Math.max(0, Math.min(100, utilization));
    const safeSymbols = symbols.length > 0 ? symbols : this.PIE_SYMBOLS;
    const idx = Math.min(safeSymbols.length - 1, Math.floor((bounded / 100) * safeSymbols.length));
    return safeSymbols[idx];
  }

  static getStatusBarText(
    usage: ClaudeUsage,
    template: string = '{pie} Claude {perc}',
    symbols: string[] = this.PIE_SYMBOLS,
    weeklySymbols?: string[]
  ): string {
    const utilization = this.getStatusUtilization(usage);
    const pie = this.getUnicodePie(utilization, symbols);
    const perc = this.formatUtilization(utilization);

    const weeklyUtilization = usage.seven_day?.utilization ?? 0;
    const weekPie = this.getUnicodePie(weeklyUtilization, weeklySymbols && weeklySymbols.length > 0 ? weeklySymbols : symbols);

    return template
      .replaceAll('{pie}', pie)
      .replaceAll('{weekPie}', weekPie)
      .replaceAll('{perc}', perc)
      .replaceAll('{percent}', perc)
      .trim();
  }

  static formatResetTime(resetsAt: string | null): string {
    if (!resetsAt) {
      return 'Unknown';
    }

    const resetDate = new Date(resetsAt);
    if (isNaN(resetDate.getTime())) {
      return 'Invalid';
    }

    const diffMs = resetDate.getTime() - Date.now();
    if (diffMs < 0) {
      return 'Resetting soon...';
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days}d ${remHours}h`;
    }

    return `${hours}h ${minutes}m`;
  }

  static getTooltip(usage: ClaudeUsage): string {
    const lines: string[] = ['Claude Code Usage'];

    if (usage.five_hour) {
      lines.push(
        `5-Hour: ${this.formatUtilization(usage.five_hour.utilization)} (resets in ${this.formatResetTime(usage.five_hour.resets_at)})`
      );
    }

    if (usage.seven_day) {
      lines.push(
        `7-Day: ${this.formatUtilization(usage.seven_day.utilization)} (resets in ${this.formatResetTime(usage.seven_day.resets_at)})`
      );
    }

    if (usage.seven_day_opus) {
      lines.push(
        `7-Day Opus: ${this.formatUtilization(usage.seven_day_opus.utilization)} (resets in ${this.formatResetTime(usage.seven_day_opus.resets_at)})`
      );
    }

    return lines.join('\n');
  }

  static shouldShowWarning(usage: ClaudeUsage, threshold: number, lastWarningTime: number | null): boolean {
    const maxUtilization = this.getMaxUtilization(usage);
    if (maxUtilization < threshold) {
      return false;
    }

    const cooldownMs = 30 * 60 * 1000;
    if (lastWarningTime && Date.now() - lastWarningTime < cooldownMs) {
      return false;
    }

    return true;
  }

  static getWarningMessage(usage: ClaudeUsage): string {
    const parts: string[] = [];

    if (usage.five_hour && usage.five_hour.utilization >= 90) {
      parts.push(`5-hour: ${this.formatUtilization(usage.five_hour.utilization)}`);
    }
    if (usage.seven_day && usage.seven_day.utilization >= 90) {
      parts.push(`7-day: ${this.formatUtilization(usage.seven_day.utilization)}`);
    }
    if (usage.seven_day_opus && usage.seven_day_opus.utilization >= 90) {
      parts.push(`7-day Opus: ${this.formatUtilization(usage.seven_day_opus.utilization)}`);
    }

    return parts.length ? `Claude usage high: ${parts.join(', ')}` : 'Claude usage high';
  }
}
