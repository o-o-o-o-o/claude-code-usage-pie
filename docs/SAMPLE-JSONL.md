# Sample JSONL Files for Testing

To test the JSONL reader without having Claude Code history, you can create sample JSONL files.

## Sample 1: Recent Conversation (Within 5-Hour Window)

Create a file: `sample-recent.jsonl`

```jsonl
{"messages": [{"input_tokens": 150, "output_tokens": 320, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}], "created_at": "2026-03-09T10:30:00Z", "id": "conv-1"}
{"messages": [{"input_tokens": 80, "output_tokens": 450, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 50}], "created_at": "2026-03-09T11:15:00Z", "id": "conv-2"}
{"messages": [{"input_tokens": 200, "output_tokens": 180, "cache_creation_input_tokens": 100, "cache_read_input_tokens": 0}], "created_at": "2026-03-09T12:00:00Z", "id": "conv-3"}
```

## Sample 2: Multi-Block Conversation

Create a file: `sample-blocks.jsonl`

```jsonl
{"blocks": [{"messages": [{"input_tokens": 100, "output_tokens": 200}, {"input_tokens": 50, "output_tokens": 150}]}, {"messages": [{"input_tokens": 120, "output_tokens": 180}]}], "created_at": "2026-03-08T14:30:00Z", "id": "conv-4"}
{"blocks": [{"messages": [{"input_tokens": 300, "output_tokens": 500}]}], "created_at": "2026-03-07T09:00:00Z", "id": "conv-5"}
```

## Sample 3: Full 7-Day Window Data

Create a file: `sample-week.jsonl`

```jsonl
{"messages": [{"input_tokens": 500, "output_tokens": 1000, "cache_creation_input_tokens": 200, "cache_read_input_tokens": 0}], "created_at": "2026-03-02T10:00:00Z"}
{"messages": [{"input_tokens": 300, "output_tokens": 800, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 150}], "created_at": "2026-03-04T14:00:00Z"}
{"messages": [{"input_tokens": 400, "output_tokens": 600, "cache_creation_input_tokens": 100, "cache_read_input_tokens": 200}], "created_at": "2026-03-06T11:00:00Z"}
{"messages": [{"input_tokens": 250, "output_tokens": 950, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}], "created_at": "2026-03-08T15:30:00Z"}
```

## How to Use for Testing

1. Create a test directory:

   ```bash
   mkdir -p /tmp/claude-test-jsonl
   ```

2. Add sample files:

   ```bash
   cat > /tmp/claude-test-jsonl/test.jsonl << 'EOF'
   {"messages": [{"input_tokens": 150, "output_tokens": 320, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}], "created_at": "2026-03-09T10:30:00Z"}
   {"messages": [{"input_tokens": 200, "output_tokens": 500, "cache_creation_input_tokens": 100, "cache_read_input_tokens": 0}], "created_at": "2026-03-09T11:00:00Z"}
   EOF
   ```

3. Test the reader:
   ```bash
   npm run test:jsonl-usage /tmp/claude-test-jsonl
   ```

## Expected Output

```
=== Claude Usage Checker (from Local JSONL) ===

Reading from custom directory: /tmp/claude-test-jsonl

📊 Usage Summary:

5-Hour Window:
  Utilization: 0%
  Resets at: 2026-03-09T17:30:00.000Z

7-Day Window:
  Utilization: 0%
  Resets at: 2026-03-16T10:30:00.000Z

7-Day Opus Limit:
  Utilization: 0%
  Resets at: 2026-03-16T10:30:00.000Z

✅ Usage level normal
```

## Real JSONL Structure from Claude Code

If you want to see what real Claude Code JSONL files look like:

```bash
# List Claude's project directory
ls -la ~/.claude/projects/

# View a JSONL file
head -5 ~/.claude/projects/*/conversations.jsonl

# Count total conversations
wc -l ~/.claude/projects/*/*.jsonl
```

## Token Count Reference

Typical token distribution:

- Simple questions: 100-300 input, 50-200 output
- Code generation: 200-800 input, 300-2000+ output
- Debugging conversations: 150-500 input, 100-500 output
- Using prompt caching: high cache_creation_input_tokens on first call, then cache_read_input_tokens on subsequent

## Modifying Timestamps

To simulate different time windows, adjust the `created_at` field:

```jsonl
# 2 hours ago
{"messages": [{"input_tokens": 100, "output_tokens": 200}], "created_at": "2026-03-09T08:30:00Z"}

# 4 hours ago
{"messages": [{"input_tokens": 100, "output_tokens": 200}], "created_at": "2026-03-09T06:30:00Z"}

# 2 days ago
{"messages": [{"input_tokens": 100, "output_tokens": 200}], "created_at": "2026-03-07T10:30:00Z"}

# 8 days ago (outside 7-day window)
{"messages": [{"input_tokens": 100, "output_tokens": 200}], "created_at": "2026-03-01T10:30:00Z"}
```

When testing with different timestamps, ensure `created_at` is formatted as ISO 8601 date strings.
