# DigitalOcean Droplet deployment

This setup assumes an Ubuntu Droplet with one Nginx proxy directly facing the internet, one backend process, and MySQL on the same Droplet. The public frontend is `https://qrsystem.com` and the API is `https://qrsystem.com/api`. The repository does not provision a Droplet or change DNS automatically.

## Prerequisites

- Install a supported Node.js runtime (Node 22.12+ on the 22 line, or Node 24), npm, Nginx, MySQL, and Certbot on the Droplet. Build on Linux so native dependencies such as bcrypt match the server. Do not upload Windows `node_modules`.
- Point the domain's DNS A record to the Droplet IPv4 address. Only configure an AAAA record if IPv6 is working. Use `qrsystem.com` as the canonical hostname; configure a separate redirect if adding `www`.
- Allow HTTP/HTTPS and your administrative SSH access through the firewall. Keep ports 5001 and 3306 private.
- Place the repository at `/opt/sitepass`. Create a dedicated Linux service account named `sitepass`, give it access to the backend, and use a non-root deployment account to install/build. The examples below assume these paths and accounts already exist.
- Create a MySQL database named `sitepass_db` and a dedicated MySQL user with access to that database. For an existing database, make a backup first. Preserve `_prisma_migrations` when importing an existing Prisma-managed database; otherwise baseline the database before running deployment migrations. Do not run migrations blindly against an imported, nonempty schema.

## Configure and build

On the server, copy [the backend template](../Backend/sitepass-backend/.env.example) to `Backend/sitepass-backend/.env`. Fill in real database credentials, a random JWT secret, the Brevo API key, and a sender address verified in Brevo. The main database URL and individual `DATABASE_*` fields must match exactly, with special password characters URL-encoded only in the URL. Omit `SHADOW_DATABASE_URL`.

For this Nginx setup, keep `HOST=127.0.0.1`, `PORT=5001`, `TRUST_PROXY=loopback`, `NODE_ENV=production`, and `FRONTEND_URL=https://qrsystem.com`. The service user must be able to read this file; restrict it to that user (for example, mode 600 with owner `sitepass`). Keep secrets outside Git. A JWT secret can be generated on the server with `openssl rand -hex 32`.

Run in `/opt/sitepass/Backend/sitepass-backend` as the deployment account with access to the environment file:

```bash
npm ci --include=dev
npm run build
npm run db:deploy
```

`db:deploy` applies committed migrations. Do not run `db:migrate` or `prisma migrate dev` in production. Build tools and Prisma are development dependencies, so include them during build/migration. The compiled API runs with `npm run start:prod` or the systemd unit below and does not require tsx at runtime.

In `/opt/sitepass/Frontend`, create `.env.production` from [the frontend template](../Frontend/.env.example) if the file is not included in your checkout. It must contain:

```dotenv
VITE_API_BASE_URL=/api
VITE_PUBLIC_APP_URL=https://qrsystem.com
VITE_ADMIN_TIMEZONE=Asia/Colombo
```

Then build and publish the static files:

```bash
npm ci --include=dev
npm run build
sudo install -d -m 755 /var/www/sitepass
sudo cp -R dist/. /var/www/sitepass/
sudo chmod -R a+rX /var/www/sitepass
```

Only publish `dist`, never the source tree or environment files. Rebuild whenever frontend environment values change. Old hashed assets can stay in place during rollout so previously opened pages keep working.

## First administrator on a fresh database

An imported database with existing administrators does not need this step. For a fresh database, run the following from the backend directory in Bash, with the environment file accessible:

```bash
read -r -p 'Administrator email: ' SITEPASS_ADMIN_EMAIL
read -r -p 'Administrator name: ' SITEPASS_ADMIN_NAME
read -r -s -p 'Administrator password (12+ characters): ' SITEPASS_ADMIN_PASSWORD
echo
export SITEPASS_ADMIN_EMAIL SITEPASS_ADMIN_NAME SITEPASS_ADMIN_PASSWORD
npm run admin:create
unset SITEPASS_ADMIN_EMAIL SITEPASS_ADMIN_NAME SITEPASS_ADMIN_PASSWORD
```

The command creates only the first administrator, hashes the password, and refuses to change existing accounts. It accepts at most 72 UTF-8 password bytes, matching bcrypt. Run it as a one-off operator command, not as part of every server startup. After logging in, create your construction site and set its real GPS coordinates and geofence radius before printing QR codes.

## Start the API and enable HTTPS

Check `command -v node` and update `ExecStart` in [sitepass.service](./sitepass.service) if Node is not at `/usr/bin/node`. From `/opt/sitepass`:

```bash
sudo cp deploy/sitepass.service /etc/systemd/system/sitepass.service
sudo systemctl daemon-reload
sudo systemctl enable --now sitepass
sudo systemctl status sitepass
sudo cp deploy/nginx.conf /etc/nginx/sites-available/sitepass
sudo ln -s /etc/nginx/sites-available/sitepass /etc/nginx/sites-enabled/sitepass
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d qrsystem.com --redirect
sudo certbot renew --dry-run
```

The symlink command is for first-time setup; skip it if the link already exists. Nginx preserves `/api`, supports browser route refreshes, and allows the backend's document upload size. Certbot adds the HTTPS listener and redirect; the supplied HTTP config alone is not the completed public deployment. Follow [Certbot's Nginx installation instructions](https://certbot.eff.org/instructions?os=snap&ws=nginx) for your server.

## Verify before inviting users

```bash
curl --fail https://qrsystem.com/api/health
sudo journalctl -u sitepass -n 100 --no-pager
```

Check administrator login, refresh a nested frontend route, create a site, and scan a generated QR code from a phone using mobile data. Verify browser GPS access, an employee entry/exit, visitor email delivery, document upload/download, and a PDF export. The health endpoint confirms that the process responds; it is not a comprehensive database/workflow check. Configure database backups and test restoring them. On later releases, build and apply reviewed migrations, then restart with `sudo systemctl restart sitepass`.

The current rate limits are per-process. This setup uses one backend instance; add a shared limiter store before scaling to multiple API instances.

## If using DigitalOcean Managed MySQL instead

Use its connection details for both `DATABASE_URL` and the individual `DATABASE_*` variables. Allow the Droplet as a trusted source, download the database CA certificate onto the server, and configure:

```dotenv
DATABASE_SSL=true
DATABASE_SSL_CA_PATH=/etc/sitepass/mysql-ca.crt
```

The runtime verifies the server certificate. For Prisma CLI migrations, add `?sslcert=/etc/sitepass/mysql-ca.crt&sslaccept=strict` to `DATABASE_URL`; URL-encode the path if needed. The certificate must be readable by the migration operator and service user. See [DigitalOcean connection details](https://docs.digitalocean.com/products/databases/mysql/how-to/connect/) and [Prisma's MySQL TLS configuration](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql).

For App Platform, do not use these Nginx/systemd files directly: configure the frontend build-time variables, a static-site fallback, API routing that preserves `/api`, a reachable `HOST=0.0.0.0` listener and matching service port, and the platform's trusted proxy addresses. Confirm that topology before setting `TRUST_PROXY`.
