import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { CdrReaderService } from './cdr-reader.service';
import { SyncStateService } from './sync-state.service';
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
    const all = await this.cdrReader.readMaster();
    const batchSize = Number(this.config.get('BATCH_SIZE')) || 200;

    const fresh = all.filter((row) => this.isNewer(row, state));
    if (!fresh.length) {
      this.logger.debug('No new calls');
      return;
    }

    // Process in batches; advance cursor only after successful full batch handling
    for (let i = 0; i < fresh.length; i += batchSize) {
      const batch = fresh.slice(i, i + batchSize);
      await this.vpsClient.ingestCalls(batch);

      for (const row of batch) {
        if (!row.userfield) {
          continue;
        }
        const buffer = await this.recordingFetcher.fetch(row.userfield);
        if (!buffer) {
          this.logger.warn(`No recording for userfield=${row.userfield}`);
          continue;
        }
        try {
          await this.vpsClient.ingestRecording(row.userfield, buffer);
        } catch (err) {
          this.logger.warn(
            `Recording upload failed for ${row.userfield}: ${(err as Error).message}`,
          );
        }
      }

      this.advanceState(state, batch);
      await this.syncState.save(state);
      this.logger.log(`Synced batch of ${batch.length} calls`);
    }
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
