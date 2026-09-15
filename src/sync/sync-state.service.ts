import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface SyncState {
  /** ISO-like datetime string comparable with CDR start field "YYYY-MM-DD HH:mm:ss" */
  lastStart: string;
  lastUniqueIds: string[];
  initializedAt: string;
}

@Injectable()
export class SyncStateService {
  private readonly logger = new Logger(SyncStateService.name);
  private readonly statePath: string;

  constructor(private readonly config: ConfigService) {
    this.statePath =
      this.config.get<string>('SYNC_STATE_PATH') || './data/sync-state.json';
  }

  async loadOrInit(): Promise<SyncState> {
    try {
      const raw = await fs.promises.readFile(this.statePath, 'utf8');
      return JSON.parse(raw) as SyncState;
    } catch {
      const now = this.formatNow();
      const state: SyncState = {
        lastStart: now,
        lastUniqueIds: [],
        initializedAt: new Date().toISOString(),
      };
      await this.save(state);
      this.logger.log(
        `Sync state initialized at ${now} (only newer calls will be sent)`,
      );
      return state;
    }
  }

  async save(state: SyncState): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.promises.writeFile(
      this.statePath,
      JSON.stringify(state, null, 2),
      'utf8',
    );
  }

  /** Format comparable with Asterisk CDR start column */
  formatNow(date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  }
}
