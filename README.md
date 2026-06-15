# AVGC HRMS

Human resources and attendance platform for **AVGC** — multi-role dashboards, leave and request workflows, biometric device sync, and reporting. Deployable locally or on **Vercel** with **PostgreSQL** (e.g. Neon).

---

## Tech stack

### Backend

| Technology | Version / notes | Purpose |
|------------|-----------------|--------|
| **Node.js** | 18+ recommended | Runtime |
| **Express** | 5.x | REST API + static HTML |
| **PostgreSQL** | via `pg` / `pg-pool` | Primary database |
| **JWT** (`jsonwebtoken`) | — | Auth sessions |
| **bcrypt** | 6.x | Password hashing |
| **dotenv** | — | Environment config |
| **cors** | — | Cross-origin API |
| **multer** | — | File uploads (profile, imports, attachments) |
| **date-fns** | 4.x | Dates and formatting |
| **node-cron** | — | Scheduled jobs (birthday reminders) |
| **nodemailer** | — | Password reset / email |
| **xlsx** | — | Excel import (employees, attendance) |
| **zklib-js** | 1.3.x | ESSL / ZKTeco LAN device protocol |

### Frontend

| Technology | Where used | Purpose |
|------------|------------|---------|
| **HTML / CSS / vanilla JS** | Admin & manager dashboards | Main HRMS UI (`public/`) |
| **React 19** | Employee dashboard bundle | Modern employee experience |
| **TypeScript** | `client/avgc-dashboard` | Typed React components |
| **Vite 8** | Build tool | Bundle → `public/assets/avgc-dashboard/` |
| **Tailwind CSS 4** | React app | Styling |
| **Recharts** | React dashboard | Charts / productivity |
| **lucide-react** | React app | Icons |
| **Google Fonts** | Bebas Neue, DM Sans | Typography |

### Infrastructure & tooling

| Item | Purpose |
|------|---------|
| **Vercel** | Hosting (serverless Express via `api/index.js`) |
| **Neon / any Postgres** | Cloud database (`DATABASE_URL`) |
| **Git** | Version control |
| **npm** | Package management |

### Optional / integration

| Item | Purpose |
|------|---------|
| **ESSL / ZKTeco device** | Biometric attendance (TCP port 4370) |
| **Office bridge script** | `npm run essl:bridge` — sync device → Vercel |
| **SMTP** (Gmail etc.) | Forgot-password emails |

---

## User roles & portals

| Role | Login / dashboard | Description |
|------|-----------------|-------------|
| **Employee** | `/login` → `/employee/dashboard` | React app — same shell as manager; attendance, leave, assets, policies |
| **Manager** | `/manager/login` → `/manager/dashboard` | Team attendance, leaves, requests, reports |
| **Admin** | `/admin/login` → `/admin/dashboard` | Full HRMS — employees, imports, biometric, RBAC |
| **Super Admin** | Same as admin | All modules + manage other admins |

Marketing / landing: `/` (static `index.html`).

---

## Feature list

### Authentication & account

- Login (employee, manager, admin)
- Registration (where enabled)
- Forgot password + email reset token flow
- Force password change on first login
- Change password from profile
- JWT bearer auth on API routes
- Audit logging for sensitive actions

### Admin RBAC (role-based access)

- **Super Admin** vs limited admins
- Per-module permissions: employees, attendance, leave, reports, holidays, roles, import, settings, requests, dashboard
- **Manage Admins** UI (super admin only)
- Sidebar sections hidden by permission

### People & organization

- Employee CRUD (create, edit, remove)
- Auto **employee code** generation
- Custom **roles** (not only employee/manager/admin)
- **Manager assignments** (who reports to whom)
- **Manager directory** (`/managers`)
- **Org chart** (React team-hub)
- **Teams** view for managers (direct reports)
- Bulk **import employees** (Excel/CSV) with error report
- Import history

### Time & attendance

- Daily attendance view (admin/manager)
- **Attendance calendar** (monthly, holidays + Saturdays)
- **Import attendance** from Excel/CSV
- Status: present, absent, half-day, leave, etc. (hours-based rules)
- **ESSL / ZKTeco biometric**
  - Device sync (`zklib-js`, LAN)
  - Raw punch log storage (`essl_device_logs`)
  - Import into `attendancelogs`
  - Admin UI: list, filter, sync, import
  - Background poll when running locally (`npm start`)
  - Office **bridge** for Vercel deployments
- Manual **biometric API** punch (testing / integrations)

### Leave management

- Apply for leave (employees)
- Approve / reject (managers & admins)
- Leave history
- **Leave allowances / entitlements** — custom leave types, days, period (monthly / quarterly / yearly), org-wide or per employee
- Leave balance from database entitlements
- Approved leave updates attendance as leave days
- Holidays excluded from leave day counts

### Holidays & calendar

- **Holiday calendar** (national, festival, optional)
- Public holiday list for all users
- Admin holiday CRUD + bulk import
- **Saturday configuration** — mark Saturdays working or off (Sundays always off)
- Calendar reflects holidays and Saturday rules

### Asset management

- **Inventory** (`inventory_items`) with allocated / available counts
- **Allocations** (`asset_allocations`) — admin allocate/revoke; manager read-only; employee sees own assets only
- API: `/api/assets/*`

### Policies & important links

- Upload policy PDF/DOCX or add external links (`policy_documents`)
- Admin: full CRUD + visibility toggle
- Manager & employee: read visible entries only
- API: `/api/policies/*`

### Tasks

- **Personal tasks** (title, priority, due date, done)
- Shown in admin/manager “My Tasks” and employee React app
- Toggle complete without invalidating due date

