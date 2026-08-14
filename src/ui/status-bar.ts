import * as vscode from 'vscode';
import { UsageCalculator } from '../api/usage-calculator';
import { ClaudeUsage, ExtensionConfig, UsageLevel } from '../types';

export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'claude-code-usage-pie.refresh';
  }

  updateUsage(usage: ClaudeUsage | null, config: ExtensionConfig, updatedAt: Date | null = null): void {
    if (!usage) {
      this.showError('Unavailable');
      return;
    }

    const utilization = UsageCalculator.getStatusUtilization(usage);
    const level = UsageCalculator.getUsageLevel(utilization, config.warningThreshold);

    this.statusBarItem.text = UsageCalculator.getStatusBarText(
      usage,
      config.statusBarTemplate,
      config.statusBarSymbols,
      config.weeklyStatusBarSymbols
    );
    const tooltipBody = UsageCalculator.getTooltip(usage, updatedAt ?? new Date());
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown('**Claude Code Usage**\n\n');
    md.appendCodeblock(tooltipBody);
    md.appendMarkdown('[View usage](https://claude.ai/settings/usage)  •  [Settings](command:workbench.action.openSettings?%5B%22claude-code-usage-pie%22%5D)');
    this.statusBarItem.tooltip = md;
    this.statusBarItem.command = 'claude-code-usage-pie.refresh';

    if (level === UsageLevel.Critical) {
      this.statusBarItem.color = new vscode.ThemeColor('errorForeground');
    } else if (level === UsageLevel.Warning) {
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else {
      this.statusBarItem.color = undefined;
    }

    this.statusBarItem.show();
  }

  showLoading(): void {
    this.statusBarItem.text = '◌ Claude';
    this.statusBarItem.tooltip = 'Fetching usage statistics...';
    this.statusBarItem.show();
  }

  showError(message: string): void {
    this.statusBarItem.text = `◍ Claude: ${message}`;
    // ClaudeUsageReader's own error strings all start with "sd " or "zsh " —
    // the extension has a hard dependency on the Scripts repo's `sd` being
    // reachable (AC#4); this isn't a login problem, so it must not route to
    // the login command.
    const isReaderUnavailable = message.startsWith('sd ') || message.startsWith('zsh ');
    const isRateLimit = message.includes('rate') || message.includes('limit');
    if (isReaderUnavailable) {
      this.statusBarItem.tooltip =
        `${message}\n\nThis extension reads usage via \`sd llm claudeUsage\` from the Scripts repo. ` +
        'Make sure it is on PATH (SD_ROOT exported, shell rc sourced), then click to retry.';
      this.statusBarItem.command = 'claude-code-usage-pie.refresh';
    } else if (isRateLimit) {
      this.statusBarItem.tooltip = 'Rate limited by API. Using cached data. Will retry in ~60s';
      this.statusBarItem.command = undefined;
    } else {
      // Was 'claude-code-usage-pie.login', which is contributed but has no
      // registerCommand — clicking raised "command not found". Retrying is
      // the only action this extension actually offers here.
      this.statusBarItem.tooltip = `${message}\n\nClick to retry.`;
      this.statusBarItem.command = 'claude-code-usage-pie.refresh';
    }
    this.statusBarItem.color = new vscode.ThemeColor('errorForeground');
    this.statusBarItem.show();
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
