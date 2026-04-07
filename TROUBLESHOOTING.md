# Usage Sync Troubleshooting

## The core problem

Anthropic does not expose their usage calculation formula or plan limits via any API. This extension reads the JSONL files Claude Code writes locally (`~/.claude/projects/**/*.jsonl`) and reverse-engineers the percentages shown on [claude.ai/settings/limits](https://claude.ai/settings/limits).

That means any mismatch between this extension and the Claude website is either a formula bug, a limit misconfiguration, or an Anthropic change we haven't caught yet.

---

## Known issues and fixes (as of v0.0.13)

### 1. Duplicate records (FIXED)

**Symptom:** Extension shows 2-3x the actual percentage (e.g. 600% when Claude reports 60%).

**Cause:** Claude Code uses streaming. Each API call produces 2-3 JSONL records:
- A partial record written at stream start (low `output_tokens`, often 1)
- The final complete record (full `output_tokens`)
- Sometimes an intermediate record

All records share the same `message.id`. Without deduplication, every API call is counted 2-3x.

**Fix:** Deduplicate by `message.id`, keeping the record with the highest `output_tokens` (the complete response). See `deduplicateByMsgId()` in `jsonl-usage-reader.ts`.

### 2. Cache read tokens counted at full weight (FIXED)

**Symptom:** 5-hour session count is wildly inflated (10-20x actual).

**Cause:** `cache_read_input_tokens` can be enormous (50K–150K per message when the context is large). Counting them at full weight makes a typical session appear to use 400-700% of the limit.

**Fix:** Weight cache reads at **0.1x** — matching Anthropic's pricing ratio and empirically verified against the Claude website. The formula used is:

```
effective_tokens = input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens * 0.1
```

This is reverse-engineered, not documented by Anthropic.

---

## If the percentages drift again

### Checklist

1. **Check for new duplicate patterns** — run this to see how many records share a `message.id`:
   ```bash
   cat ~/.claude/projects/**/*.jsonl | python3 -c "
   import sys, json
   from collections import Counter
   ids = Counter()
   for line in sys.stdin:
       try:
           r = json.loads(line)
           mid = r.get('message', {}).get('id')
           if mid and r.get('message', {}).get('usage'): ids[mid] += 1
       except: pass
   from collections import Counter as C
   counts = C(ids.values())
   print('Records per msg_id:', dict(sorted(counts.items())))
   "
   ```
   If you see 4+ records per ID, the dedup strategy may need updating.

2. **Verify the cache read weight** — compare raw token counts at different weights against the Claude website screenshot. The weight that makes `5h_tokens / 5h_limit ≈ claude_website_%` is the right one.

3. **Check the session detection** — the extension infers session start from gaps > 5 hours in the timestamp series. If your usage pattern has continuous activity across a boundary, it may detect the wrong start. Compare the inferred reset time shown in the tooltip against the Claude website.

4. **Check your limit settings** — the limits in VSCode settings must match your actual plan:
   - `localFiveHourLimit` — set to match "Current session" denominator
   - `localSevenDayLimit` — set to match "All models" weekly denominator
   
   To find the right values, work backwards:
   ```
   correct_limit = measured_tokens / (claude_website_percent / 100)
   ```
   Where `measured_tokens` is logged to the extension output channel.

---

## Why exact parity with Claude's UI is hard

- Anthropic doesn't document the formula (token counting, cache weighting, session boundaries)
- Plan limits aren't exposed via API — you have to set them manually
- The formula was reverse-engineered from observed data points and may be wrong in edge cases
- Anthropic can change their counting method without notice

A ±5 percentage point difference is acceptable given these constraints. A 2x+ difference usually indicates a new duplication pattern or a formula regression.
