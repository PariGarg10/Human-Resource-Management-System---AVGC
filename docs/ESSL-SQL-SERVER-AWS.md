# eSSL SQL Server → AWS HRMS (no office PC)

Pull attendance from **eSSL / ZKTeco SQL Server** (`CHECKINOUT` + `USERINFO`) directly into **AWS PostgreSQL** on a schedule. The sync job runs on **Elastic Beanstalk** with your Node app — no office PC bridge required.

---

## Architecture

```
┌─────────────────────┐         VPN / private link          ┌─────────────────────────┐
│ Office SQL Server   │ ◄────────────────────────────────── │ AWS Elastic Beanstalk   │
│ CHECKINOUT/USERINFO │                                     │ esslSqlServerSync job   │
└─────────────────────┘                                     └───────────┬─────────────┘
                                                                        │
                                                                        ▼
                                                            ┌─────────────────────────┐
                                                            │ RDS PostgreSQL          │
                                                            │ essl_device_logs        │
                                                            │ attendancelogs          │
                                                            └─────────────────────────┘
```

**Critical:** AWS must be able to reach SQL Server on **TCP 1433** (or your port). Options:

| Setup | Notes |
|--------|--------|
| **Site-to-site VPN** | Office firewall ↔ AWS VPC (recommended) |
| **SQL Server on AWS EC2** | Same VPC as EB — simplest cloud setup |
| **Azure / hosted SQL** | Allow EB outbound IPs in firewall |
| **Public SQL + IP whitelist** | Not ideal; EB IPs can change unless you use NAT Gateway with static EIP |

Without network access, sync will fail with connection timeout errors.

---

## Step 1 — SQL Server read-only user

On SQL Server Management Studio:

```sql
CREATE LOGIN hrms_sync WITH PASSWORD = 'StrongPasswordHere';
USE YourEsslDatabase;
CREATE USER hrms_sync FOR LOGIN hrms_sync;
GRANT SELECT ON CHECKINOUT TO hrms_sync;
GRANT SELECT ON USERINFO TO hrms_sync;
```

Confirm tables exist:

```sql
SELECT TOP 5 u.Badgenumber, c.CheckTime
FROM CHECKINOUT c
JOIN USERINFO u ON c.UserId = u.UserId
ORDER BY c.CheckTime DESC;
```

---

## Step 2 — AWS Elastic Beanstalk environment variables

EB → **Configuration → Software → Environment properties**:

```env
ESSL_SQL_ENABLED=true
ESSL_SQL_SERVER=10.0.1.50
ESSL_SQL_PORT=1433
ESSL_SQL_DATABASE=YourEsslDatabase
ESSL_SQL_USER=hrms_sync
ESSL_SQL_PASSWORD=StrongPasswordHere
ESSL_SQL_ENCRYPT=true
ESSL_SQL_TRUST_CERT=true
ESSL_SQL_POLL_INTERVAL_MS=300000
ESSL_SQL_LOOKBACK_DAYS=14
ESSL_DAY_START=09:30
ESSL_DAY_END=23:59
```

Turn **off** device LAN sync (not needed):

```env
ESSL_ENABLED=false
```

Optional — if table/column names differ:

```env
ESSL_SQL_CHECKINOUT_TABLE=CHECKINOUT
ESSL_SQL_USERINFO_TABLE=USERINFO
ESSL_SQL_USER_ID_COLUMN=UserId
ESSL_SQL_CHECK_TIME_COLUMN=CheckTime
ESSL_SQL_BADGE_COLUMN=Badgenumber
ESSL_SQL_NAME_COLUMN=Name
```

---

## Step 3 — Deploy

```bash
npm install
npm run build:dashboard
eb deploy
```

On startup, logs should show:

```text
[ESSL-SQL] SQL Server attendance sync enabled every 300000ms
```

---

## Step 4 — Test connection (SSH to EB or local with VPN)

```bash
npm run essl:sql:test
```

Success: prints latest `Badgenumber` + `CheckTime`.

One-shot sync:

```bash
npm run essl:sql-sync
```

---

## Step 5 — Admin UI

**Admin → Biometric → Sync SQL Server now**

- Pulls new punches since last cursor (stored in `essl_sql_sync_state`)
- First run imports last **14 days** (`ESSL_SQL_LOOKBACK_DAYS`)
- **Refresh list** — view punches in `essl_device_logs`
- **Import to attendance DB** — if any matched rows are still pending

---

## Employee matching

`USERINFO.Badgenumber` must match HRMS **`employees.employeecode`** (e.g. `1001`, `EMP001`).

---

## NPM scripts

| Command | Description |
|---------|-------------|
| `npm run essl:sql:test` | Test SQL connection + sample row |
| `npm run essl:sql-sync` | One-shot sync |
| Background on EB | Automatic when `ESSL_SQL_ENABLED=true` |

---

## API (admin JWT)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/attendance/essl-sql-sync` | Manual SQL sync |

---

## Troubleshooting

| Symptom | Action |
|---------|--------|
| `Connection timeout` | VPN/firewall — EB cannot reach SQL Server |
| `Login failed` | Check user/password and database name |
| `Invalid object name CHECKINOUT` | Set `ESSL_SQL_*_TABLE` env vars |
| Punches listed, not in attendance | Badgenumber ≠ employeecode — fix in Admin → Employees |
| Duplicate device + SQL sync | Keep `ESSL_ENABLED=false` when using SQL mode |

---

## Related files

| File | Purpose |
|------|---------|
| `server/utils/esslSqlServer.js` | SQL query + cursor |
| `server/jobs/esslSqlServerSync.js` | Scheduled sync |
| `server/scripts/essl-sql-test.js` | Connection test |
| `server/scripts/essl-sql-sync-once.js` | Manual run |
