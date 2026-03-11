import * as vscode from 'vscode';
import { AuthManager } from './auth/auth-manager';
import { UsageMonitor } from './services/usage-monitor';
import { StatusBarManager } from './ui/status-bar';
import { ExtensionConfig } from './types';

let usageMonitor: UsageMonitor | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const authManager = new AuthManager();
  const statusBarManager = new StatusBarManager();
  const output = vscode.window.createOutputChannel('Claude Code Usage Pie');
  const config = getConfig();

  logRuntimeConfig(output, config, 'activate');

  usageMonitor = new UsageMonitor(authManager, config, context.globalState);

  context.subscriptions.push(statusBarManager, output);

  // Render an immediate placeholder so users can see the extension is active.
  statusBarManager.showLoading();

  const availability = await authManager.checkAvailability();
  if (!availability.available && availability.reason) {
    output.appendLine(`Auth unavailable: ${availability.reason}`);
    vscode.window.showWarningMessage(`Claude Code Usage Pie: ${availability.reason}`);
  }

  try {
    await usageMonitor.start((usage) => {
      if (!usage) {
        statusBarManager.showError('Rate limit');
      } else {
        statusBarManager.updateUsage(usage, getConfig());
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    output.appendLine(`Initial usage update failed: ${msg}`);
    statusBarManager.showError('Init failed');
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
    vscode.commands.registerCommand('claude-code-usage-pie.login', async () => {
      const choice = await vscode.window.showInformationMessage(
        'Authenticate with Claude Code CLI to enable usage monitoring.',
        'Open Terminal'
      );

      if (choice === 'Open Terminal') {
        const terminal = vscode.window.createTerminal('Claude Login');
        terminal.show();
        terminal.sendText('claude');
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeCodeUsagePie')) {
        const nextConfig = getConfig();
        logRuntimeConfig(output, nextConfig, 'config-change');
        usageMonitor?.updateConfig(nextConfig);
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
  const usageDataSource = config.get<'localFirst' | 'apiOnly'>('usageDataSource', 'localFirst');
  const apiSyncIntervalMinutes = Math.max(5, config.get<number>('apiSyncIntervalMinutes', 30));
  const disableApiSync = config.get<boolean>('disableApiSync', false);
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
    usageDataSource,
    apiSyncIntervalMinutes,
    disableApiSync,
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

function logRuntimeConfig(
  output: vscode.OutputChannel,
  config: ExtensionConfig,
  source: 'activate' | 'config-change'
): void {
  const msg =
    `[RuntimeConfig:${source}] mode=${config.usageDataSource}` +
    `, apiSyncIntervalMinutes=${config.apiSyncIntervalMinutes}` +
    `, disableApiSync=${config.disableApiSync}` +
    `, updateIntervalSeconds=${config.updateInterval}`;

  output.appendLine(msg);
  console.log(`[Claude Code Usage Pie] ${msg}`);
}
