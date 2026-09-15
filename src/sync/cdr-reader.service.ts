import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import { CdrRow, CSV_FIELDS } from './cdr.types';

@Injectable()
export class CdrReaderService {
  private readonly logger = new Logger(CdrReaderService.name);

  constructor(private readonly config: ConfigService) {}

  async readMaster(): Promise<CdrRow[]> {
    const filePath =
      this.config.get<string>('CDR_MASTER_PATH') ||
      '/var/log/asterisk/cdr-custom/Master.csv';

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      this.logger.warn(`CDR file not readable: ${filePath}`);
      return [];
    }

    const rows: CdrRow[] = [];

    await new Promise<void>((resolve, reject) => {
      const parser = fs.createReadStream(filePath).pipe(
        parse({
          columns: [...CSV_FIELDS],
          relax_column_count: true,
          skip_empty_lines: true,
          trim: true,
        }),
      );

      parser.on('data', (raw: Record<string, string>) => {
        if (!raw.uniqueid) {
          return;
        }
        rows.push({
          uniqueid: raw.uniqueid,
          sequence: raw.sequence || undefined,
          clid: raw.clid || undefined,
          src: raw.src || undefined,
          dst: raw.dst || undefined,
          dstf: raw.dstf || undefined,
          dcontext: raw.dcontext || undefined,
          channel: raw.channel || undefined,
          dstchannel: raw.dstchannel || undefined,
          lastapp: raw.lastapp || undefined,
          lastdata: raw.lastdata || undefined,
          start: raw.start || undefined,
          answer: raw.answer || undefined,
          end: raw.end || undefined,
          duration: this.toNumber(raw.duration),
          billsec: this.toNumber(raw.billsec),
          disposition: raw.disposition || undefined,
          amaflags: raw.amaflags || undefined,
          accountcode: raw.accountcode || undefined,
          userfield: raw.userfield || undefined,
        });
      });

      parser.on('error', reject);
      parser.on('end', () => resolve());
    });

    return rows;
  }

  private toNumber(value?: string): number | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
}
