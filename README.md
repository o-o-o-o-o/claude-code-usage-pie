# Claude Code Usage Pie

Monitor Claude Code usage from VS Code and display the current state in the status bar.

## Where usage comes from

Two sources, tried in order:

1. **Anthropic's OAuth API** (`AnthropicUsageClient`) — the account's own access token, read from the macOS Keychain. No prose parsing, but the endpoint can reject the token (`401 OAuth authentication is currently not supported`) depending on account state.
2. **`sd llm claudeUsage --json --no-week`** — shells out to the Scripts repo's `llm/claudeUsage` (live is its default source since its own TASK-125; no `--live` flag needed, and passing one now errors), which calls `claude -p "/usage"` for the server's own reported percentages. This is the primary source in practice, since the OAuth endpoint frequently rejects.

**There is no third, estimate tier.** An earlier version divided locally-counted tokens by a configured limit when neither source answered. That was wrong twice over: the limits had been calibrated against a cache-read-weighted token total but were divided into a raw one (~7-8x inflation, pinning every window to 100%), and a hardcoded limit is silently wrong during an account boost regardless. A window with no server-reported percentage is now simply absent, and the status bar says why — a confident wrong percentage is worse than no percentage.

**This extension has a hard dependency on the Scripts repo being set up and `sd` resolvable from a non-interactive shell** (`sd` is a zsh function sourced from `.zshrc`, not a PATH executable, so the extension invokes it via `zsh -ic`). If that fails, the status bar shows a clear `sd not found` / `zsh not found` error — not zeros, not fabricated numbers, not a silent fallback to something less accurate.

## Features

- Server-reported utilization (API, or `claude -p "/usage"` via claudeUsage) preferred over local token counting wherever available
- Configurable status bar template
- Configurable status bar symbols from 0% to 100%
- Manual refresh command
- Warning notifications at configurable thresholds
- `disableApiSync` to skip the Keychain/API tier entirely and go straight to claudeUsage

## Requirements

- macOS for the Keychain auth helper and the `zsh -ic` invocation of `sd`
- Claude Code CLI authenticated with `claude`
- The Scripts repo on this machine, with `sd` resolvable from `.zshrc` (`SD_ROOT` exported, `llm/claudeUsage` present)

## Commands

- `Claude Code Usage Pie: Refresh Claude Usage`
- `Claude Code Usage Pie: Login to Claude`

## Settings

- `claudeCodeUsagePie.updateInterval` (number, default `300`, minimum `60`)
- `claudeCodeUsagePie.showNotifications` (boolean, default `true`)
- `claudeCodeUsagePie.warningThreshold` (number, default `90`)
- `claudeCodeUsagePie.disableApiSync` (boolean, default `false`) — skip the Keychain/OAuth API tier entirely
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

- Utilization percentages are only ever server-reported (API, or claudeUsage's live source, its default). Do not reintroduce token/limit arithmetic: the limits are unknowable locally and change with account boosts
- `zsh -ic` stdout is not a clean pipe — macOS Terminal's session support writes `Restored session:` and an OSC 7 escape to stdout before the command runs. The reader frames its payload between markers and carries the real exit status in the closing one; keep that framing if you change the invocation
- `sd llm claudeUsage` is a dependency to read, not to reimplement — see `src/api/claude-usage-reader.ts` for why it's invoked via `zsh -ic` rather than a plain PATH lookup
- Keep activation resilient: the status bar should render an actionable error rather than silent zeros when the API is unavailable, `sd` is missing, or `sd llm claudeUsage` itself fails

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
