# Deploying Project Tracker on Proxmox with Docker

## Prerequisites

- A Proxmox server with a VM or LXC container running Docker
- Docker and Docker Compose installed
- A domain name pointing to the server (e.g., `tracker.example.com`)
- HTTPS configured via reverse proxy (Caddy, Traefik, or nginx)

## 1. Clone and Configure

```bash
git clone <repo-url> /opt/project-tracker
cd /opt/project-tracker
cp .env.example .env
```

Edit `.env` with your settings:

```env
DATABASE_URL=postgresql://tracker:tracker@db:5432/tracker
SESSION_SECRET=<generate-a-64-char-random-string>
NEXT_PUBLIC_APP_URL=https://tracker.example.com
ATTACHMENT_STORAGE_PATH=/data/attachments
```

## 2. Generate VAPID Keys

```bash
npx tsx scripts/generate-vapid-keys.ts
```

Copy the output `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` into your `.env` file.
Set `VAPID_SUBJECT` to `mailto:your@email.com`.

## 3. Start the Stack

```bash
cd infra/docker
docker compose up -d
```

This starts:
- **PostgreSQL** on port 5432 (internal only)
- **Web app** on port 3000
- **Worker** (background reminder dispatcher)

## 4. Run Migrations

```bash
docker compose exec web node -e "
  // Or run from host with DATABASE_URL pointing to the Docker Postgres
"
# Or from the host:
cd /opt/project-tracker
DATABASE_URL=postgresql://tracker:tracker@localhost:5432/tracker npx tsx packages/db/src/migrate.ts
```

## 5. Generate First Pairing Token

```bash
DATABASE_URL=postgresql://tracker:tracker@localhost:5432/tracker npx tsx packages/db/src/bootstrap.ts
```

Save the displayed token — you'll enter it on your iPhone.

## 6. Reverse Proxy (HTTPS)

### Caddy (recommended — auto HTTPS)

```Caddyfile
tracker.example.com {
    reverse_proxy localhost:3000
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name tracker.example.com;

    ssl_certificate /etc/ssl/certs/tracker.pem;
    ssl_certificate_key /etc/ssl/private/tracker.key;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **IMPORTANT**: Push notifications on iPhone require HTTPS. Web Push will not work over plain HTTP.

## 7. iPhone Setup

1. Open `https://tracker.example.com` in Safari
2. Enter the pairing token from step 5
3. Tap **Share → Add to Home Screen**
4. Open the app from the Home Screen
5. Go to **Settings → Enable Notifications**
6. Grant notification permission when prompted

> The app must be opened from the Home Screen (not Safari) for push notifications to work.

## 8. Optional: Seed Test Data

```bash
DATABASE_URL=postgresql://tracker:tracker@localhost:5432/tracker npx tsx packages/db/src/seed.ts
```

## Maintenance

### View logs
```bash
cd infra/docker
docker compose logs -f web
docker compose logs -f worker
```

### Update
```bash
cd /opt/project-tracker
git pull
cd infra/docker
docker compose build
docker compose up -d
```

### Backup database
```bash
docker compose exec db pg_dump -U tracker tracker > backup-$(date +%Y%m%d).sql
```

### Add a new device
Go to **Settings → Trusted Devices → Pair New**, then enter the token on the new device.

## Ports and Firewall

Only port **443** (HTTPS) needs to be exposed externally. PostgreSQL (5432) should remain internal.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Push notifications don't arrive | Must be HTTPS. Must be opened from Home Screen. Check VAPID keys. |
| Token expired | Generate a new one with the bootstrap script or from Settings |
| Database connection refused | Check `docker compose ps` — Postgres must be healthy |
| Large upload fails | Increase `client_max_body_size` in nginx or remove limit in Caddy |
