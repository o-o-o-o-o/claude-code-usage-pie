# Change Log

All notable changes to the "Claude Code Usage Pie" extension are documented in this file.

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
