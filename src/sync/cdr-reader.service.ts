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
    const httpBase = (this.config.get<string>('CDR_HTTP_BASE') || '').trim();
    if (httpBase) {
      return this.readFromHttp(httpBase);
    }
    return this.readFromFile();
  }

  private async readFromHttp(base: string): Promise<CdrRow[]> {
    const root = base.replace(/\/$/, '');
    const files = [this.yesterdayFileName(), 'Master.csv'];
    const byId = new Map<string, CdrRow>();

    for (const file of files) {
      const url = `${root}/cdr/${encodeURIComponent(file)}`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) {
          this.logger.warn(`CDR HTTP ${res.status}: ${url}`);
          continue;
        }
        const body = (await res.json()) as { cdr?: unknown };
        const list = Array.isArray(body?.cdr) ? body.cdr : [];
        let added = 0;
        for (const item of list) {
          if (!item || typeof item !== 'object') {
            continue;
          }
          const row = this.mapRow(item as Record<string, unknown>);
          if (!row) {
            continue;
          }
          byId.set(row.uniqueid, row);
          added += 1;
        }
        this.logger.log(`CDR HTTP ${file}: ${added} rows`);
      } catch (err) {
        this.logger.warn(`CDR HTTP failed: ${url} (${(err as Error).message})`);
      }
    }

    return [...byId.values()];
  }

  private yesterdayFileName(now = new Date()): string {
    const day = new Date(now.getTime());
    day.setDate(day.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `cdr-${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}.csv`;
  }

  private async readFromFile(): Promise<CdrRow[]> {
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
        const row = this.mapRow(raw);
        if (row) {
          rows.push(row);
        }
      });

      parser.on('error', reject);
      parser.on('end', () => resolve());
    });

    return rows;
  }

  private mapRow(raw: Record<string, unknown>): CdrRow | null {
    const uniqueid = this.text(raw.uniqueid);
    if (!uniqueid) {
      return null;
    }
    return {
      uniqueid,
      sequence: this.text(raw.sequence),
      clid: this.text(raw.clid),
      src: this.text(raw.src),
      dst: this.text(raw.dst),
      dstf: this.text(raw.dstf),
      dcontext: this.text(raw.dcontext),
      channel: this.text(raw.channel),
      dstchannel: this.text(raw.dstchannel),
      lastapp: this.text(raw.lastapp),
      lastdata: this.text(raw.lastdata),
      start: this.text(raw.start),
      answer: this.text(raw.answer),
      end: this.text(raw.end),
      duration: this.toNumber(raw.duration),
      billsec: this.toNumber(raw.billsec),
      disposition: this.text(raw.disposition),
      amaflags: this.text(raw.amaflags),
      accountcode: this.text(raw.accountcode),
      userfield: this.text(raw.userfield),
    };
  }

  private text(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const text = String(value).trim();
    return text || undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
}
