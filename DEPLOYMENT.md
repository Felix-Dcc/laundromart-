# Deployment Guide

Production deployment for the Laundromat platform (API + Postgres + Redis + Nginx).

## Architecture

```
            ┌─────────────────────────────────────────┐
  Internet ─┤ Nginx (80/443, TLS, WebSocket upgrade)   │
            └───────────────┬─────────────────────────┘
                            │ proxy_pass
                    ┌───────▼────────┐   ┌────────────┐
                    │  API (Node)    │──▶│ Postgres   │ (named volume)
                    │  Express +     │   └────────────┘
                    │  Socket.IO     │   ┌────────────┐
                    │                │──▶│ Redis      │ (cache / future
                    └────────────────┘   └────────────┘  Socket.IO adapter)
```

The **mobile app** (Expo/React Native) is built and shipped separately (EAS / store builds); it points at `https://api.yourdomain.com/api`.

---

## 1. Backend — Docker (recommended)

```bash
# One-time config
cp .env.example .env                                   # set POSTGRES_PASSWORD
cp backend/.env.production.example backend/.env.production   # set JWT_SECRET, CORS_ORIGINS, Paystack keys

# Launch
docker compose up -d --build

# Verify
curl http://localhost/api/health         # {"status":"ok","db":"up",...}
docker compose logs -f api
```

`docker-compose.yml` runs Postgres + Redis + API + Nginx. The API container
applies the schema on start (`prisma db push`) and serves on the internal
network; only Nginx is published (80/443).

### Enable HTTPS
1. Point your DNS A record (e.g. `api.yourdomain.com`) at the server.
2. Issue a cert (webroot is already wired):
   ```bash
   docker run --rm -v $PWD/nginx/certs:/etc/letsencrypt \
     -v $PWD/nginx/www:/var/www/certbot certbot/certbot certonly \
     --webroot -w /var/www/certbot -d api.yourdomain.com
   ```
3. Put `fullchain.pem` + `privkey.pem` in `nginx/certs/`, rename
   `nginx/conf.d/laundromat.ssl.conf.example` → `laundromat.ssl.conf`, edit
   `laundromat.conf` to redirect 80→443, then `docker compose restart nginx`.

---

## 2. Backend — bare VM (PM2 alternative)

```bash
cd backend
npm ci
cp .env.production.example .env.production && nano .env.production
npx prisma generate && npx prisma db push
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

Keep `PM2_INSTANCES=1` until the Redis Socket.IO adapter is added (see Scaling).

---

## 3. Database backups

```bash
# Manual
BACKUP_DIR=/var/backups/laundromat ./scripts/backup-db.sh

# Daily cron at 02:00 (14-day retention)
0 2 * * * cd /opt/laundromat && BACKUP_DIR=/var/backups/laundromat ./scripts/backup-db.sh >> /var/log/laundromat/backup.log 2>&1
```

Restore: `gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U postgres -d laundry_management_system`

---

## 4. Payments webhook

Register `https://api.yourdomain.com/api/payments/webhook` in the Paystack
dashboard. Signature verification is enforced automatically in live mode.

---

## 5. CI/CD

`.github/workflows/ci.yml` boots the API in production mode against a Postgres
service and asserts the DB-aware health check. Fill in the commented `deploy`
job with your registry/SSH details to ship images automatically.

---

## 6. Production checklist

- [ ] Strong `JWT_SECRET` (64 chars) — the API refuses to boot otherwise.
- [ ] `CORS_ORIGINS` set to your real web origins.
- [ ] `TRUST_PROXY=true` (it's behind Nginx).
- [ ] Live Paystack keys + webhook registered.
- [ ] TLS enabled; HTTP redirects to HTTPS.
- [ ] Postgres password changed; port not publicly exposed.
- [ ] Backups scheduled + a restore tested.
- [ ] `PASSWORD_MIN_LENGTH=8`.

## Scaling notes (Phase 9)
Running >1 API instance needs the **Socket.IO Redis adapter** + Nginx sticky
sessions (`ip_hash`). Redis is already in the stack for this. Add `@socket.io/redis-adapter`
wired to `REDIS_URL`, then raise `PM2_INSTANCES` / compose replicas.
