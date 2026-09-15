import { Controller, Post } from '@nestjs/common';
import { SyncSchedulerService } from './sync-scheduler.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncScheduler: SyncSchedulerService) {}

  /** Manual trigger for debugging */
  @Post('run')
  async run() {
    await this.syncScheduler.syncOnce();
    return { status: 'ok' };
  }
}
