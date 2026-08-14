import * as vscode from 'vscode';
import { ClaudeUsageReader, buildUsageFromPayload, describeEmptyPayload } from '../api/claude-usage-reader';
import { UsageCalculator } from '../api/usage-calculator';
import { KeychainClient } from '../api/keychain-client';
import { AnthropicUsageClient } from '../api/anthropic-usage-client';
import { ClaudeUsage, ExtensionConfig } from '../types';

interface FetchResult {
  usage: ClaudeUsage | null;
  error: string | null;
}

export class UsageMonitor {
  private intervalHandle: NodeJS.Timeout | null = null;
  private currentUsage: ClaudeUsage | null = null;
  private lastFetchAt: Date | null = null;
  private lastError: string | null = null;
  private lastWarningTime: number | null = null;
  private onUsageUpdated: ((usage: ClaudeUsage | null, updatedAt: Date | null, error: string | null) => void) | null = null;
  private isUpdating = false;

  constructor(
    private config: ExtensionConfig,
  ) {}

  async start(callback: (usage: ClaudeUsage | null, updatedAt: Date | null, error: string | null) => void): Promise<void> {
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
      const { usage, error } = await this.fetchUsage();
      this.lastError = error;

      if (usage) {
        this.currentUsage = usage;
        this.lastFetchAt = new Date();
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
      } else {
        console.error('[UsageMonitor] Failed to read usage:', error);
        this.notifyUpdate();
      }
    } catch (error) {
      // Anything unexpected still has to reach the status bar: without this
      // the UI keeps whatever glyph it had — on the very first poll, the
      // loading spinner — forever, with no indication anything went wrong.
      const message = error instanceof Error ? error.message : String(error);
      console.error('[UsageMonitor] Failed to read usage:', message);
      this.lastError = `usage read failed: ${message}`;
      this.notifyUpdate();
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Resolution order: Anthropic API (OAuth token from the Keychain, no
   * prose parsing) → `sd llm claudeUsage --live` (server utilization via
   * `claude -p "/usage"`). There is no third tier — see the "no estimates"
   * note in claude-usage-reader.ts. `disableApiSync` skips the first tier
   * entirely: no Keychain read, no network call to api.anthropic.com,
   * straight to claudeUsage.
   */
  private async fetchUsage(): Promise<FetchResult> {
    if (!this.config.disableApiSync) {
      const token = await KeychainClient.getClaudeAccessToken();
      if (token) {
        const apiUsage = await AnthropicUsageClient.fetchUsage(token);
        if (apiUsage) {
          return { usage: apiUsage, error: null };
        }
        console.warn('[UsageMonitor] API fetch failed, falling back to claudeUsage');
      }
    }

    const { payload, error } = await ClaudeUsageReader.readUsage();
    if (!payload) {
      return { usage: null, error };
    }
    const usage = buildUsageFromPayload(payload);
    // claudeUsage exits 0 when --live itself failed, so an empty result here
    // is a real outcome to explain rather than a success with no windows.
    if (!usage.five_hour && !usage.seven_day) {
      return { usage: null, error: describeEmptyPayload(payload) };
    }
    return { usage, error: null };
  }

  private schedule(): void {
    this.stop();
    this.intervalHandle = setInterval(() => {
      void this.updateUsage();
    }, this.config.updateInterval * 1000);
  }

  private notifyUpdate(): void {
    if (this.onUsageUpdated) {
      // Only surface the error once there is nothing to show — a transient
      // failure with stale data already on screen keeps that data rather
      // than replacing it with an error state.
      this.onUsageUpdated(this.currentUsage, this.lastFetchAt, this.currentUsage ? null : this.lastError);
    }
  }
}
