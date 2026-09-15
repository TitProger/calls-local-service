import { Module } from '@nestjs/common';
import { CdrReaderService } from './cdr-reader.service';
import { SyncStateService } from './sync-state.service';
import { VpsClientService } from './vps-client.service';
import { RecordingFetcherService } from './recording-fetcher.service';
import { SyncSchedulerService } from './sync-scheduler.service';
import { SyncController } from './sync.controller';

@Module({
  controllers: [SyncController],
  providers: [
    CdrReaderService,
    SyncStateService,
    VpsClientService,
    RecordingFetcherService,
    SyncSchedulerService,
  ],
})
export class SyncModule {}
