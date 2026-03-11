import * as vscode from 'vscode';
import { ClaudeClient } from '../api/claude-client';
import {
  JsonlUsageReader,
  LocalUsageTotals,
  UsageLimits,
  UsageResetAnchors,
  WeeklyResetConfig
} from '../api/jsonl-usage-reader';
import { UsageCalculator } from '../api/usage-calculator';
import { AuthManager } from '../auth/auth-manager';
import { ClaudeUsage, ExtensionConfig } from '../types';

const INFERRED_LIMITS_KEY = 'claudeCodeUsagePie.inferredLimits';

export class UsageMonitor {
  private static readonly API_ERROR_BACKOFF_MS = 10 * 60 * 1000;
  private static readonly AUTH_UNSUPPORTED_BACKOFF_MS = 24 * 60 * 60 * 1000;

  private intervalHandle: NodeJS.Timeout | null = null;
  private currentUsage: ClaudeUsage | null = null;
  private cachedUsage: ClaudeUsage | null = null;
  private lastWarningTime: number | null = null;
  private onUsageUpdated: ((usage: ClaudeUsage | null) => void) | null = null;
  private isUpdating = false;
  private rateLimitUntil: number = 0;
  private lastApiSyncAt: number = 0;
  private inferredLimits: UsageLimits | null = null;
  private hasShownAuthUnsupportedWarning = false;

  constructor(
    private readonly authManager: AuthManager,
    private config: ExtensionConfig,
    private readonly globalState?: vscode.Memento
  ) {
    this.inferredLimits = globalState?.get<UsageLimits>(INFERRED_LIMITS_KEY) ?? null;
  }

