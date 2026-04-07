import * as vscode from 'vscode';
import { UsageMonitor } from './services/usage-monitor';
import { StatusBarManager } from './ui/status-bar';
import { ExtensionConfig } from './types';

let usageMonitor: UsageMonitor | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const statusBarManager = new StatusBarManager();
  const config = getConfig();

  usageMonitor = new UsageMonitor(config);

  context.subscriptions.push(statusBarManager);

  statusBarManager.showLoading();

  try {
    await usageMonitor.start((usage) => {
      if (!usage) {
        statusBarManager.showError('No data');
      } else {
        statusBarManager.updateUsage(usage, getConfig());
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    statusBarManager.showError('Init failed');
    console.error('[Claude Code Usage Pie] Init failed:', msg);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-usage-pie.refresh', async () => {
      try {
        statusBarManager.showLoading();
        await usageMonitor?.updateUsage();
        vscode.window.showInformationMessage('Claude usage refreshed');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Refresh failed: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeCodeUsagePie')) {
        usageMonitor?.updateConfig(getConfig());
      }
    })
  );
}

export function deactivate(): void {
  usageMonitor?.stop();
}

function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('claudeCodeUsagePie');
  const updateInterval = Math.max(60, config.get<number>('updateInterval', 300));
  const warningThreshold = Math.min(100, Math.max(0, config.get<number>('warningThreshold', 90)));
  const localFiveHourLimit = Math.max(1, config.get<number>('localFiveHourLimit', 5_000_000));
  const localSevenDayLimit = Math.max(1, config.get<number>('localSevenDayLimit', 200_000_000));
  const localSevenDayOpusLimit = Math.max(1, config.get<number>('localSevenDayOpusLimit', 50_000_000));
  const statusBarTemplate = config.get<string>('statusBarTemplate', '{pie} Claude {perc}');
  const rawSymbols = config.get<string[]>('statusBarSymbols', ['○', '◔', '◑', '◕', '●']);
  const statusBarSymbols = Array.isArray(rawSymbols)
    ? rawSymbols.map((item) => String(item)).filter((item) => item.length > 0)
    : ['○', '◔', '◑', '◕', '●'];
  const rawWeeklySymbols = config.get<string[]>('weeklyStatusBarSymbols', []);
  const weeklyStatusBarSymbols = Array.isArray(rawWeeklySymbols)
    ? rawWeeklySymbols.map((item) => String(item)).filter((item) => item.length > 0)
    : [];
  const weeklyResetDay = config.get<string>('weeklyResetDay', 'rolling');
  const weeklyResetHour = Math.min(23, Math.max(0, config.get<number>('weeklyResetHour', 0)));
  return {
    updateInterval,
    warningThreshold,
    showNotifications: config.get<boolean>('showNotifications', true),
    localFiveHourLimit,
    localSevenDayLimit,
    localSevenDayOpusLimit,
    statusBarTemplate,
    statusBarSymbols: statusBarSymbols.length ? statusBarSymbols : ['○', '◔', '◑', '◕', '●'],
    weeklyResetDay,
    weeklyResetHour,
    weeklyStatusBarSymbols
  };
}
