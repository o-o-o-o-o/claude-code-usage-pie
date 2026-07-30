---
id: TASK-1
title: Release 0.0.16 tooltip improvements
status: Done
assignee: []
created_date: '2026-07-30 01:30'
updated_date: '2026-07-30 21:25'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the two-row Claude usage hover tooltip with a relative last-updated indicator.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The published extension version is 0.0.16.
- [ ] #2 The hover tooltip shows only the 5-hour and 7-day usage bars.
- [ ] #3 The hover tooltip displays a relative last-updated value.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped 0.0.16: tooltip limited to 5h/7d bars with relative last-updated time. .vscodeignore was missing .claude/** and backlog/** exclusions, so internal tooling dirs would have leaked into the packaged .vsix — fixed before packaging. npm test needs network access to download the Electron test host, which times out in this sandboxed environment; build (check-types + lint) was used as the gate instead per the release skill's fallback.
<!-- SECTION:FINAL_SUMMARY:END -->
