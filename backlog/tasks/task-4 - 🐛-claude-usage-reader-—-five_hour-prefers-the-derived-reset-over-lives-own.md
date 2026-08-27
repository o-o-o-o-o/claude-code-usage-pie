---
id: TASK-4
title: "\U0001F41B claude-usage-reader — five_hour prefers the derived reset over live's own"
status: Done
assignee: []
created_date: '2026-08-27 00:30'
updated_date: '2026-08-27 00:59'
labels: []
dependencies: []
priority: high
ordinal: 4000
---

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the resets_at bug (five_hour now maps from live.session, not the jsonl-derived block) and, discovered while smoke-testing that fix, the hardcoded shell command in claude-usage-reader.ts still passed --live and --no-calibrate — both removed by Scripts repo commit b9559f1 (2026-08-25, claudeUsage TASK-125: live became the default, calibration became opt-in). Since this machine has disableApiSync:true, the sd llm claudeUsage shell-out was the extension's only data path, so it had been erroring on every single poll ('Unknown option: --live') since 2026-08-25 — a full day of complete non-functionality, not just imprecise data. Fixed by dropping both flags from the COMMAND constant. Also added a shared-cache fast path (readSharedLiveCache) that reads ~/.claude/claudeUsage-live-cache.json directly when fresh (<75s) before shelling out, so multiple simultaneously-open VSCode windows don't each independently spawn zsh -ic every poll. Verified end-to-end via node smoke tests against the compiled out/ (tsc --outDir out, separate from the esbuild dist/ bundle — must rebuild both when testing): full payload now returns live session/week data correctly, buildUsageFromPayload maps 47%/resets 21:39:59 from live.session (not the stale jsonl block's 18:10:54), and a second immediate call hit the shared cache in 0ms.

Medium review (sonnet) then caught two more issues from this same diff: (1) README.md still documented the invocation as 'sd llm claudeUsage --json --live --no-week --no-calibrate' — the exact stale flags just removed from the real command, which would send a maintainer following the docs straight into the same 'Unknown option' error. Fixed both README mentions. (2) readSharedLiveCache() silently never hits for any user whose live data comes from claudeUsage's claude -p "/usage" CLI fallback rather than the OAuth endpoint (a real, expected case per claudeUsage's own fetch_live() docstring: 'an expired token that never refreshes' falls through to CLI) — confirmed that llm/claudeUsage's save_live_cache() is only called from fetch_live_endpoint(), never from fetch_live_cli(). Chose not to fix this in claudeUsage itself: load_live_cache()'s docstring explicitly scopes it to 'the last good endpoint response,' and that same cache dict carries retry_after_until for the 429/Retry-After backoff — folding CLI results into it risks clearing a live block. Documented the limitation in a comment instead (degrades correctly to the slower shell-out path, just without the intended savings for that subset of users).
<!-- SECTION:FINAL_SUMMARY:END -->
