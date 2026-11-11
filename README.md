# calls-local-service (office / ATS)

NestJS worker that polls Asterisk CDR, sends **only new** rows to VPS `calls-leads-service`, and uploads mp3 recordings.

On the office PC it reads CDR and mp3 over HTTP from the ATS (`CDR_HTTP_BASE`, `RECORDINGS_HTTP_BASE`). On the ATS host itself, leave `CDR_HTTP_BASE` empty and it reads `Master.csv` from disk.

## Requirements

- Node.js **>= 18**
- A host that can reach the ATS HTTP API and the VPS

## Setup

```bash
cd E:\DailyCar\backend\calls-local-service
cp .env.example .env
# set VPS_BASE_URL and the same API_TOKEN as on the VPS
npm install
npm run build
npm run start:prod
```

On first start the service writes `data/sync-state.json` with `lastStart = now`.
Older archive calls are **not** uploaded.

## Env

| Variable | Meaning |
|----------|---------|
| `VPS_BASE_URL` | e.g. `http://94.26.228.132/calls-api` |
| `API_TOKEN` | same Bearer token as VPS |
| `CDR_HTTP_BASE` | ATS CDR API, e.g. `http://192.168.89.232:8083`. Empty = read the file |
| `CDR_MASTER_PATH` | used only when `CDR_HTTP_BASE` is empty |
| `RECORDINGS_DIR` | optional local folder with `{userfield}.mp3` |
| `RECORDINGS_HTTP_BASE` | e.g. `http://192.168.89.232:8082/ats/call` |
| `SYNC_INTERVAL_MS` | poll interval, default `30000` |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | liveness |
| POST | `/sync/run` | force one sync cycle |

## Notes

- If the VPS rejects a CDR batch, the cursor is not advanced (the batch is retried).
- A failed mp3 is kept in `data/sync-state.json` and retried. After 20 failures it is dropped.
- The same `uniqueid` is upserted. The same `userfield` overwrites one mp3 path.
