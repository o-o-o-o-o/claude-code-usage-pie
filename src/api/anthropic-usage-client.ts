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

  private static readonly WINDOW_KEYS: (keyof ApiResponse)[] = [
    'five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'
  ];

  private static parseResponse(json: ApiResponse): ClaudeUsage | null {
    const usage: ClaudeUsage = {};
    for (const key of this.WINDOW_KEYS) {
      const window = json[key];
      if (window) {
        usage[key] = this.toWindow(window);
      }
    }
    return Object.keys(usage).length > 0 ? usage : null;
  }
}
