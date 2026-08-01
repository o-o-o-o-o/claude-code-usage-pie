---
id: TASK-2
title: Audit polling & code simplification opportunities
status: Done
assignee: []
created_date: '2026-08-01 14:45'
updated_date: '2026-08-01 14:56'
labels: []
dependencies: []
priority: medium
ordinal: 2000
---

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed 'Last updated: just now' bug (tooltip timestamp was minted at render time, so elapsed was always ~0ms) by threading the actual fetch time from UsageMonitor through to the tooltip and rendering it as absolute time. Also applied 5 code simplifications: day-of-week array lookup, config clamp() helper, extracted getSevenDayReset(), hoisted SESSION_WINDOW_MS to a class constant, and loop-based parseResponse(). Test gate: Electron suite can't launch in this sandbox (documented in learnings.md from TASK-1); used check-types+lint per the release skill's fallback.
<!-- SECTION:FINAL_SUMMARY:END -->
