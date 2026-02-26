# Installation de Stratum sur Ubuntu (avec PostgreSQL)

Cette documentation couvre une installation de production auto-hébergée sur un serveur Ubuntu (22.04+ recommandé) avec PostgreSQL, Node.js (monorepo npm workspaces), reverse proxy Nginx, services systemd, SSL (Let’s Encrypt) et bonnes pratiques de maintenance.

---
## 1. Vue d'ensemble architecture

Composants principaux:
- Frontend: Next.js (apps/frontend) – rendu statique/SSR, écoute en interne (ex: `localhost:3000` en prod via `next start`).
- Backend API: NestJS (apps/backend) – écoute interne (ex: `localhost:4001`) exposant `/api/v1` + Swagger `/docs` (désactivable en prod si besoin).
- Base de données: PostgreSQL + Prisma ORM.
- Reverse Proxy: Nginx termine TLS, route vers frontend et backend.
- Authentification: JWT (access token court 15m, refresh token 90j stocké côté DB + cookie côté client).
- Migrations/Seeds: Prisma (backend workspace).

Flux HTTP:
```
Client ─HTTPS→ Nginx ─proxy_pass→ (Next.js :3000)
                    └─proxy_pass→ (NestJS :4001 /api/v1)
```

---
## 2. Prérequis serveur

Paquets de base:
```
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl git ufw ca-certificates gnupg lsb-release nginx
```

Sécuriser SSH (optionnel mais recommandé):
- Désactiver root login direct, utiliser clés SSH.
- Configurer pare-feu (UFW):
```
sudo ufw allow OpenSSH
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
sudo ufw status
```

---
## 3. Installation Node.js (LTS)

Utilisez `nvm` (souple) ou dépôts officiels. Exemple avec nvm:
```
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
node -v
npm -v
```

Vérifiez que `corepack` est désactivé si non utilisé. Stratum utilise npm workspaces.

---
## 4. Installation PostgreSQL
```
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql --now
sudo -u postgres psql -c "SELECT version();"
```

Créer base, rôle dédié peu privilégié:
```
sudo -u postgres psql
CREATE ROLE stratum WITH LOGIN PASSWORD 'MotDePasseSolide!';
ALTER ROLE stratum WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE DATABASE stratum_db OWNER stratum ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;
\q
```

(Recommandé) Activer extension uuid si besoin futur:
```
sudo -u postgres psql -d stratum_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

Sauvegarde rapide manuelle:
```
pg_dump -Fc -U stratum -h localhost stratum_db > /var/backups/stratum_$(date +%F).dump
```

Planifiez ensuite des backups (voir section 14).

---
## 5. Création utilisateur système d’exécution
```
sudo adduser --system --group --home /opt/stratum stratum
sudo mkdir -p /opt/stratum
sudo chown -R stratum:stratum /opt/stratum
```

---
## 6. Clonage du dépôt
```
cd /opt/stratum
sudo -u stratum git clone https://github.com/ZA512/Stratum.git app
cd app
```

(Vérifiez la branche `main`).

---
## 7. Configuration des variables d'environnement

Variables backend identifiées:
- `PORT` (défaut 4001)
- `DATABASE_URL` (obligatoire) ex: `postgresql://stratum:MotDePasseSolide!@localhost:5432/stratum_db?schema=public`
- `JWT_SECRET` (obligatoire en prod, choisissez chaîne > 32 chars)
- `JWT_ACCESS_TTL` (défaut `15m`)
- `JWT_REFRESH_TTL_MS` (ex: `7776000000` pour 90 jours) ou forme `90d`
- `RESET_TOKEN_TTL_MS` (défaut 3600000) – optionnel
- `INVITATION_TTL_MS` (défaut 604800000) – optionnel

Frontend:
- `NEXT_PUBLIC_API_URL` (ex: `https://votre-domaine/api/v1`)

Créer fichier `.env` à la racine backend `apps/backend/.env`:
```
DATABASE_URL=postgresql://stratum:MotDePasseSolide!@localhost:5432/stratum_db?schema=public
JWT_SECRET=ChangezMoi_Prod_Très_Long_Imprévisible
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_MS=90d
PORT=4001
```

Fichier `.env.local` frontend `apps/frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=https://votre-domaine/api/v1
```

Permissions:
```
sudo chown stratum:stratum apps/backend/.env apps/frontend/.env.local
chmod 600 apps/backend/.env apps/frontend/.env.local
```

---
## 8. Installation des dépendances

Depuis la racine du monorepo:
```
cd /opt/stratum/app
sudo -u stratum npm install
```

