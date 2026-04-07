# Change Log

All notable changes to the "Claude Code Usage Pie" extension are documented in this file.

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
