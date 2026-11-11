import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { CdrReaderService } from './cdr-reader.service';
import { SyncState, SyncStateService } from './sync-state.service';
import { VpsClientService } from './vps-client.service';
import { RecordingFetcherService } from './recording-fetcher.service';
import { CdrRow } from './cdr.types';

@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private running = false;
  private readonly intervalMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly cdrReader: CdrReaderService,
    private readonly syncState: SyncStateService,
    private readonly vpsClient: VpsClientService,
    private readonly recordingFetcher: RecordingFetcherService,
  ) {
    this.intervalMs = Number(this.config.get('SYNC_INTERVAL_MS')) || 30000;
  }

  @Interval(5000)
  async tick(): Promise<void> {
    // @Interval needs a static ms value; we self-throttle using last run + env interval.
    if (this.running) {
      return;
    }
    if (!this.shouldRun()) {
      return;
    }

    this.running = true;
    try {
      await this.syncOnce();
    } catch (err) {
      this.logger.error(`Sync failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
      this.markRun();
    }
  }

  private lastRunAt = 0;

  private shouldRun(): boolean {
    return Date.now() - this.lastRunAt >= this.intervalMs;
  }

  private markRun(): void {
    this.lastRunAt = Date.now();
  }

  async syncOnce(): Promise<void> {
    const state = await this.syncState.loadOrInit();
    await this.retryPending(state);

    const all = await this.cdrReader.readMaster();
    const batchSize = Number(this.config.get('BATCH_SIZE')) || 200;

    const fresh = all.filter((row) => this.isNewer(row, state));
    if (!fresh.length) {
      this.logger.debug('No new calls');
      return;
    }

    // Cursor moves only after the CDR batch is accepted by the VPS.
    // A failed mp3 stays in pendingRecordings and is retried later.
    for (let i = 0; i < fresh.length; i += batchSize) {
      const batch = fresh.slice(i, i + batchSize);
      await this.vpsClient.ingestCalls(batch);

      for (const row of batch) {
        if (!row.userfield) {
          continue;
        }
        const stored = await this.uploadRecording(row.userfield);
        if (!stored) {
          this.enqueuePending(state, row.userfield);
        }
      }

      this.advanceState(state, batch);
      await this.syncState.save(state);
      this.logger.log(`Synced batch of ${batch.length} calls`);
    }
  }

  private async retryPending(state: SyncState): Promise<void> {
    const pending = state.pendingRecordings || [];
    if (!pending.length) {
      return;
    }

    const still: SyncState['pendingRecordings'] = [];
    for (const item of pending) {
      const stored = await this.uploadRecording(item.userfield);
      if (stored) {
        this.logger.log(`Recording stored on retry: ${item.userfield}`);
        continue;
      }
      const attempts = item.attempts + 1;
      if (attempts >= 20) {
        this.logger.warn(
          `Stopped retrying recording ${item.userfield} after ${attempts} attempts`,
        );
        continue;
      }
      still.push({ userfield: item.userfield, attempts });
    }

    state.pendingRecordings = still;
    await this.syncState.save(state);
  }

  private async uploadRecording(userfield: string): Promise<boolean> {
    const buffer = await this.recordingFetcher.fetch(userfield);
    if (!buffer) {
      this.logger.warn(`No recording for userfield=${userfield}`);
      return false;
    }
    try {
      await this.vpsClient.ingestRecording(userfield, buffer);
      return true;
    } catch (err) {
      this.logger.warn(
        `Recording upload failed for ${userfield}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private enqueuePending(state: SyncState, userfield: string): void {
    if (!state.pendingRecordings) {
      state.pendingRecordings = [];
    }
    const exists = state.pendingRecordings.some(
      (item) => item.userfield === userfield,
    );
    if (exists) {
      return;
    }
    state.pendingRecordings.push({ userfield, attempts: 1 });
  }

  private isNewer(
    row: CdrRow,
    state: { lastStart: string; lastUniqueIds: string[] },
  ): boolean {
    if (!row.start) {
      return false;
    }
    if (row.start > state.lastStart) {
      return true;
    }
    if (row.start === state.lastStart) {
      return !state.lastUniqueIds.includes(row.uniqueid);
    }
    return false;
  }

  private advanceState(
    state: { lastStart: string; lastUniqueIds: string[] },
    batch: CdrRow[],
  ): void {
    let maxStart = state.lastStart;
    for (const row of batch) {
      if (row.start && row.start > maxStart) {
        maxStart = row.start;
      }
    }

    const idsAtMax = batch
      .filter((r) => r.start === maxStart)
      .map((r) => r.uniqueid);

    if (maxStart === state.lastStart) {
      state.lastUniqueIds = Array.from(
        new Set([...state.lastUniqueIds, ...idsAtMax]),
      );
    } else {
      state.lastStart = maxStart;
      state.lastUniqueIds = idsAtMax;
    }
  }
}
