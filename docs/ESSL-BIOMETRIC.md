# ESSL / ZKTeco biometric integration

This HRMS can pull attendance punches from an **eSSL** or **ZKTeco** device on your office LAN and store them in PostgreSQL (`attendancelogs`). Raw device punches are also kept in `essl_device_logs` for review in the admin UI.

---

## How it works

```
┌─────────────────┐     TCP/UDP :4370      ┌──────────────────┐
│  ESSL / ZKTeco  │ ◄────────────────────► │  Node.js server  │
│  192.168.x.x    │                        │  (zklib-js)      │
└─────────────────┘                        └────────┬─────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    ▼                               ▼                               ▼
           essl_device_logs              attendancelogs (daily)            Admin → Biometric UI
           (every punch)                 (in / out / hours / status)      (list + import)
```

| Step | What happens |
|------|----------------|
| **Sync device now** | Reads punches from the device → saves to `essl_device_logs` → imports matched rows into `attendancelogs` |
| **Import to attendance DB** | Imports matched punches from `essl_device_logs` that are not yet marked imported |
| **Background poll** | While `npm start` runs locally, sync repeats every `ESSL_POLL_INTERVAL_MS` |

**Employee matching:** device user ID is matched to HRMS `employeecode` first, then `name` (case-insensitive).

---

## Hosting: local laptop vs Vercel

| Where the API runs | Can it talk to `192.168.0.254`? | What to use |
|--------------------|----------------------------------|-------------|
| **Your laptop** (`npm start`) on office Wi‑Fi | Yes | Direct sync (`ESSL_ENABLED=true`) — **recommended for setup** |
| **Vercel** (cloud) | No — private LAN IPs are not reachable | **Office bridge** (`npm run essl:bridge`) on a PC in the office |

Vercel disables background ESSL jobs automatically (`VERCEL` env is set). The website can stay on Vercel; only the **sync process** must run on the LAN.

---

## Quick start (local development)

### 1. Network check (PowerShell, on office Wi‑Fi)

```powershell
ping 192.168.0.254
Test-NetConnection 192.168.0.254 -Port 4370
```

`TcpTestSucceeded : True` is required.

### 2. Configure `.env`

Copy from `.env.example` and set at least:

```env
DATABASE_URL=postgresql://...
ESSL_ENABLED=true
ESSL_DEVICE_IP=192.168.0.254
ESSL_DEVICE_PORT=4370
ESSL_DEVICE_TIMEOUT_MS=30000
ESSL_INPORT=4000
ESSL_POLL_INTERVAL_MS=300000
ESSL_LOOKBACK_DAYS=14
ESSL_DAY_START=09:30
ESSL_DAY_END=23:59
```

### 3. Install and patch SDK

```bash
npm install
npm run postinstall
```

(`postinstall` patches `zklib-js` so empty device replies do not crash Node.)

### 4. Test device read

```bash
npm run essl:test
```

Success looks like: `Attendance logs fetched: N` with `N > 0`.

### 5. Run server

```bash
npm start
```

Open **http://localhost:3000/admin/dashboard** → **Biometric**.

### 6. One-shot sync to database

```bash
npm run essl:sync
```

---

## Admin UI (Biometric section)

1. Set **From** / **To** dates.
2. **Sync device now** — pull from device (local server + office network only).
3. **Refresh list** — show punches already in `essl_device_logs`.
4. **Import to attendance DB** — write matched, not-yet-imported punches into `attendancelogs` (visible under **Attendance → Daily attendance**).

Filters:

