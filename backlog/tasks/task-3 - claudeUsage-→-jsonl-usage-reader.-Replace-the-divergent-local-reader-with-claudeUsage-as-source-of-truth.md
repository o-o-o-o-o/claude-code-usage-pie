---
id: TASK-3
title: >-
  claudeUsage → jsonl-usage-reader. Replace the divergent local reader with
  claudeUsage as source of truth
status: In Progress
assignee: []
created_date: '2026-08-14 01:38'
updated_date: '2026-08-14 01:38'
labels: []
dependencies: []
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mirrors Scripts repo TASK-112. Deletes src/api/jsonl-usage-reader.ts (426 lines) and its late-anchor dedup bug (differs from claudeUsage on 537/3888 msg ids, up to 67.9s) in favor of shelling out to `sd llm claudeUsage --json --live`. Resolution order: Anthropic OAuth API, then claudeUsage --live (server utilization_pct). The estimate tier was removed outright at review (see Review below). disableApiSync now skips the Keychain/API tier; usageDataSource and apiSyncIntervalMinutes removed (no coherent meaning under a fixed resolution order). Not yet committed — work is staged pending review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/api/jsonl-usage-reader.ts and its late-anchor dedup bug are deleted, replaced by a shell-out to sd llm claudeUsage --json --live
- [x] #2 AnthropicUsageClient retained as tier 1; resolution order is API, then claudeUsage --live. No third tier — the estimate tier was removed rather than labelled
- [x] #3 disableApiSync wired to skip the Keychain/API tier; usageDataSource and apiSyncIntervalMinutes removed from package.json
- [x] #4 Extension fails with a clear sd-not-found/zsh-not-found status bar error (not zeros) when sd is unreachable
- [x] #5 localSevenDayLimit and friends removed entirely — with no estimate tier they had no remaining consumer
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Code complete, typechecked, linted, and smoke-tested against the real sd CLI.

## Review (code-review high) — six findings, all fixed

1. **Estimate tier divided raw tokens by cache-weighted limits** — ~7-8x inflation, clamping to 100% (measured: 5h 38.7M raw vs 5M limit = 774%). **Removed the tier entirely** rather than fixing the arithmetic: a hardcoded limit is silently wrong during an account boost anyway (one ran through 2026-08-19). `localFiveHourLimit`, `localSevenDayLimit`, `localSevenDayOpusLimit`, `weeklyResetDay` and `weeklyResetHour` lost their only consumer and were removed from package.json, `ExtensionConfig` and the README; `UsageWindow.estimated` and its `~`/`(est)` UI markers went with them.
2. **`seven_day_opus` was always an estimate** (no live per-model figure exists) and fed `shouldShowWarning` — 415M raw vs a 50M limit = 831% -> clamped 100%, firing a warning modal every 30 minutes regardless of real usage. It is now populated only when the API tier answers.
3. **Timeout below the child's own worst case** (60s vs claudeUsage's 30s live + 60s agentsview). Now passes `--no-week`, which skips the agentsview cost fetch this extension never read — the only remaining child call is the 30s `/usage` round trip, comfortably inside 60s. Also spawns detached and kills the process *group* on timeout, so a kill no longer orphans python/claude grandchildren.
4. **`notifyUpdate()` missing from the `catch`**, so an unexpected throw froze the status bar on the loading glyph forever. Added, with the error surfaced. All payload field access is now runtime-checked rather than dereferenced.
5. **Polling with `--live` wrote a calibration sample per run** (288-1440/day), which would evict hand-taken samples at claudeUsage's 200/window cap and suppress the derived limit that Scripts TASK-111 exists to produce. Added `--no-calibrate` to claudeUsage (Scripts repo) and pass it: reads the store, contributes nothing. Verified: 17 -> 17 samples with the flag, 17 -> 18 without.
6. **`claude-code-usage-pie.login` was contributed but never registered** — clicking the error state raised "command not found". Fallback now points at `refresh`; the dead contribution is removed.

## Found during post-review verification

**`zsh -ic` stdout is not a clean pipe.** macOS Terminal's session support (`/etc/zshrc_Apple_Terminal`) writes `Restored session: ...` and an OSC 7 escape to *stdout* before the command runs, so `JSON.parse(stdout)` failed every time in a real extension-host-like environment. Caught only by running the compiled reader against the live CLI, not by any build gate. Fixed by setting `SHELL_SESSIONS_DISABLE=1` and framing the payload between `__CCUP_BEGIN__`/`__CCUP_END__` markers, with the command's real exit status carried in the closing marker (the shell's own status is the trailing `print`'s, not the command's).

## Verified

`npm run check-types`, `lint`, `compile-tests`, `package` all clean; `dist/extension.js` has zero references to the deleted reader. Smoke-tested the compiled reader against the real CLI: returned `five_hour 24%` / `seven_day 70%`, matching `sd llm claudeUsage --live` exactly, with no opus window and no estimates. Failure path re-checked with `ZDOTDIR=/nonexistent` -> `sd not found — check PATH/SD_ROOT`. `npm test` (Electron) cannot spawn in this environment, consistent with the repo's existing learnings note.
<!-- SECTION:NOTES:END -->
