import { spawn } from 'child_process';
import { ClaudeUsage, UsageWindow } from '../types';

/**
 * Shells out to `sd llm claudeUsage` (the Scripts repo's own reader) instead
 * of parsing `~/.claude/projects/**\/*.jsonl` a second time. That second
 * reader (jsonl-usage-reader.ts, deleted) drifted from claudeUsage's own
 * dedup logic and biased its inferred session start late; deleting it removes
 * the whole class of bug rather than re-fixing it here.
 *
 * `sd` is a zsh *function* (see `type sd`), not a PATH executable — it
 * resolves `SD_ROOT` and execs the target script. A non-interactive child
 * process therefore cannot find it via a plain PATH lookup; it only exists
 * once `.zshrc` has been sourced, hence `zsh -ic`.
 *
 * Flags, and why each one:
 *   --json           machine-readable
 *   --live           the whole point: server-reported utilization. Percentages
 *                    are only ever read from here, never computed from tokens
 *                    against a limit — see "no estimates" below.
 *   --no-week        the 7-day *token* section is unused now that percentages
 *                    come from --live, and skipping it also skips claudeUsage's
 *                    `agentsview` cost fetch (60s worst case) that this
 *                    extension never reads. live.week survives --no-week.
 *   --no-calibrate   claudeUsage derives an account limit from --live samples,
 *                    which only works if they are spread across utilization
 *                    levels. Polling on a timer would flood that store with
 *                    near-identical rows and suppress the limit. Read, do not
 *                    contribute.
 *
 * No estimates. Earlier revisions fell back to `tokens / configured_limit`
 * when live was unavailable. That was wrong twice over: the limits were
 * calibrated against a cache-read-weighted total but divided into a raw one
 * (~7-8x inflation, clamping everything to 100%), and a hardcoded limit is
 * silently wrong during an account boost anyway. A window with no live figure
 * is now simply absent, and the UI says so, because a confident wrong
 * percentage is worse than no percentage.
 */

// -- Shapes consumed from claudeUsage. Only the fields this extension reads
// are typed; the real payload carries more. Everything is optional and
// checked at runtime: this is another program's JSON, and a shape change
// must degrade to an error, never throw into the polling loop.

interface ClaudeUsageLiveWindow {
  utilization_pct?: unknown;
  resets_at?: unknown;
}

export interface ClaudeUsagePayload {
  five_hour?: { resets_at?: unknown } | null;
  live?: {
    session?: ClaudeUsageLiveWindow | null;
    session_error?: unknown;
    week?: ClaudeUsageLiveWindow | null;
    week_error?: unknown;
  } | null;
  live_error?: unknown;
}

export interface ClaudeUsageResult {
  payload: ClaudeUsagePayload | null;
  error: string | null;
}

// An interactive zsh is not a clean pipe. macOS Terminal's session support
// (/etc/zshrc_Apple_Terminal) writes "Restored session: ..." and an OSC 7
// escape to *stdout* before anything the command prints, and any user rc file
// may add more. SHELL_SESSIONS_DISABLE silences that particular source; the
// markers below make the payload recoverable regardless of what else decides
// to print, and carry the real exit status past the trailing `print`.
const BEGIN = '__CCUP_BEGIN__';
const END = '__CCUP_END__';
const COMMAND =
  `print -r -- '${BEGIN}'; ` +
  'sd llm claudeUsage --json --live --no-week --no-calibrate; ' +
  `__ccup_rc=$?; print -r -- "${END}:$__ccup_rc"`;

/** The framed payload and the command's own exit code, or null if unframed. */
function unframe(stdout: string): { body: string; code: number } | null {
  const start = stdout.indexOf(BEGIN);
  const end = stdout.lastIndexOf(END);
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  const body = stdout.slice(start + BEGIN.length, end);
  const tail = stdout.slice(end + END.length);
  const code = Number.parseInt(tail.replace(/^:/, '').trim(), 10);
  return { body, code: Number.isFinite(code) ? code : 0 };
}

export class ClaudeUsageReader {
  private static readonly SHELL = '/bin/zsh';
  // The only child work left under --no-week is claudeUsage's `claude -p
  // "/usage"` round trip, whose own ceiling is 30s (LIVE_TIMEOUT); observed
  // 0.2-1.8s. 60s clears that with room, without hanging the extension host.
  private static readonly TIMEOUT_MS = 60_000;
  private static readonly MAX_OUTPUT = 10 * 1024 * 1024;