(Vérifiez absence d’erreurs). Les workspaces installeront backend + frontend.

---
## 9. Migrations et seed

Appliquer migrations Prisma:
```
cd apps/backend
sudo -u stratum npx prisma migrate deploy
```

Initialiser les données (board + utilisateur démo) si nécessaire:
```
sudo -u stratum npm run db:seed
```

Tester connexion DB rapide:
```
sudo -u stratum npx prisma db pull > /dev/null && echo "DB OK"
```

---
## 10. Build production
```
cd /opt/stratum/app
sudo -u stratum npm run build:backend
sudo -u stratum npm run build:frontend
```

Backend exécutable via: `node dist/main` (script `start:prod`). Frontend via `next start`.

---
## 11. Services systemd

Créer service backend `/etc/systemd/system/stratum-backend.service`:
```
[Unit]
Description=Stratum Backend API (NestJS)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=stratum
Group=stratum
WorkingDirectory=/opt/stratum/app/apps/backend
Environment=NODE_ENV=production
EnvironmentFile=/opt/stratum/app/apps/backend/.env
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Créer service frontend `/etc/systemd/system/stratum-frontend.service`:
```
[Unit]
Description=Stratum Frontend (Next.js)
After=network.target stratum-backend.service

[Service]
Type=simple
User=stratum
Group=stratum
WorkingDirectory=/opt/stratum/app/apps/frontend
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/opt/stratum/app/apps/frontend/.env.local
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -p 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Recharge + activer:
```
sudo systemctl daemon-reload
sudo systemctl enable --now stratum-backend stratum-frontend
sudo systemctl status stratum-backend --no-pager
sudo systemctl status stratum-frontend --no-pager
```

Journal:
```
journalctl -u stratum-backend -f
journalctl -u stratum-frontend -f
```

---
## 12. Nginx (reverse proxy + SSL)

Supposons domaine `stratum.example.com` (remplacez). Créer `/etc/nginx/sites-available/stratum`:
```
server {
  listen 80;
  listen [::]:80;
  server_name stratum.example.com;
  location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
  location / { return 301 https://$host$request_uri; }
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name stratum.example.com;

  # Certificats (Let’s Encrypt après génération)
  ssl_certificate /etc/letsencrypt/live/stratum.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/stratum.example.com/privkey.pem;
  ssl_trusted_certificate /etc/letsencrypt/live/stratum.example.com/chain.pem;
  ssl_session_timeout 1d;
  ssl_session_cache shared:SSL:10m;
  ssl_session_tickets off;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;
  add_header Strict-Transport-Security "max-age=63072000" always;

  # Compression
  gzip on;
  gzip_types text/plain text/css application/json application/javascript application/rss+xml application/vnd.ms-fontobject application/x-font-ttf font/opentype image/svg+xml;

  # Frontend (Next.js)
  location /_next/ { proxy_pass http://127.0.0.1:3000/_next/; proxy_set_header Host $host; }
  location /static/ { proxy_pass http://127.0.0.1:3000/static/; }

  # API
  location /api/ {
    proxy_pass http://127.0.0.1:4001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Connection "";
  }

  # Reste -> frontend SSR
  location / {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Activer:
```
sudo ln -s /etc/nginx/sites-available/stratum /etc/nginx/sites-enabled/stratum
sudo nginx -t && sudo systemctl reload nginx
```

Générer certificat Let’s Encrypt (après pointage DNS):
```
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d stratum.example.com --redirect --hsts --staple-ocsp --email admin@example.com --agree-tos
```

Renouvellement automatique installé via timer systemd (vérifier: `sudo certbot renew --dry-run`).

---
## 13. Vérification fonctionnelle

1. Accéder: `https://stratum.example.com/` → page frontend.
2. Ouvrir outils dev → network → vérifier appels `/api/v1/...` 200.
3. Tester login avec utilisateur seed (si seed créé): `/ stratum`.
4. Vérifier rafraîchissement token (network: refresh endpoint après ~10 min ou interaction focus).
5. Consulter Swagger (optionnel): `https://stratum.example.com/api/v1/docs` (pensez à restreindre en prod via auth IP ou suppression route si besoin).

---
## 14. Sauvegardes & restauration

Script backup quotidien (`/usr/local/bin/stratum_pg_backup.sh`):
```
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F_%H-%M)
OUT="/var/backups/stratum_${STAMP}.dump"
pg_dump -Fc -U stratum -h localhost stratum_db > "$OUT"
find /var/backups -name 'stratum_*.dump' -mtime +14 -delete
```

