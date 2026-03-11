# Using Local JSONL Files for Claude Usage Analysis

This document explains how to check Claude Code usage from **local JSONL files** using the `ccusage` technique.

## What are JSONL Files?

JSONL (JSON Lines) files are where Claude Code stores conversation data locally on your machine. Each line is a separate JSON object containing:

- Conversation messages
- Token counts (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens)
- Timestamps

## Benefits of Using Local JSONL vs API

| Aspect              | Local JSONL                      | Claude API                   |
| ------------------- | -------------------------------- | ---------------------------- |
| **Rate Limits**     | None - unlimited offline reading | Subject to API rate limits   |
| **Speed**           | Instant - reads local files      | Requires network request     |
| **Availability**    | Works offline                    | Requires internet connection |
| **Historical Data** | Full conversation history        | Current snapshot only        |
| **Privacy**         | Data never leaves your machine   | Data sent over network       |

## Default Location

Claude Code stores JSONL files in:

```
~/.claude/projects/
```

The directory structure typically looks like:

```
~/.claude/projects/
├── project-1/
│   └── *.jsonl  (conversation files)
├── project-2/
│   └── *.jsonl
└── ...
```

## Usage Methods

### 1. Read from Default Location (Automatic)

```typescript
import { JsonlUsageReader } from "./api/jsonl-usage-reader";

const usage = await JsonlUsageReader.readUsageFromLocal();
console.log(usage.five_hour.utilization); // 45%
```

### 2. Read from Custom Directory

```typescript
const usage = await JsonlUsageReader.readUsageFromDirectory(
  "/path/to/jsonl/files",
);
```

### 3. Test Utility

Run the included test utility:

```bash
# From default location
npm run test:jsonl-usage

# From custom location
npm run test:jsonl-usage /path/to/files
```

## How It Works

1. **Find JSONL files** recursively in the projects directory
2. **Parse each JSONL file** - each line is a conversation record
3. **Extract token counts** from messages (input, output, cache tokens)
4. **Group by time window**:
   - 5-hour billing window (current Claude Code limit)
   - 7-day rolling window
   - 7-day Opus-specific limit
5. **Calculate utilization** as percentage of limit
6. **Return ClaudeUsage** object matching API response format

## Integrating with Your Extension

### Option A: Use as Fallback (Recommended)

Update `UsageMonitor` to try local JSONL first, then fall back to API:

```typescript
async updateUsage(): Promise<void> {
  // Try local JSONL first (no rate limits)
  let usage = await JsonlUsageReader.readUsageFromLocal();

  if (usage) {
    this.currentUsage = usage;
    this.notifyUpdate();
    return;
  }

  // Fall back to API if local files not available
  usage = await this.claudeClient.getUsage();
  this.currentUsage = usage;
  this.notifyUpdate();
}
```

### Option B: Local-First Strategy

Always use local JSONL, only use API for account info:

```typescript
async updateUsage(): Promise<void> {
  const usage = await JsonlUsageReader.readUsageFromLocal();
  if (usage) {
    this.currentUsage = usage;
    this.notifyUpdate();
  }
}
```

### Option C: Compare Both Methods

Use for debugging/validation:

```typescript
const localUsage = await JsonlUsageReader.readUsageFromLocal();
const apiUsage = await this.claudeClient.getUsage();

console.log("Local:", localUsage);
console.log("API:", apiUsage);
```

## JSONL Record Structure

Example JSONL record:

```json
{
  "messages": [
    {
      "input_tokens": 150,
      "output_tokens": 320,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 0
    }
  ],
  "created_at": "2026-03-09T10:30:00Z",
  "id": "conv-12345"
}
```

Or with blocks (in conversations with multiple turns):

```json
{
  "blocks": [
    {
      "messages": [{ "input_tokens": 100, "output_tokens": 200 }]
    }
  ],
  "created_at": "2026-03-09T10:30:00Z"
}
```

## Comparing with `ccusage` CLI

The `ccusage` npm package does exactly this—it analyzes local JSONL files:

```bash
# Install
npx ccusage@latest

# Show daily usage report
npx ccusage daily

# Show JSON output
npx ccusage daily --json

# Custom directory
npx ccusage daily --path /custom/path

# Filter by date
npx ccusage daily --since 20260301 --until 20260309
```

Our implementation provides the same capability programmatically for your extension.

## Token Counts by Model

Approximate token costs (for reference):

| Model             | Input      | Output    |
| ----------------- | ---------- | --------- |
| Claude 3.5 Sonnet | 3 ¢ / 1M   | 15 ¢ / 1M |
| Claude 3 Opus     | 15 ¢ / 1M  | 75 ¢ / 1M |
| Claude 3 Haiku    | 0.8 ¢ / 1M | 4 ¢ / 1M  |

Note: This implementation tracks token counts, not costs. Modify if needed.

## Rate Limits (Default Thresholds)

These are hardcoded in `jsonl-usage-reader.ts`. Adjust based on your actual limits:

```typescript
const FIVE_HOUR_LIMIT = 1_000_000; // tokens in 5-hour window
const SEVEN_DAY_LIMIT = 10_000_000; // tokens in 7-day window
const SEVEN_DAY_OPUS_LIMIT = 5_000_000; // Opus has lower limit
```

Get actual limits from: https://console.anthropic.com/dashboard/usage

## Troubleshooting

### Issue: No JSONL files found

- Check if `~/.claude/projects/` exists
- Ensure Claude Code has run and created conversation history
- Try manually specifying directory: `readUsageFromDirectory('/path')`

### Issue: Tokens are 0

- JSONL files might be empty or have different structure
- Check file format with: `head -1 ~/.claude/projects/*/*.jsonl`
- May need to adjust parsing logic for your Claude version

### Issue: Utilization seems wrong

- Verify rate limits in `FIVE_HOUR_LIMIT`, `SEVEN_DAY_LIMIT`
- Compare with actual API response
- Print token counts: `console.log(totalTokens)`

## References

- [ccusage npm package](https://www.npmjs.com/package/ccusage)
- [ccusage documentation](https://ccusage.com/)
- [Claude API Usage Docs](https://docs.anthropic.com/en/api/getting-started)
