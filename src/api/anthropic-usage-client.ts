import * as https from 'https';
import { ClaudeUsage, UsageWindow } from '../types';

interface ApiWindow {
  utilization: number;
  resets_at?: string;
}

interface ApiResponse {
  five_hour?: ApiWindow;
  seven_day?: ApiWindow;
  seven_day_opus?: ApiWindow;
  seven_day_sonnet?: ApiWindow;
}

export class AnthropicUsageClient {
  private static readonly USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

  static async fetchUsage(accessToken: string): Promise<ClaudeUsage | null> {
    return new Promise((resolve) => {
      const req = https.request(
        this.USAGE_URL,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'anthropic-beta': 'oauth-2025-04-20',
          },
          timeout: 15000,
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            resolve(null);
            return;
          }
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            try {
              resolve(this.parseResponse(JSON.parse(data) as ApiResponse));
            } catch {
              resolve(null);
            }
          });
          res.on('error', () => resolve(null));
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });
  }

  private static toWindow(w: ApiWindow): UsageWindow {
    return { utilization: w.utilization, resets_at: w.resets_at ?? null };
  }

  private static parseResponse(json: ApiResponse): ClaudeUsage | null {
    const usage: ClaudeUsage = {};
    if (json.five_hour) { usage.five_hour = this.toWindow(json.five_hour); }
    if (json.seven_day) { usage.seven_day = this.toWindow(json.seven_day); }
    if (json.seven_day_opus) { usage.seven_day_opus = this.toWindow(json.seven_day_opus); }
    if (json.seven_day_sonnet) { usage.seven_day_sonnet = this.toWindow(json.seven_day_sonnet); }
    return Object.keys(usage).length > 0 ? usage : null;
  }
}
