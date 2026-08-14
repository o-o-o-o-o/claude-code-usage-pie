# Change Log

All notable changes to the "Claude Code Usage Pie" extension are documented in this file.

## [0.0.18]

- Usage percentages now come only from the server (Anthropic's API, or `claude -p "/usage"` via `sd llm claudeUsage --live`). The token/limit estimate tier is gone: its limits had been calibrated against a cache-read-weighted token total but were divided into a raw one, inflating every window roughly 7-8x and pinning the pie to 100% whenever the estimate was in use
- Fixed a warning notification firing every 30 minutes regardless of real usage — the Opus 7-day figure was always a token/limit estimate (no per-model live figure exists), so it sat at a clamped 100% and tripped the threshold. Opus is now shown only when the API reports it
- Removed the extension's own 426-line JSONL reader in favour of `sd llm claudeUsage`. The local copy had drifted: its deduplication kept the highest-token record and took that record's timestamp, biasing the inferred session start late on 537 of 3,888 requests (up to 67.9s)
- Fixed the status bar freezing on the loading glyph when a usage read threw unexpectedly, with no indication anything had failed
- Fixed clicking the error state raising "command not found" — it pointed at a command that was declared but never registered; it now retries
- Removed `localFiveHourLimit`, `localSevenDayLimit`, `localSevenDayOpusLimit`, `weeklyResetDay` and `weeklyResetHour`, which no longer have any effect, along with `usageDataSource` and `apiSyncIntervalMinutes`, which never did
- `disableApiSync` now actually works: it skips the Keychain read and the api.anthropic.com call entirely

**Requires the Scripts repo**: usage is read via `sd llm claudeUsage`, so `sd` must resolve from your shell. If it does not, the status bar says so rather than showing zeros.

## [0.0.17]

- Fixed the tooltip's `Last updated` time always showing "just now" — it was computed at render time instead of from the actual data fetch, so it now shows the real time the usage data was last refreshed

## [0.0.16]

- Limited the hover tooltip to the 5-hour and 7-day usage bars
- Added a relative `Last updated` time to the hover tooltip

## [0.0.15]

- Usage now comes directly from Anthropic's API (the same source Claude Code's `/usage` screen uses) — no more token counting or hard-coded limits, so percentages match exactly regardless of plan tier
- Automatically falls back to JSONL-based counting when offline or not logged in
- Added `seven_day_sonnet` window to tooltip (shown as Ⓢ) when reported by the API

## [0.0.14]

- Fixed 5-hour session showing higher than actual when API sync is disabled — stale limit calibrations from old API responses were persisted in VSCode state and silently overriding the configured limits; now ignored when `disableApiSync` is true

## [0.0.13]

- Fixed severe over-counting: each API call was stored 2-3× in JSONL (streaming artefact) and all copies were summed, inflating session usage 2-3× — now deduplicated by message ID, keeping the complete response
- Fixed cache read token weighting: previously counted at full weight (causing 10-20× inflation) or excluded entirely (causing under-counting) — now weighted at 0.1× to match Anthropic's pricing ratio, which empirically aligns with the Claude website's reported percentages
- Added TROUBLESHOOTING.md documenting the root causes, the reverse-engineered counting formula, and a checklist for diagnosing future drift

## [0.0.12]

- Fixed weekly usage showing as 100% — cache read tokens are no longer counted toward the 7-day limit (they don't factor into Anthropic's reported weekly utilization), while still being counted in the 5-hour block to match Claude Code's session meter

## [0.0.11]

- Session usage now matches Claude Code's own tracking — cache read tokens are included in the count, fixing ~30-40% underreporting in typical sessions
- Block reset time in tooltip now shows just the hour (e.g. "8 PM" instead of "8:06 PM"), matching Claude Code's display style

## [0.0.10]

- Removed GitHub Copilot integration (Copilot's free/individual plan API does not expose premium requests as a trackable quota — only business/enterprise plans do via a different endpoint)

## [0.0.9]

- Fixed block usage not resetting after the 5-hour window expires — continuous sessions crossing a block boundary now correctly show only tokens from the new block

## [0.0.8]

- Fixed weekly reset time showing 1 hour late after DST change (e.g. "Fri 10 AM" → "Fri 9 AM")
- Aligned tooltip progress bars — emoji label spacing now accounts for variation selectors in 🗓️
- Tighter spacing between label emoji and progress bar (1 space)

## [0.0.7]

- Tooltip emoji labels: ⏳ for block window, 🗓️ for weekly, Ⓞ for Opus
- Weekly reset time now shows short format (e.g. "Mon 9 AM") instead of "Mon 9:00 AM"
- Percentage hidden from tooltip progress bar rows
- Added Settings link to tooltip for quick access to extension configuration

## [0.0.6]

- Enhanced status bar tooltip formatting

## [0.0.5]

- Infer 5-hour session boundaries from JSONL timestamps instead of rolling window — closer to Anthropic's actual session model
- Persist calibrated token limits across restarts so local-first percentages stay accurate without a live API sync
- Populate status bar immediately on activation (no more waiting for the first poll interval)
- Removed dependency on API anchor for 5-hour reset time — derived from inferred session start

## [0.0.4]

- Added local-only mode with full API sync disable support
- Added configurable fallback limits for 5-hour, 7-day, and 7-day Opus windows
- Added configurable status bar template and symbol array support
- Reduced auth-related log noise with long backoff for unsupported OAuth usage API responses
- Updated documentation to explain the local-first architecture and known API limitations
