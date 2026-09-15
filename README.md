# calls-local-service (office / ATS)

NestJS worker that polls Asterisk `Master.csv`, sends **only new** CDR rows to VPS `calls-leads-service`, and uploads mp3 recordings.

## Requirements

- Node.js **>= 18**
- Runs on the ATS host (or any host that can read `Master.csv` and reach recordings + VPS)

## Setup

```bash
cd E:\DailyCar\backend\calls-local-service
cp .env.example .env
# set VPS_BASE_URL, API_TOKEN (same as VPS), CDR_MASTER_PATH
npm install
npm run start:dev
```

On first start the service writes `data/sync-state.json` with `lastStart = now`.
Older archive calls are **not** uploaded.

## Env

| Variable | Meaning |
|----------|---------|
| `VPS_BASE_URL` | e.g. `https://your-vps` |
| `API_TOKEN` | same Bearer token as VPS |
| `CDR_MASTER_PATH` | `/var/log/asterisk/cdr-custom/Master.csv` |
| `RECORDINGS_DIR` | optional local folder with `{userfield}.mp3` |
| `RECORDINGS_HTTP_BASE` | fallback, default `http://127.0.0.1:8082/ats/call` |
| `SYNC_INTERVAL_MS` | poll interval, default `30000` |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | liveness |
| POST | `/sync/run` | force one sync cycle |

## Notes

- Prefer filling `RECORDINGS_DIR` once the disk path on ATS is known.
- Until then HTTP `:8082` is used.
- If VPS is down, the cursor is not advanced for the failed batch (retry next tick).
