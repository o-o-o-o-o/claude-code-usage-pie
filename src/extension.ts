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
    await usageMonitor.start((usage, updatedAt, error) => {
      if (!usage) {
        statusBarManager.showError(error ?? 'No data');
      } else {
        statusBarManager.updateUsage(usage, getConfig(), updatedAt);
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

function clamp(value: number, min: number, max: number = Infinity): number {
  return Math.min(max, Math.max(min, value));
}

function getSymbolsList(config: vscode.WorkspaceConfiguration, key: string, fallback: string[]): string[] {
  const raw = config.get<string[]>(key, fallback);
  const list = Array.isArray(raw) ? raw.map((item) => String(item)).filter((item) => item.length > 0) : [];
  return list.length ? list : fallback;
}

function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('claudeCodeUsagePie');
  return {
    updateInterval: clamp(config.get<number>('updateInterval', 300), 60),
    warningThreshold: clamp(config.get<number>('warningThreshold', 90), 0, 100),
    showNotifications: config.get<boolean>('showNotifications', true),
    disableApiSync: config.get<boolean>('disableApiSync', false),
    statusBarTemplate: config.get<string>('statusBarTemplate', '{pie} Claude {perc}'),
    statusBarSymbols: getSymbolsList(config, 'statusBarSymbols', ['○', '◔', '◑', '◕', '●']),
    weeklyStatusBarSymbols: getSymbolsList(config, 'weeklyStatusBarSymbols', [])
  };
}
