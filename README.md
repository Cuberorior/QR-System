# SITEPASS QR System

SITEPASS is a QR-based construction-site access and workforce management platform. It supports employee entry and exit, visitor registration and approval, GPS/geofence verification, safety declarations, attendance reporting, administrator access, QR poster generation, email delivery, and audit logging.

This repository contains a React/Vite frontend, an Express/TypeScript backend, a MySQL database schema managed with Prisma, and the original product proof-of-concept document.

## Contents

- [What the system does](#what-the-system-does)
- [Repository structure](#repository-structure)
- [Technology stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Frontend](#frontend)
- [Backend](#backend)
- [Database](#database)
- [Configuration](#configuration)
- [Application routes](#application-routes)
- [Testing and verification](#testing-and-verification)
- [Deployment](#deployment)
- [Security notes](#security-notes)
- [Current implementation notes](#current-implementation-notes)
- [Reference material](#reference-material)

## What the system does

### Public QR workflows

- Opens a site-specific public flow using a URL such as `/verify/SITE-CMB-01`.
- Provides separate entry and exit actions for employees and visitors.
- Requests browser geolocation and verifies the user against the construction-site geofence.
- Verifies employee credentials and records an entry or exit attendance event.
- Automatically closes an employee's open attendance after 10 hours if no exit QR was scanned. The recorded exit is exactly entry time + 10 hours (for example, 8:00 AM → 6:00 PM); an earlier scanned exit keeps its actual time.
- Requires a safety checklist before employee entry where the active flow applies it.
- Allows visitors to register, verify their email, receive administrator approval, check in, and check out.
- Shows visitor registration status and access results.
- Uses short-lived verification sessions and action-bound tokens for protected workflows.

### Administrator workflows

- Administrator login protected by bcrypt password hashes and short-lived JWTs.
- Dashboard metrics and recent activity.
- Employee creation, listing, updates, activation/deactivation, and access-code regeneration.
- Add/edit employee validation: name is required (maximum **30 characters**, including spaces; letters in any language, spaces, apostrophes, periods, and hyphens). Email is required, must be valid and unique, and allows up to 191 characters. Optional addresses allow **50 words** and **500 characters**, including multiline addresses. Optional phone numbers must be UK numbers in local, `0044`, or `+44` format and are stored in `+44` format. For example, `07700 900123` is stored as `+447700900123`; the sample mobile number uses [Ofcom?s reserved drama range](https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama). Creating an employee requires an active, authorized construction site. The form displays a name character counter, address word count, and field errors, and the API enforces the same limits. Long directory values use two-line previews within fixed columns instead of shifting the table. Hover to see the full value, or open Edit employee to read it on touch devices.
- Attendance history, safety status, filtering, and CSV/PDF export.
- In **Admin > Attendance**, select **View details** beneath a recorded safety status to review the employee's checklist responses, site, submission time (UTC), and checklist version. Rows without a declaration show **No declaration recorded**.
- Visitor review, approval/rejection, credential regeneration, revocation, check-in, and check-out.
- Construction-site management, active/inactive status, GPS coordinates, and geofence settings.
- Permanent entry and exit QR code generation and poster printing.
- Audit-log viewing.

### Email workflows

The backend can use Brevo SMTP API delivery for employee welcome/access-code messages and visitor notifications. Email delivery attempts are stored in the database with status, retry, and error information.

### Employee access codes

- Employee access codes are generated automatically by the backend as exactly six numeric digits, such as `482731`.
- The code is sent to the employee by email when the employee is created and whenever an administrator regenerates credentials.
- Only a bcrypt hash is stored in the database; the plain access code is never stored in the employee record.
- Employees use their `EMP-xxxxxx` Employee ID and six-digit access code after scanning the site's QR code.
- Existing employees created with an older access-code format must have their credentials regenerated from **Admin > Employees** before using the six-digit format.

## Repository structure

```text
QR project/
├── Frontend/                    React/Vite client
│   ├── src/
│   │   ├── pages/public/        QR, employee, visitor, and safety flows
│   │   ├── pages/admin/         Administrator screens
│   │   ├── pages/auth/          Administrator login
│   │   ├── services/            Axios API client and verification session helpers
│   │   ├── mock/                Demo-mode in-memory data and services
│   │   └── context/             Authentication state
│   ├── .env.example             Frontend environment template
│   └── vercel.json              SPA rewrite for Vercel
├── Backend/sitepass-backend/    Express/TypeScript API
│   ├── src/routes/              Public and administrator API routes
│   ├── src/middleware/          JWT administrator authentication
│   ├── src/services/            Brevo email integration
│   ├── src/utils/               Geofence and access helpers
│   ├── prisma/schema.prisma     MySQL data model
│   ├── prisma/migrations/       Database migrations
│   ├── scripts/                 Bootstrap, email, integration, and management tests
│   ├── api/index.ts             Vercel serverless entry point
│   └── vercel.json              Vercel API configuration
├── QR System - POC.pdf          Product proof-of-concept reference
└── README.md                    This document
```

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, React Router, Vite 6, Tailwind CSS, Axios |
| Forms and validation | React Hook Form, Zod |
| UI and reporting | Lucide React, Recharts, Sonner |
| QR generation | `qrcode.react` |
| Backend | Node.js, Express 5, TypeScript |
| Authentication | bcrypt, JSON Web Tokens, HTTP security headers, rate limiting |
| Database | MySQL/MariaDB with Prisma 7 |
| Email | Brevo SMTP API |
| Hosting | Vercel configuration is included for both frontend and backend |

### Dependencies installed by `npm install`

You do not need to install these packages globally. Run `npm install` once inside `Frontend` and once inside `Backend/sitepass-backend`; npm reads each local `package.json` and installs the correct versions.

#### Frontend dependencies

| Package | Purpose |
| --- | --- |
| `react`, `react-dom` | User interface |
| `react-router-dom` | Client-side routes |
| `axios` | Backend API requests |
| `@tanstack/react-query` | API data fetching and caching |
| `react-hook-form`, `@hookform/resolvers`, `zod` | Forms and validation |
| `recharts` | Dashboard charts |
| `lucide-react` | Icons |
| `qrcode.react` | QR-code rendering |
| `sonner` | Toast notifications |
| `date-fns` | Date utilities |
| `vite`, `@vitejs/plugin-react` | Development server and build |
| `tailwindcss`, `postcss`, `autoprefixer` | CSS tooling |

#### Backend dependencies

| Package | Purpose |
| --- | --- |
| `express` | HTTP API server |
| `typescript`, `tsx`, `tsup` | TypeScript development and bundling |
| `@prisma/client`, `prisma` | Database access, schema, and migrations |
| `@prisma/adapter-mariadb`, `mariadb`, `mysql2` | MySQL/MariaDB connectivity |
| `bcrypt` | Password and access-code hashing |
| `jsonwebtoken` | Administrator JWT authentication |
| `zod` | Request validation |
| `helmet` | HTTP security headers |
| `cors` | Frontend/backend origin control |
| `express-rate-limit` | Rate limiting |
| `cookie-parser` | Cookie parsing |
| `pdfkit` | PDF report generation |
| `dotenv` | Environment variable loading |

Node.js and npm are the only tools that need to be installed globally. Prisma, Vite, React, Express, and TypeScript are installed locally by the two `npm install` commands.

## Prerequisites

- Node.js with npm. Node 20 or newer is recommended.
- A MySQL or MariaDB database.
- A modern browser with geolocation permission for GPS verification flows.
- A Brevo account and sender identity if email delivery is required.

Install dependencies separately in both applications:

```powershell
cd Frontend
npm install

cd ..\Backend\sitepass-backend
npm install
```

## Quick start

The shortest complete first-time setup is:

```powershell
# 1. Install packages
cd Frontend
npm install
cd ..\Backend\sitepass-backend
npm install

# 2. Create Backend/sitepass-backend/.env and configure the database variables

# 3. Prepare the database and create a development administrator
npm run db:generate
npm run db:migrate
npm run bootstrap:dev-admin

# 4. Start the backend in this terminal
npm run dev
```

Open a second terminal for the frontend:

```powershell
cd Frontend
copy .env.example .env
npm run dev
```

Then open `http://localhost:5173/admin/login` in a browser. The detailed database and environment setup is below.

### 1. Start the backend

Create `Backend/sitepass-backend/.env` with the variables described in [Configuration](#configuration), then create/update the database:

```powershell
cd Backend\sitepass-backend
npm run db:generate
npm run db:migrate
npm run bootstrap:dev-admin
npm run dev
```

The API starts on `http://localhost:5001` by default. Confirm it is running with `GET http://localhost:5001/api/health`.

### 2. Start the frontend

In a second terminal:

```powershell
cd Frontend
copy .env.example .env
npm run dev
```

The frontend runs at `http://localhost:5173`.

### Open a QR link on a phone during local development

`localhost` and `127.0.0.1` refer to the phone itself, not the development computer. For local phone testing:

1. Connect the phone and computer to the same Wi-Fi network or phone hotspot.
2. Find the computer's Wi-Fi IPv4 address with `ipconfig`.
3. Set `VITE_PUBLIC_APP_URL` in `Frontend/.env` to `http://<computer-ip>:5173`.
4. Keep `VITE_API_BASE_URL=/api` so Vite proxies the phone's API requests to the computer's backend.
5. Restart Vite after changing `.env`.
6. Generate/download a new QR code; an old printed QR still contains its old URL.

The Vite server is configured to listen on the LAN. If Windows Firewall prompts for Node.js, allow it on the private network. For production or internet access, use a deployed HTTPS URL or start a new tunnel; temporary tunnel hostnames expire and old QR codes stop working.

### 3. Open the application

- Administrator login: `http://localhost:5173/admin/login`
- Public site flow: `http://localhost:5173/verify/SITE-CMB-01`
- API health check: `http://localhost:5001/api/health`

The active frontend routes use the backend API. Older mock/demo components and services remain in the repository for reference; they are not selected by the current `src/App.jsx` route configuration.

## Frontend

The frontend is a Vite single-page application.

```powershell
cd Frontend
npm run dev       # local development server
npm run build     # production build in dist/
npm run preview   # preview the production build
```

### Frontend environment variables

Copy [Frontend/.env.example](./Frontend/.env.example) to `Frontend/.env`:

```dotenv
VITE_API_BASE_URL=/api
VITE_PUBLIC_APP_URL=http://localhost:5173
VITE_ADMIN_TIMEZONE=Asia/Colombo
```

For local development, use `VITE_API_BASE_URL=/api`. Vite proxies `/api` requests to the backend at `http://127.0.0.1:5001`, which also lets a phone on the same Wi-Fi use the computer's LAN address. If you run the frontend and backend on different hosts, use the full backend URL instead, such as `http://<computer-ip>:5001/api`. `VITE_PUBLIC_APP_URL` is required by the QR-code page to build public links. `VITE_ADMIN_TIMEZONE` controls the timezone shown on administrator pages and defaults to the browser timezone when omitted. Use HTTPS in deployed environments because browser geolocation requires a secure context.

## Backend

### Automatic employee exit after 10 hours

Open employee sessions expire after 10 elapsed hours, including overnight sessions. A long-running backend checks at startup and every minute. Attendance views, CSV/PDF exports, dashboard requests, and verified employee scans also reconcile overdue sessions before using attendance data. The attendance page and dashboard refresh every minute while visible.

If the server was stopped, the next startup or relevant request closes overdue sessions using **entry time + 10 hours**, not the later processing time. Existing overdue open sessions are included. Manual exits that were already recorded remain unchanged, and employees can check in again after their previous session expires.

Each automatic exit is recorded in Activity Logs as **Employee Automatically Checked Out (10 hours)** by **SYSTEM**, including the effective exit time and processing time. This is an assumed exit under the attendance policy, not confirmation of physical departure. The rule applies to employees; visitor sessions keep their existing workflow.

On serverless deployments, request-time reconciliation remains active, but the minute timer does not run continuously. For database updates during periods with no traffic, run the long-running backend or configure a scheduled worker to call the `expireOpenAttendance` service.

The backend is an Express API. It connects to MySQL before listening and exits if the database connection cannot be established.

```powershell
cd Backend\sitepass-backend
npm run dev                 # watch mode
npm start                   # run with tsx
npm run build               # Prisma generation, type-check, and bundle
npm run db:generate         # generate Prisma client
npm run db:migrate          # apply/create development migrations
npm run db:studio           # open Prisma Studio
```

### Create a development administrator

The bootstrap command is disabled when `NODE_ENV=production`. In development it prompts for an email and password, or reads them from environment variables:

```powershell
$env:SITEPASS_ADMIN_EMAIL = "admin@example.com"
$env:SITEPASS_ADMIN_NAME = "SITEPASS Administrator"
$env:SITEPASS_ADMIN_PASSWORD = "use-a-password-at-least-12-characters"
npm run bootstrap:dev-admin
```

If an administrator already exists, the command skips creation unless `SITEPASS_ADMIN_RESET_EXISTING=true` is set. Passwords are hashed with bcrypt and are never printed by the script.

## Database

The Prisma schema is in [Backend/sitepass-backend/prisma/schema.prisma](./Backend/sitepass-backend/prisma/schema.prisma). It includes construction sites, administrators, site assignments, employees, attendance records, safety declarations, visitors, visitor visits, verification sessions, email deliveries, and audit logs.

For a fresh development database:

```powershell
cd Backend\sitepass-backend
npm run db:generate
npm run db:migrate
```

Do not edit an already-applied migration. Create a new migration for schema changes and review it before applying it to shared or production databases.

## Configuration

The backend does not currently include a committed `.env.example`, so create `Backend/sitepass-backend/.env` manually. Never commit it.

### Required backend variables

```dotenv
# Prisma CLI migration connection
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/sitepass_db
SHADOW_DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/sitepass_shadow

# Runtime MariaDB adapter connection
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=sitepass_user
DATABASE_PASSWORD=change-me
DATABASE_NAME=sitepass_db

# At least 32 characters; required for JWT signing
JWT_SECRET=replace-with-a-long-random-secret

# Allowed browser origin and API listener
FRONTEND_URL=https://your-frontend.example.com
PORT=5001
```

### Optional backend variables

```dotenv
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=no-reply@example.com
BREVO_SENDER_NAME=SITEPASS

SITEPASS_ADMIN_EMAIL=admin@example.com
SITEPASS_ADMIN_NAME=SITEPASS Development Administrator
SITEPASS_ADMIN_PASSWORD=use-a-password-at-least-12-characters
SITEPASS_ADMIN_RESET_EXISTING=false

# Falls back to FRONTEND_URL
PUBLIC_APP_URL=https://your-frontend.example.com
```

Use separate secrets and databases for local, staging, and production. Only variables prefixed with `VITE_` belong in frontend environment files.

## Application routes

### Frontend routes

| Route | Purpose |
| --- | --- |
| `/verify/:siteId` | Site verification gate |
| `/verify/:siteId/:action` | Entry/exit action selection |
| `/verify/:siteId/:action/employee` | Employee entry/exit workflow |
| `/verify/:siteId/:action/visitor` | Visitor entry/exit workflow |
| `/verify/:siteId/visitor` | Visitor self-service registration |
| `/verify/:siteId/status` | Visitor status/access page |
| `/admin/login` | Administrator login |
| `/admin/dashboard` | Dashboard |
| `/admin/sites` | Site and geofence management |
| `/admin/employees` | Employee management |
| `/admin/attendance` | Attendance and safety records |
| `/admin/visitors` | Visitor management |
| `/admin/qr-codes` | Entry/exit QR generation |
| `/admin/activity-logs` | Audit logs |
| `/admin/settings` | Settings placeholder/current backend-unavailable screen |

### Backend route groups

All API endpoints are under `/api`.

| Prefix | Scope |
| --- | --- |
| `/api/health` | Health check |
| `/api/public` | Public site lookup and verification |
| `/api/public/location` | GPS/geofence verification |
| `/api/public/attendance` | Employee attendance and safety declarations |
| `/api/public/visitors` | Visitor registration, verification, check-in, and check-out |
| `/api/admin/auth` | Administrator login |
| `/api/admin/employees` | Employee administration |
| `/api/admin/attendance` | Attendance, safety details, and exports |
| `/api/admin/visitors` | Visitor administration |
| `/api/admin/sites` | Site and geofence administration |
| `/api/admin/email` | Administrative email operations |
| `/api/admin/dashboard` | Dashboard data |
| `/api/admin/audit-logs` | Audit history |

Administrator endpoints require `Authorization: Bearer <jwt>`. Login tokens expire after 15 minutes and are held in browser session storage by the frontend.

The administrator auth group also provides profile and password operations:

- `GET /api/admin/auth/profile` - load the signed-in administrator profile
- `PATCH /api/admin/auth/profile` - update the administrator name and email
- `PATCH /api/admin/auth/password` - change the administrator password

## Testing and verification

```powershell
cd Frontend
npm run build

cd ..\Backend\sitepass-backend
npm run build
npm run test:integration       # running API and admin credentials required
npm run test:management        # running API required
npm run test:attendance-auto-exit # database required; test fixtures are rolled back
npm run test:email-service
npm run email:test recipient@example.com
npm run email:preview recipient@example.com
```

Integration tests use `SITEPASS_TEST_BASE_URL` when set, otherwise `http://localhost:5001`. Email tests require the corresponding Brevo configuration unless they are testing mocked behavior.

## Deployment

### Frontend on Vercel

1. Set the project root to `Frontend`.
2. Use build command `npm run build` and output directory `dist`.
3. Set `VITE_API_BASE_URL` to the deployed API base path or URL.
4. Set `VITE_PUBLIC_APP_URL` to the public HTTPS frontend URL.
5. Keep [Frontend/vercel.json](./Frontend/vercel.json) so client-side routes rewrite to `index.html`.

### Backend on Vercel

1. Set the project root to `Backend/sitepass-backend`.
2. Use [Backend/sitepass-backend/api/index.ts](./Backend/sitepass-backend/api/index.ts) as the serverless entry point.
3. Keep [Backend/sitepass-backend/vercel.json](./Backend/sitepass-backend/vercel.json), which rewrites `/api/*` and sets a 30-second function duration.
4. Configure database, JWT, CORS, public URL, and email variables in the deployment platform.
5. Run migrations through a controlled deployment process before routing production traffic to a new schema.

For a traditional Node host, run `npm run build` and start the API with `npm start`.

## Security notes

- Do not commit `.env` files, database passwords, JWT secrets, or Brevo API keys.
- Use HTTPS in production so browser geolocation and secure session behavior work correctly.
- Keep `JWT_SECRET` at least 32 characters and rotate it through a controlled deployment process.
- The backend uses bcrypt, JWT authentication, Helmet, CORS, Zod validation, and rate limiting on sensitive login/verification operations.
- GPS verification is enforced by the backend; frontend checks are only user-experience safeguards.
- Visitor registration is not automatic permission to enter. Approval and credential expiry are separate checks.
- The bootstrap administrator command must not be run with `NODE_ENV=production`.
- Review `FRONTEND_URL` before deployment and avoid wildcard origins.

## Current implementation notes

- The active configuration in [Frontend/src/App.jsx](./Frontend/src/App.jsx) uses the API-backed `*Real`, `*Gps`, `*Secure`, `*Automatic`, and `*SelfService` screens.
- Older mock screens remain for demo/reference purposes and use in-memory data that resets on refresh.
- The administrator Settings screen supports profile editing, password changes, and a browser-specific inactivity screen-lock timeout.
- The backend requires both `DATABASE_URL` for Prisma CLI operations and individual `DATABASE_*` variables for the runtime adapter.
- QR posters contain public site/action links, but employee credentials, GPS verification, and backend authorization remain required.

## Reference material

- Product proof of concept: [QR System - POC.pdf](./QR%20System%20-%20POC.pdf)
- Frontend-specific notes: [Frontend/README.md](./Frontend/README.md)
- Frontend environment template: [Frontend/.env.example](./Frontend/.env.example)
- Prisma schema: [Backend/sitepass-backend/prisma/schema.prisma](./Backend/sitepass-backend/prisma/schema.prisma)
- Frontend route configuration: [Frontend/src/App.jsx](./Frontend/src/App.jsx)
- Backend application setup: [Backend/sitepass-backend/src/app.ts](./Backend/sitepass-backend/src/app.ts)

## License and ownership

The backend package is marked `ISC` and identifies `AppZ Makers` as the author. Confirm the intended license and distribution terms with the project owner before publishing or redistributing the system.

