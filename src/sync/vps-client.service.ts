import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CdrRow } from './cdr.types';

@Injectable()
export class VpsClientService {
  private readonly logger = new Logger(VpsClientService.name);

  constructor(private readonly config: ConfigService) {}

  async ingestCalls(calls: CdrRow[]): Promise<void> {
    if (!calls.length) {
      return;
    }

    const res = await this.request('/ingest/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'ats-local', calls }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ingest/calls failed ${res.status}: ${text}`);
    }

    this.logger.log(`Ingested ${calls.length} calls`);
  }

  async ingestRecording(userfield: string, buffer: Buffer): Promise<void> {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: 'audio/mpeg' });
    form.append('file', blob, `${userfield}.mp3`);

    const res = await this.request(
      `/ingest/recordings/${encodeURIComponent(userfield)}`,
      {
        method: 'POST',
        body: form,
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `ingest/recordings/${userfield} failed ${res.status}: ${text}`,
      );
    }
  }

  private async request(
    pathname: string,
    init: RequestInit,
  ): Promise<Response> {
    const url = `${this.baseUrl()}${pathname}`;
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${this.token()}`);
    return fetch(url, { ...init, headers });
  }

  private baseUrl(): string {
    return (
      this.config.get<string>('VPS_BASE_URL') || 'http://127.0.0.1:3100'
    ).replace(/\/$/, '');
  }

  private token(): string {
    return this.config.get<string>('API_TOKEN') || '';
  }
}