  async start(callback: (usage: ClaudeUsage | null) => void): Promise<void> {
    this.onUsageUpdated = callback;
    // Do an immediate local read so the status bar populates without waiting for the first interval.
    // API sync is deferred to the interval to avoid rate-limit pressure on startup.
    if (this.config.usageDataSource === 'localFirst') {
      const localSnapshot = await JsonlUsageReader.readUsageSnapshotFromLocal(
        this.inferredLimits ?? this.getFallbackLimits(),
        this.getResetAnchorsFromCache(),
        this.getWeeklyResetConfig()
      );
      if (localSnapshot?.usage) {
        this.currentUsage = localSnapshot.usage;
        this.cachedUsage = localSnapshot.usage;
        this.notifyUpdate();
      }
    }
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
      let localUsage: ClaudeUsage | null = null;
      let localTotals: LocalUsageTotals | null = null;
      if (this.config.usageDataSource === 'localFirst') {
        // Local-first path: update quickly from JSONL files even when API is throttled.
        const localSnapshot = await JsonlUsageReader.readUsageSnapshotFromLocal(
          this.inferredLimits ?? this.getFallbackLimits(),
          this.getResetAnchorsFromCache(),
          this.getWeeklyResetConfig()
        );
        localUsage = localSnapshot?.usage ?? null;
        localTotals = localSnapshot?.totals ?? null;

        if (localSnapshot?.usage) {
          this.currentUsage = localSnapshot.usage;
          this.cachedUsage = localUsage;
          this.notifyUpdate();
        }
      }

      const now = Date.now();
      const apiSyncIntervalMs = this.config.apiSyncIntervalMinutes * 60 * 1000;
      const needsApiSync = now - this.lastApiSyncAt >= apiSyncIntervalMs;
      const apiRateLimited = now < this.rateLimitUntil;

      // Skip API sync if disabled via settings
      if (this.config.disableApiSync || apiRateLimited || !needsApiSync) {
        if (!localUsage && this.cachedUsage) {
          this.currentUsage = this.cachedUsage;
          this.notifyUpdate();
        }
        return;
      }

      const token = await this.authManager.getAccessToken();
      if (!token) {
        if (!localUsage) {
          console.warn('[UsageMonitor] No access token found and no local usage data available');
          this.currentUsage = this.cachedUsage || null;
          this.notifyUpdate();
        }
        return;
      }

      const accountId = await this.authManager.getAccountId();
      const client = new ClaudeClient(token, accountId);
      let usage: ClaudeUsage | null = null;

      try {
        usage = await client.getUsage();
        this.lastApiSyncAt = now;
        this.rateLimitUntil = 0;
        if (usage) {
          this.recalibrateLimitsFromApi(usage, localTotals);
          // API shape is authoritative for reset anchors; keep latest successful payload cached.
          this.cachedUsage = usage;
          this.currentUsage = usage;
          this.notifyUpdate();
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes('429')) {
          console.warn('[UsageMonitor] API rate limited; continuing local-first mode for 60 seconds');
          // Treat this as an API sync attempt so we do not retry every poll interval.
          this.lastApiSyncAt = now;
          this.rateLimitUntil = Date.now() + 60000;
          if (!localUsage) {
            this.currentUsage = this.cachedUsage || null;
            this.notifyUpdate();
          }
          return;
        }

        const isAuthUnsupported = this.isAuthUnsupportedError(errorMsg);
        if (isAuthUnsupported) {
          // Anthropic usage endpoint can reject OAuth tokens. Back off for a long period
          // so local-first mode remains usable without noisy repeated API errors.
          this.lastApiSyncAt = now;
          this.rateLimitUntil = now + UsageMonitor.AUTH_UNSUPPORTED_BACKOFF_MS;

          if (!this.hasShownAuthUnsupportedWarning) {
            this.hasShownAuthUnsupportedWarning = true;
            vscode.window.showWarningMessage(
              'Claude usage API is unavailable for this auth token. Continuing in local JSONL mode.'
            );
          }

          console.warn('[UsageMonitor] API auth unsupported; local-first mode only until next backoff window');
          if (!localUsage) {
            this.currentUsage = this.cachedUsage || null;
            this.notifyUpdate();
          }
          return;
        }

        console.error('[UsageMonitor] Failed to fetch usage from API sync:', errorMsg);
        // Generic API failure: respect sync interval and apply short backoff to avoid log spam.
        this.lastApiSyncAt = now;
        this.rateLimitUntil = now + UsageMonitor.API_ERROR_BACKOFF_MS;
        if (!localUsage) {
          this.currentUsage = this.cachedUsage || null;
          this.notifyUpdate();
        }
        return;
      }

      if (this.currentUsage && this.config.showNotifications) {
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
    } finally {
      this.isUpdating = false;
    }
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

  private getResetAnchorsFromCache(): UsageResetAnchors | undefined {
    if (!this.cachedUsage) {
      return undefined;
    }

    return {
      sevenDayResetsAt: this.cachedUsage.seven_day?.resets_at,
      sevenDayOpusResetsAt: this.cachedUsage.seven_day_opus?.resets_at
    };
  }

  private recalibrateLimitsFromApi(usage: ClaudeUsage, totals: LocalUsageTotals | null): void {
    if (!totals) {
      return;
    }

    const fallbackLimits = this.getFallbackLimits();

    const inferred: UsageLimits = {
      fiveHourLimit: this.inferLimitFromUtilization(
        totals.fiveHourTokens,
        usage.five_hour?.utilization,
        this.inferredLimits?.fiveHourLimit ?? fallbackLimits.fiveHourLimit
      ),
      sevenDayLimit: this.inferLimitFromUtilization(
        totals.sevenDayTokens,
        usage.seven_day?.utilization,
        this.inferredLimits?.sevenDayLimit ?? fallbackLimits.sevenDayLimit
      ),
      sevenDayOpusLimit: this.inferLimitFromUtilization(
        totals.sevenDayOpusTokens,
        usage.seven_day_opus?.utilization,
        this.inferredLimits?.sevenDayOpusLimit ?? fallbackLimits.sevenDayOpusLimit
      )
    };

    this.inferredLimits = inferred;
    void this.globalState?.update(INFERRED_LIMITS_KEY, inferred);
  }

  private inferLimitFromUtilization(tokens: number, utilization: number | undefined, fallbackLimit: number): number {
    const percent = utilization ?? 0;
    const ratio = percent / 100;

    if (tokens <= 0 || ratio <= 0) {
      return fallbackLimit;
    }

    // If tokens represent X% usage, inferred limit is tokens / X.
    return Math.max(1, Math.round(tokens / ratio));
  }

  private getFallbackLimits(): UsageLimits {
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

  private isAuthUnsupportedError(errorMsg: string): boolean {
    const msg = errorMsg.toLowerCase();
    return msg.includes('401') && msg.includes('oauth authentication is currently not supported');
  }
}
