import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface ClaudeConfig {
  defaultAccountId?: string;
  accounts?: Array<{ id: string }>;
}

export class AuthManager {
  private configPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.claude.json');
  }

  async getAccessToken(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-w',
        '-s',
        'Claude Code-credentials'
      ]);

      const raw = stdout.trim();
      if (!raw) {
        console.warn('[AuthManager] Keychain returned empty string');
        return null;
      }

      // Keychain payload can be JSON or a plain token depending on CLI versions.
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const candidates = [
          parsed.accessToken,
          parsed.access_token,
          (parsed.oauth as Record<string, unknown> | undefined)?.accessToken,
          (parsed.oauth as Record<string, unknown> | undefined)?.access_token,
          (parsed.credentials as Record<string, unknown> | undefined)?.accessToken,
          (parsed.credentials as Record<string, unknown> | undefined)?.access_token,
          (parsed.claudeAiOauth as Record<string, unknown> | undefined)?.accessToken,
          (parsed.claudeAiOauth as Record<string, unknown> | undefined)?.access_token
        ];

        const token = candidates.find((value) => typeof value === 'string' && value.length > 0);
        if (typeof token === 'string') {
          console.log('[AuthManager] Token found from JSON keychain');
          return token;
        }
        console.warn('[AuthManager] No token found in parsed JSON candidates');
        return null;
      } catch (parseErr) {
        console.log('[AuthManager] Keychain returned plain token (not JSON)');
        return raw;
      }
    } catch (err) {
      console.error('[AuthManager] Keychain lookup failed:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async getAccountId(): Promise<string | undefined> {
    try {
      const raw = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(raw) as ClaudeConfig;
      return config.defaultAccountId ?? config.accounts?.[0]?.id;
    } catch {
      return undefined;
    }
  }

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    const token = await this.getAccessToken();
    if (token) {
      return { available: true };
    }

    return {
      available: false,
      reason: 'Not authenticated. Run `claude` in a terminal to sign in first.'
    };
  }
}
