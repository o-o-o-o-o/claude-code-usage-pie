import { ClaudeUsage, UsageLevel, UsageWindow } from '../types';

export class UsageCalculator {
  private static readonly PIE_SYMBOLS = ['○', '◔', '◑', '◕', '●'];

  static getMaxUtilization(usage: ClaudeUsage): number {
    return Math.max(
      usage.five_hour?.utilization ?? 0,
      usage.seven_day?.utilization ?? 0,
      usage.seven_day_opus?.utilization ?? 0,
      usage.seven_day_sonnet?.utilization ?? 0
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
    // Every percentage reaching here is server-reported (Anthropic API, or
    // `/usage` via claudeUsage --live); there is no estimated variety left to
    // distinguish. See "no estimates" in claude-usage-reader.ts.
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

  private static getProgressBar(utilization: number, width: number = 20): string {
    const bounded = Math.max(0, Math.min(100, utilization));
    const filled = Math.round((bounded / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }

  private static formatResetTimeAbsolute(resetsAt: string | null, type: 'block' | 'weekly'): string {
    if (!resetsAt) {
      return '';
    }
    const d = new Date(resetsAt);
    if (isNaN(d.getTime())) {
      return '';
    }
    if (type === 'weekly') {
      const dayStr = d.toLocaleDateString([], { weekday: 'short' });
      const hourStr = d.toLocaleTimeString([], { hour: 'numeric' });
      return `${dayStr} ${hourStr}`;
    }
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric' });
    return timeStr;
  }

  static getTooltip(usage: ClaudeUsage, updatedAt: Date): string {
    const BAR_WIDTH = 20;

    const formatRow = (label: string, window: UsageWindow, resetStr: string): string => {
      const bar = this.getProgressBar(window.utilization, BAR_WIDTH);
      const reset = window.utilization > 0 && resetStr ? `  ${resetStr}` : '';
      // padEnd uses JS string length, not visual width.
      // Surrogate pairs (SMP emoji like 🗓) count as 2 in .length but 1 visual char.
      // Variation selectors (U+FE0F) count as 1 in .length but add no visual width.
      // Adding both to the padEnd target ensures 🗓️ gets the same trailing space as ⏳ and Ⓞ.
      const surrogates = [...label].filter(c => (c.codePointAt(0) ?? 0) > 0xFFFF).length;
      const invisible = [...label].filter(c => { const cp = c.codePointAt(0) ?? 0; return cp >= 0xFE00 && cp <= 0xFE0F; }).length;
      return `${label.padEnd(2 + invisible + surrogates)} ${bar}${reset}`;
    };

    const rows: string[] = [];

    if (usage.five_hour) {
      const resetStr = this.formatResetTimeAbsolute(usage.five_hour.resets_at, 'block');
      rows.push(formatRow('⏳', usage.five_hour, resetStr));
    }
    if (usage.seven_day) {
      const resetStr = this.formatResetTimeAbsolute(usage.seven_day.resets_at, 'weekly');
      rows.push(formatRow('🗓️', usage.seven_day, resetStr));
    }
    const lastUpdated = updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    return [...rows, `Last updated: ${lastUpdated}`].join('\n');
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
    if (usage.seven_day_sonnet && usage.seven_day_sonnet.utilization >= 90) {
      parts.push(`7-day Sonnet: ${this.formatUtilization(usage.seven_day_sonnet.utilization)}`);
    }

    return parts.length ? `Claude usage high: ${parts.join(', ')}` : 'Claude usage high';
  }
}
