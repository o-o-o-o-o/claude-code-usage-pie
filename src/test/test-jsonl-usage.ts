import * as path from 'path';
import * as os from 'os';
import { JsonlUsageReader } from '../api/jsonl-usage-reader';

/**
 * Test utility to check Claude usage from local JSONL files
 * Usage: npx ts-node src/test/test-jsonl-usage.ts [optional-directory-path]
 */
async function main() {
  const customDir = process.argv[2];

  console.log('=== Claude Usage Checker (from Local JSONL) ===\n');

  if (customDir) {
    console.log(`Reading from custom directory: ${customDir}\n`);
    const usage = await JsonlUsageReader.readUsageFromDirectory(customDir);
    printUsage(usage);
  } else {
    console.log(`Reading from default directory: ~/.claude/projects/\n`);
    const usage = await JsonlUsageReader.readUsageFromLocal();
    printUsage(usage);
  }
}

function printUsage(usage: any) {
  if (!usage) {
    console.log('❌ No usage data found');
    return;
  }

  console.log('📊 Usage Summary:\n');

  if (usage.five_hour) {
    console.log(`5-Hour Window:`);
    console.log(`  Utilization: ${usage.five_hour.utilization}%`);
    console.log(`  Resets at: ${usage.five_hour.resets_at}\n`);
  }

  if (usage.seven_day) {
    console.log(`7-Day Window:`);
    console.log(`  Utilization: ${usage.seven_day.utilization}%`);
    console.log(`  Resets at: ${usage.seven_day.resets_at}\n`);
  }

  if (usage.seven_day_opus) {
    console.log(`7-Day Opus Limit:`);
    console.log(`  Utilization: ${usage.seven_day_opus.utilization}%`);
    console.log(`  Resets at: ${usage.seven_day_opus.resets_at}\n`);
  }

  // Show status
  const maxUtil = Math.max(
    usage.five_hour?.utilization ?? 0,
    usage.seven_day?.utilization ?? 0,
    usage.seven_day_opus?.utilization ?? 0
  );

  if (maxUtil >= 90) {
    console.log('⚠️  CRITICAL: Approaching rate limits!');
  } else if (maxUtil >= 75) {
    console.log('⚠️  WARNING: High usage level');
  } else {
    console.log('✅ Usage level normal');
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