  static async readUsage(): Promise<ClaudeUsageResult> {
    const { stdout, stderr, error } = await this.run();
    if (error) {
      return { payload: null, error };
    }

    const framed = unframe(stdout);
    if (!framed) {
      return { payload: null, error: 'sd llm claudeUsage produced no recognisable output' };
    }
    if (framed.code !== 0) {
      if (/command not found: sd/.test(stderr) || /command not found: sd/.test(framed.body)) {
        return { payload: null, error: 'sd not found — check PATH/SD_ROOT' };
      }
      // stderr's last line is the useful part; anything above it is noise
      // from sourcing .zshrc interactively.
      return {
        payload: null,
        error: `sd llm claudeUsage exited ${framed.code}: ${lastLine(stderr) ?? 'no output'}`
      };
    }

    try {
      return { payload: JSON.parse(framed.body) as ClaudeUsagePayload, error: null };
    } catch {
      return { payload: null, error: 'sd llm claudeUsage returned invalid JSON' };
    }
  }

  /**
   * Runs the command in its own process group so a timeout can kill the
   * whole tree. Killing the `zsh` alone would leave its python/`claude`
   * grandchildren running, and each poll would add another orphan.
   */
  private static run(): Promise<{ stdout: string; stderr: string; error: string | null }> {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(this.SHELL, ['-ic', COMMAND], {
          detached: true,
          env: { ...process.env, SHELL_SESSIONS_DISABLE: '1' }
        });
      } catch (err) {
        resolve({ stdout: '', stderr: '', error: `zsh could not be started: ${describe(err)}` });
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      let truncated = false;

      const finish = (error: string | null) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, error });
      };

      const timer = setTimeout(() => {
        try {
          // Negative pid targets the group, not just the shell.
          process.kill(-(child.pid as number), 'SIGKILL');
        } catch {
          // Already gone; nothing to clean up.
        }
        finish(`sd llm claudeUsage timed out after ${this.TIMEOUT_MS / 1000}s`);
      }, this.TIMEOUT_MS);

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length > this.MAX_OUTPUT) {
          truncated = true;
          return;
        }
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length <= this.MAX_OUTPUT) {
          stderr += chunk.toString();
        }
      });

      child.on('error', (err) => {
        finish(
          (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'zsh not found — cannot invoke sd'
            : `sd llm claudeUsage failed: ${describe(err)}`
        );
      });

      // The shell's own exit status is the trailing `print`'s, not the
      // command's — the real one travels inside the END marker. Anything
      // that went wrong is diagnosed from the framed output in readUsage.
      child.on('close', () => {
        finish(truncated ? 'sd llm claudeUsage returned more output than expected' : null);
      });
    });
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function lastLine(text: string): string | null {
  return text.trim().split('\n').filter(Boolean).pop() ?? null;
}

// -- Mapping: claudeUsage's payload -> this extension's ClaudeUsage.
//
// Resolution order is API (handled by the caller before this is ever
// invoked) → claudeUsage --live. There is no third tier; see "no estimates"
// above.

function toPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toIso(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function liveWindow(window: ClaudeUsageLiveWindow | null | undefined): UsageWindow | undefined {
  const utilization = toPercent(window?.utilization_pct);
  if (utilization === null) {
    return undefined;
  }
  return { utilization, resets_at: toIso(window?.resets_at) };
}

export function buildUsageFromPayload(payload: ClaudeUsagePayload): ClaudeUsage {
  const usage: ClaudeUsage = {};

  const fiveHour = liveWindow(payload?.live?.session);
  if (fiveHour) {
    // The JSONL-derived reset is preferred over live's own: claudeUsage
    // reports it confirmed to the minute against both `/usage` and the
    // claude.ai page, and it carries seconds where live's prose does not.
    // Falls back to live's when no local block is open — which does happen,
    // e.g. a window opened by another machine or by claude.ai.
    usage.five_hour = {
      ...fiveHour,
      resets_at: toIso(payload?.five_hour?.resets_at) ?? fiveHour.resets_at
    };
  }

  const week = liveWindow(payload?.live?.week);
  if (week) {
    usage.seven_day = week;
  }

  // No seven_day_opus: claudeUsage's /usage parser only captures the first
  // "Current week" line ("all models" on this account's plan), so there is no
  // live per-model figure to report. It is populated only when the Anthropic
  // API tier answers. Estimating it from tokens is what produced a permanent
  // false 100% and a warning every 30 minutes.

  return usage;
}

/**
 * Why a payload produced no windows at all, for the status bar. claudeUsage
 * exits 0 when `--live` fails — the failure is carried in the payload, not
 * the exit code — so this is the only place that distinguishes "ran fine,
 * told us nothing" from "did not run".
 */
export function describeEmptyPayload(payload: ClaudeUsagePayload): string {
  const reasons = [payload?.live_error, payload?.live?.session_error, payload?.live?.week_error]
    .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0);
  return reasons.length
    ? `no live usage: ${reasons[0]}`
    : 'no live usage reported by claude -p /usage';
}