### Notifications

- In-app notification bell
- Types: info, leave, birthday, etc.
- Mark read / unread counts

### Profile & media

- Profile: name, phone, location, bio, date of birth
- **Profile photo** upload
- On **Vercel**: photos stored in DB (`BYTEA`); served via API (read-only filesystem)
- Locally: files under `public/uploads/`

### Reports & analytics (admin)

- Combined reporting API with filters (employee, month, year, date range)
- Attendance, leave, employee, ticket/concern, OD-style exports
- Chart on analytics section
- Export / print friendly tables

### System & settings (admin)

- **Broadcast** notifications to users
- **Biometric** — device sync + punch list + import
- **Settings** — Saturday + holiday management entry points
- Theme: **light / dark** (localStorage)
- Global navbar search (tables)
- Navbar clock

### Employee React app (`client/avgc-dashboard`)

- Dashboard home (quick actions, charts, spotlight)
- My attendance & calendar
- Leave apply / history
- Asset management (my allocations) and policies & links (read-only)
- **Task manager**
- **Org chart** (embedded where mounted)
- **AVGC Buzz** chat UI (feature-flagged)
- Profile & settings
- Password gate when change required

### Background jobs (local server only)

- **Birthday reminders** (daily cron)
- **ESSL attendance sync** (interval from `ESSL_POLL_INTERVAL_MS`)

Disabled automatically when `VERCEL` env is set.

---

## Database tables (main)

| Table | Purpose |
|-------|---------|
| `employees` | All users (employee/manager/admin roles) |
| `admins` | Admin accounts + super admin flag |
| `admin_permissions` | RBAC module access |
| `attendancelogs` | Daily punch in/out, hours, status |
| `essl_device_logs` | Raw biometric punches |
| `leaves` | Leave applications |
| `leave_entitlements` | Leave allowances |
| `manageremployees` | Manager ↔ report mapping |
| `concerns` | Helpdesk tickets |
| `concern_messages` | Request thread |
| `holidays` | Holiday calendar |
| `saturday_config` | Per-Saturday working/off |
| `personal_tasks` | User tasks |
| `notifications` | In-app notifications |
| `importhistory` / `importerrors` | Import audit |
| `auditlogs` | Action audit |
| `password_reset_tokens` | Reset flow |

---

## API structure (high level)

| Prefix | Areas |
|--------|--------|
| `/api/auth` | Login, register, password reset, change password |
| `/api/users` | Profile, photo, tasks |
| `/api/attendance` | Employee punch, history, calendar |
| `/api/leaves` | Apply, approve, list |
| `/api/leave-balance` | Balances from entitlements |
| `/api/manager` | Team attendance, leaves, employees |
| `/api/admin` | Employees, attendance, reports, imports, ESSL, entitlements |
| `/api/admin-accounts` | Admin user management |
| `/api/concerns` | Requests / threading |
| `/api/biometric` | Device sync API + manual punch |
| `/api/holidays` | Holiday CRUD |
| `/api/saturday-config` | Saturday rules |
| `/api/notifications` | User notifications |

---

## NPM scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run API + static site + local ESSL poll |
| `npm run build` | Build React employee dashboard |
| `npm run build:dashboard` | Same (Vite → `public/assets/`) |
| `npm run db:init` | Apply schema + seeds |
| `npm run db:reset-super-admin` | Reset super admin password |
| `npm run essl:test` | Test biometric device connection |
| `npm run essl:sync` | One-shot device → DB sync |
| `npm run essl:bridge` | Office PC → cloud sync agent |
| `npm run postinstall` | Patch `zklib-js` for device errors |

---

## Environment variables (summary)

See **`.env.example`** for full list. Key groups:

- **Core:** `PORT`, `JWT_SECRET`, `DATABASE_URL`
- **Email:** `SMTP_*`, `FRONTEND_URL`
- **Biometric:** `ESSL_*`, `BIOMETRIC_API_KEY`, `HRMS_API_URL`, `ESSL_BRIDGE_MODE`
- **Vercel:** set `DATABASE_URL`, `JWT_SECRET` in project settings (no LAN device access without bridge)

---

## Project structure

```
sample/
├── api/index.js              # Vercel serverless entry
├── server/
│   ├── index.js              # Express app
│   ├── schema.sql            # PostgreSQL schema
│   ├── routes/               # API routers
│   ├── jobs/                 # Cron / ESSL sync
│   ├── utils/                # Shared logic
│   └── scripts/              # DB reset, ESSL tools
├── public/                   # Static HTML/CSS/JS dashboards
├── client/avgc-dashboard/    # React + Vite employee app
├── docs/ESSL-BIOMETRIC.md    # Biometric setup guide
├── vercel.json               # Deploy config
└── package.json
```

---

## Documentation

- **[ESSL / ZKTeco biometric setup](docs/ESSL-BIOMETRIC.md)** — device sync, Vercel bridge, troubleshooting

---

## Quick start

```bash
npm install
cp .env.example .env   # edit DATABASE_URL, JWT_SECRET, etc.
npm run db:init
npm run build:dashboard   # optional if using employee React app
npm start
```

| URL | Page |
|-----|------|
| http://localhost:3000/login | Employee login |
| http://localhost:3000/admin/dashboard | Admin |
| http://localhost:3000/manager/dashboard | Manager |

Default super admin (after `db:init` / `db:reset-super-admin`): see seed scripts — typically `admin@hrms.com` / `Admin@123`.

---

## License

ISC (see `package.json`).




For any future changes 
Just fork this repo : 