```
sudo chmod 700 /usr/local/bin/stratum_pg_backup.sh
sudo chown root:root /usr/local/bin/stratum_pg_backup.sh
```

Cron:
```
sudo crontab -e
0 2 * * * /usr/local/bin/stratum_pg_backup.sh
```

Restauration:
```
pg_restore -c -U stratum -d stratum_db /var/backups/stratum_2025-10-05_02-00.dump
```

---
## 15. Mises à jour application
```
cd /opt/stratum/app
sudo -u stratum git pull
sudo -u stratum npm install --production=false
sudo -u stratum npx prisma migrate deploy
sudo -u stratum npm run build:backend
sudo -u stratum npm run build:frontend
sudo systemctl restart stratum-backend stratum-frontend
journalctl -u stratum-backend -n 50 --no-pager
```

Rollback rapide:
- Conserver un tag ou `git checkout <commit>` précédent.
- Restaurer dump DB correspondant si migration destructive.

---
## 16. Observabilité & logs

- Backend: `journalctl -u stratum-backend -f`
- Frontend: `journalctl -u stratum-frontend -f`
- Nginx: `/var/log/nginx/access.log` et `error.log`

Pour intégrer Prometheus / Grafana: ajouter un middleware métriques (futur).

---
## 17. Sécurité & durcissement

| Domaine | Mesure | Statut |
|---------|--------|--------|
| Secrets JWT | Valeur longue aléatoire | À configurer |
| Headers HTTP | Ajouter CSP, X-Frame-Options | Via Nginx (future) |
| Limitation brute force | Non implémentée (utiliser fail2ban sur Nginx) | Recommandé |
| TLS | Let’s Encrypt auto-renew | OK |
| Accès Swagger | Restreindre / désactiver en prod | Recommandé |
| Refresh tokens | Hashés SHA-256 en DB | Implémenté |

Ajouter bloc Nginx pour headers:
```
add_header X-Frame-Options SAMEORIGIN;
add_header X-Content-Type-Options nosniff;
add_header Referrer-Policy strict-origin-when-cross-origin;
add_header X-XSS-Protection "1; mode=block";
```

---
## 18. Dépannage rapide

| Problème | Diagnostic | Solution |
|----------|------------|----------|
| 502 Bad Gateway | `systemctl status` services | Redémarrer, vérifier ports, logs backend |
| Migration échoue | Erreur Prisma | Vérifier `DATABASE_URL`, appliquer manuellement ou revert dernière migration |
| Tokens expirent trop vite | Logs login/refresh | Ajuster `JWT_ACCESS_TTL` ou `JWT_REFRESH_TTL_MS` |
| Erreurs CORS | Console navigateur | Ajouter domaine production dans `enableCors` (backend `main.ts`) |
| Build frontend échoue | Logs build | Vérifier version Node, effacer `node_modules`, réinstaller |
| Certificat expiré | `curl -Iv` | `sudo certbot renew --dry-run` puis renouveler |

---
## 19. Personnalisations futures
- Ajouter service snapshot des tableaux (cron) → nouveau service systemd ou worker.
- Introduire Socket.io pour temps réel (ouvrir port interne + namespace `/ws`).
- Mise en cache (Redis) pour endpoints agrégés dashboards.
- CDN pour assets statiques Next.js (images, chunks).

---
## 20. Checklist finale de mise en prod

- [ ] DNS pointe vers l'IP du serveur
- [ ] Accès SSH via clés (pas de password root)
- [ ] Pare-feu UFW actif (80/443/22)
- [ ] PostgreSQL rôle + base créés
- [ ] `.env` backend sécurisé (chmod 600)
- [ ] Migrations appliquées sans erreur
- [ ] Seed exécuté (si besoin utilisateur démo)
- [ ] Build backend + frontend OK
- [ ] Services systemd actifs (status=active)
- [ ] Nginx test config OK (`nginx -t`)
- [ ] Certificat SSL valide (`certbot certificates`)
- [ ] Connexion login / refresh token testés
- [ ] Backup cron installé
- [ ] Headers sécurité ajoutés
- [ ] Swagger restreint ou désactivé

---
## 21. Annexes

### Format alternatif `DATABASE_URL`
`postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public&connection_limit=5&pool_timeout=0`

### Rotation des refresh tokens
Chaque refresh invalide le précédent (revocation + nouveau). Nettoyage automatique des expirés, pas besoin de job dédié.

### Désactiver Swagger en prod
Dans `main.ts`: conditionner la création du document si `process.env.NODE_ENV !== 'production'`.

---
**Fin du document**
