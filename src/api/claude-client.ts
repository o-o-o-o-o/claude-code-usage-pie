import * as https from 'https';
import { ClaudeUsage } from '../types';

interface UsageResponse {
  usage?: ClaudeUsage;
  five_hour?: { utilization: number; resets_at: string | null };
  seven_day?: { utilization: number; resets_at: string | null };
  seven_day_opus?: { utilization: number; resets_at: string | null };
}

export class ClaudeClient {
  constructor(private readonly token: string, private readonly accountId?: string) {}

  async getUsage(): Promise<ClaudeUsage | null> {
    console.log('[ClaudeClient] Fetching usage from API...');
    const body = await this.request('https://api.anthropic.com/api/oauth/usage');
    console.log('[ClaudeClient] API response:', body);
    const parsed = JSON.parse(body) as UsageResponse;

    if (parsed.usage) {
      return parsed.usage;
    }

    if (parsed.five_hour || parsed.seven_day || parsed.seven_day_opus) {
      return {
        five_hour: parsed.five_hour,
        seven_day: parsed.seven_day,
        seven_day_opus: parsed.seven_day_opus
      };
    }

    console.warn('[ClaudeClient] No usage data found in response');
    return null;
  }

  private request(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'User-Agent': 'claude-code-usage-pie',
        'anthropic-beta': 'oauth-2025-04-20'
      };

      if (this.accountId) {
        headers['anthropic-account-id'] = this.accountId;
      }

      console.log('[ClaudeClient.request] Making request to', url, 'with headers:', Object.keys(headers));

      https
        .get(url, { headers }, (res) => {
          const chunks: Uint8Array[] = [];

          res.on('data', (chunk: Uint8Array) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            console.log('[ClaudeClient.request] Response status:', res.statusCode);
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              console.error('[ClaudeClient.request] Non-2xx status, body:', text.slice(0, 200));
              reject(new Error(`Usage API failed (${res.statusCode ?? 'unknown'}): ${text}`));
              return;
            }
            resolve(text);
          });
        })
        .on('error', (err) => {
          console.error('[ClaudeClient.request] Request error:', err.message);
          reject(err);
        });
    });
  }
}
