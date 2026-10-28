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
- Requires a safety checklist before employee entry where the active flow applies it.
- Allows visitors to register, verify their email, receive administrator approval, check in, and check out.
- Shows visitor registration status and access results.
- Uses short-lived verification sessions and action-bound tokens for protected workflows.

### Administrator workflows

- Administrator login protected by bcrypt password hashes and short-lived JWTs.
- Dashboard metrics and recent activity.
- Employee creation, listing, updates, activation/deactivation, and access-code regeneration.
- Attendance history, safety status, filtering, and CSV/PDF export.
- Visitor review, approval/rejection, credential regeneration, revocation, check-in, and check-out.
- Construction-site management, active/inactive status, GPS coordinates, and geofence settings.
- Permanent entry and exit QR code generation and poster printing.
- Audit-log viewing.

### Email workflows

The backend can use Brevo SMTP API delivery for employee welcome/access-code messages and visitor notifications. Email delivery attempts are stored in the database with status, retry, and error information.

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
VITE_PUBLIC_APP_URL=https://your-public-https-host.example.com
VITE_DEFAULT_SITE_CODE=SITE-CMB-01
```

`VITE_API_BASE_URL` may be `/api` when both applications share a host, or `http://localhost:5001/api` for separate local servers. `VITE_PUBLIC_APP_URL` is required by the QR-code page to build permanent public links. Use HTTPS in deployed environments because browser geolocation requires a secure context.

## Backend

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

## Testing and verification

```powershell
cd Frontend
npm run build

cd ..\Backend\sitepass-backend
npm run build
npm run test:integration       # running API and admin credentials required
npm run test:management        # running API required
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
- The administrator settings screen currently indicates that some settings are unavailable in the backend.
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

