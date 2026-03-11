# Claude Code Usage Pie

Monitor Claude Code usage from VS Code and display the current state in the status bar.

## Why this extension is local-first

This extension primarily reads usage from Claude Code local JSONL logs under `~/.claude/projects/`.

That is the most reliable source for this use case because:

- Claude Code subscription auth uses an OAuth token from the local CLI environment, not a standard Anthropic API key
- Anthropic's public API rate-limit headers and API-key flows do not apply cleanly to Claude Code subscription auth
- The attempted OAuth usage endpoint can reject the token with `401 OAuth authentication is currently not supported`
- Local JSONL parsing keeps the extension functional even when the remote API is unavailable or unsupported

The extension can still perform optional API calibration, but local parsing is the stable path and should be treated as the source of truth for ongoing maintenance.

## Issues encountered and current handling

- OAuth usage endpoint rejection: handled with long backoff to avoid repeated auth noise
- API retry spam: reduced by explicit backoff windows for auth failures, rate limits, and generic API errors
- Unknown account limits in local-only mode: handled with configurable fallback token limits
- Status bar preferences vary by user: handled with configurable symbol arrays and text templates

## Features

- Local-first usage tracking from Claude Code JSONL logs
- Optional API calibration when available
- Configurable status bar template
- Configurable status bar symbols from 0% to 100%
- Configurable local fallback token limits
- Manual refresh command
- Warning notifications at configurable thresholds
- Local-only mode with API sync fully disabled

## Requirements

- macOS for the current auth helper path
- Claude Code CLI authenticated with `claude`

## Commands

- `Claude Code Usage Pie: Refresh Claude Usage`
- `Claude Code Usage Pie: Login to Claude`

## Settings

- `claudeCodeUsagePie.updateInterval` (number, default `300`, minimum `60`)
- `claudeCodeUsagePie.showNotifications` (boolean, default `true`)
- `claudeCodeUsagePie.warningThreshold` (number, default `90`)
- `claudeCodeUsagePie.usageDataSource` (`localFirst` | `apiOnly`, default `localFirst`)
- `claudeCodeUsagePie.apiSyncIntervalMinutes` (number, default `30`, minimum `5`)
- `claudeCodeUsagePie.disableApiSync` (boolean, default `false`)
- `claudeCodeUsagePie.localFiveHourLimit` (number, default `5000000`)
- `claudeCodeUsagePie.localSevenDayLimit` (number, default `200000000`)
- `claudeCodeUsagePie.localSevenDayOpusLimit` (number, default `50000000`)
- `claudeCodeUsagePie.statusBarTemplate` (string, default `{pie} Claude {perc}`)
- `claudeCodeUsagePie.statusBarSymbols` (string array, first item = 0%, last item = 100%)

### Template placeholders

- `{pie}` selected symbol for the current utilization bucket
- `{perc}` rounded percentage, for example `42%`
- `{percent}` alias for `{perc}`

### Status bar examples

- Pie only: `{pie}`
- Pie and percent: `{pie} {perc}`
- Custom text: `Usage {perc} {pie}`

### Symbol array behavior

`statusBarSymbols` is treated as a progression from empty to full. The first item maps to 0%, the last item maps to 100%, and the intermediate items are bucketed across the full range.

Example:

```json
"claudeCodeUsagePie.statusBarSymbols": [".", "◔", "◑", "◕", "#"]
```

## Maintenance notes

- Prefer local-first behavior for new features and bug fixes
- Treat API sync as optional calibration, not a required dependency
- If auth-related noise reappears, check the backoff logic before changing polling behavior
- Keep activation resilient: the status bar should render even if auth or local file reads fail

## Development

```bash
npm install
npm run compile
```

Useful scripts:

```bash
npm run verify
npm run package:vsix
npm run clean
```
