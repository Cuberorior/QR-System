# SitePass Frontend

Frontend-only React/Vite prototype for QR-based construction site entry, exit, visitor registration, and workforce administration.

## Run locally

```bash
npm install
npm run dev
```

The app runs in demo mode by default with shared in-memory mock data. Try the public flow at `/verify/SITE-CMB-01`, or open `/admin/login` with `admin@sitepass.lk` / `demo1234`.

## Backend integration

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL`. Replace the isolated mock methods in `src/mock/store.js` with calls from the Axios client in `src/services/api.js`; the UI routes and contracts are ready for the proposed backend endpoints.

Passwords and access codes are never persisted to localStorage. Demo attendance is intentionally non-production data and resets on refresh.