- **Employee match** — all / matched / unmatched  
- **In attendance DB** — all / not imported / already imported  

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ESSL_ENABLED` | `false` | Enable background polling on local server |
| `ESSL_DEVICE_IP` | — | Device IP (e.g. `192.168.0.254`) |
| `ESSL_DEVICE_PORT` | `4370` | Device port |
| `ESSL_DEVICE_TIMEOUT_MS` | `30000` | Connection/read timeout (ms) |
| `ESSL_INPORT` | `4000` | UDP in-port for zklib-js |
| `ESSL_POLL_INTERVAL_MS` | `300000` | Background poll interval (5 min). Use `7200000` for 2 hours |
| `ESSL_LOOKBACK_DAYS` | `14` | How many past days to process per sync |
| `ESSL_DAY_START` | `09:30` | Ignore punches before this time |
| `ESSL_DAY_END` | `23:59` | Ignore punches after this time |
| `ESSL_PREFER_UDP` | `false` | Try UDP before/alongside TCP if TCP fails |
| `ESSL_DISABLE_DEVICE` | `false` | Call `disableDevice()` before reading logs (some models need this) |
| `BIOMETRIC_API_KEY` | — | API key for bridge / manual punch API |
| `HRMS_API_URL` | — | Vercel app URL (bridge mode only) |
| `ESSL_BRIDGE_MODE` | `remote` | `remote` = push to cloud API; `local` = write to local `DATABASE_URL` |

---

## NPM scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start API + ESSL background poll (local only) |
| `npm run essl:test` | Test connection and fetch attendance count |
| `npm run essl:sync` | One-shot device → database sync |
| `npm run essl:bridge` | Office PC agent for Vercel (see below) |
| `npm run postinstall` | Apply `zklib-js` patches |

---

## Vercel + office bridge

On an **always-on office PC** (same LAN as the device):

**.env on office PC**

```env
ESSL_ENABLED=true
ESSL_DEVICE_IP=192.168.0.254
ESSL_DEVICE_PORT=4370
ESSL_DEVICE_TIMEOUT_MS=30000
ESSL_POLL_INTERVAL_MS=300000
HRMS_API_URL=https://your-app.vercel.app
BIOMETRIC_API_KEY=same_secret_as_vercel
ESSL_BRIDGE_MODE=remote
```

Bridge scripts now auto-load `.env.bridge` when present.  
So on office PC you can keep your main `.env` untouched and create a dedicated `.env.bridge`.

Optional override:

```bash
ENV_FILE=.env.bridge npm run essl:bridge
```

**Vercel environment variables**

- `DATABASE_URL`
- `BIOMETRIC_API_KEY` (same as bridge)
- `ESSL_DAY_START`, `ESSL_DAY_END`, `ESSL_LOOKBACK_DAYS`

Run:

```bash
npm run essl:bridge
```

The bridge POSTs to `POST /api/biometric/essl-sync` with header `x-api-key`.

---

## API endpoints (admin / integration)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/admin/attendance/essl-sync` | Admin JWT | Pull from device (server must be on LAN) |
| `GET` | `/api/admin/attendance/essl-logs?from=&to=` | Admin JWT | List stored device punches |
| `POST` | `/api/admin/attendance/essl-import` | Admin JWT | JSON body: `{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }` |
| `POST` | `/api/biometric/essl-sync` | `x-api-key` | Bridge pushes raw `records[]` |
| `POST` | `/api/biometric/punch` | `x-api-key` | Manual in/out punch for testing |

---

## Device menu settings (important)

If you see **TCP connects** (`ok tcp`) but sync fails with **empty response**:

1. **Comm → PC connection** — enabled  
2. **Comm password** — disabled (or document the password; zklib-js does not send it by default)  
3. **IP / port** — matches `.env` (`4370`)  
4. Test with **ZKTime** or **eSSL desktop** — if desktop cannot download logs, fix the device first  

Optional `.env` retries:

```env
ESSL_PREFER_UDP=true
ESSL_DEVICE_TIMEOUT_MS=60000
```

---

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `TcpTestSucceeded : False` | Wrong network or firewall | Join office Wi‑Fi; check device IP |
| `ok tcp` then empty response | Comm password / firmware / protocol | Device menu above; try `ESSL_PREFER_UDP=true` |
| `Valid from and to dates required` on import | Missing JSON header (fixed in UI) | Hard-refresh admin page (Ctrl+F5) |
| Sync works locally, not on Vercel | Cloud cannot reach LAN | Use `essl:bridge` on office PC |
| Punches listed but not in attendance | Unmatched employee | Align device user ID with `employeecode` or name in HRMS |
| `Promise Rejected` in terminal | Old zklib behavior | Run `npm run postinstall` and restart server |

---

## Database tables

**`essl_device_logs`** — one row per device punch  

- `device_user_id`, `employeecode`, `record_time`, `matched`, `imported_at`

**`attendancelogs`** — one row per employee per day  

- `punchin`, `punchout`, `totalhours`, `status` (used by daily attendance and reports)

---

## Related files

| File | Purpose |
|------|---------|
| `server/utils/zkDeviceClient.js` | Device connection (TCP/UDP) |
| `server/utils/deviceAttendance.js` | Normalize, match, import punches |
| `server/jobs/esslAttendanceSync.js` | Background polling |
| `server/scripts/essl-test.js` | Connection test |
| `server/scripts/essl-sync-once.js` | Manual one-shot sync |
| `server/scripts/essl-bridge.js` | Office → Vercel agent |
| `server/scripts/patch-zklib.js` | SDK safety patches |
| `public/admin-dashboard.html` | Biometric UI |

---

## Security notes

- Do not commit `.env` (contains `DATABASE_URL`, `BIOMETRIC_API_KEY`).
- Do not port-forward `4370` to the public internet.
- Rotate `BIOMETRIC_API_KEY` if it is ever exposed.

---

## Support checklist

Before asking for help, provide:

1. Output of `npm run essl:test`  
2. Output of `Test-NetConnection <IP> -Port 4370`  
3. Device brand/model and whether ZKTime desktop can download logs  
4. Whether you run `npm start` locally or only on Vercel  
