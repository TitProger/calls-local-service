import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RecordingFetcherService {
  private readonly logger = new Logger(RecordingFetcherService.name);

  constructor(private readonly config: ConfigService) {}

  async fetch(userfield: string): Promise<Buffer | null> {
    const fromDisk = await this.tryDisk(userfield);
    if (fromDisk) {
      return fromDisk;
    }
    return this.tryHttp(userfield);
  }

  private async tryDisk(userfield: string): Promise<Buffer | null> {
    const dir = this.config.get<string>('RECORDINGS_DIR');
    if (!dir) {
      return null;
    }
    const filePath = path.join(dir, `${userfield}.mp3`);
    try {
      return await fs.promises.readFile(filePath);
    } catch {
      this.logger.debug(`Recording not on disk: ${filePath}`);
      return null;
    }
  }

  private async tryHttp(userfield: string): Promise<Buffer | null> {
    const base =
      this.config.get<string>('RECORDINGS_HTTP_BASE') ||
      'http://127.0.0.1:8082/ats/call';
    const url = `${base.replace(/\/$/, '')}/${userfield}.mp3`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Recording HTTP ${res.status}: ${url}`);
        return null;
      }
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      this.logger.warn(
        `Recording HTTP failed: ${url} (${(err as Error).message})`,
      );
      return null;
    }
  }
}
