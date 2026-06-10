import * as vscode from 'vscode';
import { JsonlUsageReader, UsageLimits, WeeklyResetConfig } from '../api/jsonl-usage-reader';
import { UsageCalculator } from '../api/usage-calculator';
import { KeychainClient } from '../api/keychain-client';
import { AnthropicUsageClient } from '../api/anthropic-usage-client';
import { ClaudeUsage, ExtensionConfig } from '../types';

export class UsageMonitor {
  private intervalHandle: NodeJS.Timeout | null = null;
  private currentUsage: ClaudeUsage | null = null;
  private lastWarningTime: number | null = null;
  private onUsageUpdated: ((usage: ClaudeUsage | null) => void) | null = null;
  private isUpdating = false;

  constructor(
    private config: ExtensionConfig,
  ) {}

  async start(callback: (usage: ClaudeUsage | null) => void): Promise<void> {
    this.onUsageUpdated = callback;
    // Immediate read so the status bar populates without waiting for the first interval.
    await this.updateUsage();
    this.schedule();
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  updateConfig(config: ExtensionConfig): void {
    this.config = config;
    this.schedule();
  }

  getCurrentUsage(): ClaudeUsage | null {
    return this.currentUsage;
  }

  async updateUsage(): Promise<void> {
    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;
    try {
      const usage = await this.fetchUsage();

      if (usage) {
        this.currentUsage = usage;
        this.notifyUpdate();

        if (this.config.showNotifications) {
          const shouldWarn = UsageCalculator.shouldShowWarning(
            this.currentUsage,
            this.config.warningThreshold,
            this.lastWarningTime
          );
          if (shouldWarn) {
            vscode.window.showWarningMessage(UsageCalculator.getWarningMessage(this.currentUsage));
            this.lastWarningTime = Date.now();
          }
        }
      }
    } catch (error) {
      console.error('[UsageMonitor] Failed to read usage:', error instanceof Error ? error.message : String(error));
    } finally {
      this.isUpdating = false;
    }
  }

  private async fetchUsage(): Promise<ClaudeUsage | null> {
    const token = await KeychainClient.getClaudeAccessToken();
    if (token) {
      const apiUsage = await AnthropicUsageClient.fetchUsage(token);
      if (apiUsage) {
        return apiUsage;
      }
      console.warn('[UsageMonitor] API fetch failed, falling back to JSONL');
    }

    const snapshot = await JsonlUsageReader.readUsageSnapshotFromLocal(
      this.getLimits(),
      undefined,
      this.getWeeklyResetConfig()
    );
    return snapshot?.usage ?? null;
  }

  private schedule(): void {
    this.stop();
    this.intervalHandle = setInterval(() => {
      void this.updateUsage();
    }, this.config.updateInterval * 1000);
  }

  private notifyUpdate(): void {
    if (this.onUsageUpdated) {
      this.onUsageUpdated(this.currentUsage);
    }
  }

  private getLimits(): UsageLimits {
    return {
      fiveHourLimit: this.config.localFiveHourLimit,
      sevenDayLimit: this.config.localSevenDayLimit,
      sevenDayOpusLimit: this.config.localSevenDayOpusLimit
    };
  }

  private getWeeklyResetConfig(): WeeklyResetConfig | undefined {
    const { weeklyResetDay, weeklyResetHour } = this.config;
    if (weeklyResetDay === 'rolling') {
      return undefined;
    }
    const dayMap: Record<string, number> = {
      Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
      Thursday: 4, Friday: 5, Saturday: 6
    };
    const dayOfWeek = dayMap[weeklyResetDay];
    if (dayOfWeek === undefined) {
      return undefined;
    }
    return { dayOfWeek, hour: weeklyResetHour };
  }
}
