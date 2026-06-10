import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class KeychainClient {
  static async getClaudeAccessToken(): Promise<string | null> {
    if (process.platform !== 'darwin') {
      return null;
    }
    try {
      const { stdout } = await execFileAsync(
        'security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        { timeout: 10000 }
      );
      const creds = JSON.parse(stdout.trim()) as Record<string, unknown>;
      const oauth = creds.claudeAiOauth as Record<string, unknown> | undefined;
      if (!oauth?.accessToken) {
        return null;
      }
      const expiresAt = oauth.expiresAt as number | undefined;
      if (expiresAt && expiresAt < Date.now()) {
        return null;
      }
      return oauth.accessToken as string;
    } catch {
      return null;
    }
  }
}
