# Déploiement Stratum avec Docker (Persistance PostgreSQL Sécurisée)

Objectif: Te donner une méthode claire pour déployer Stratum via Docker sans crainte de perdre les données PostgreSQL.
Tu vas voir:
1. Deux approches (réutiliser ton Postgres existant OU tout dockeriser)
2. Architecture proposée (compose)
3. Politique de persistance (volumes + sauvegardes hors volume)
4. Procédures critiques (sauvegarde, restauration, mise à jour, rollback)
5. Vérifications anti-erreur avant toute action risquée
6. FAQ peurs fréquentes
 7. (Nouveau) Fichier `.env` + Makefile + migrations auto + profil nginx

---
## 1. Deux approches possibles

| Approche | Quand la choisir | Avantages | Inconvénients |
|----------|------------------|-----------|---------------|
| A. Postgres déjà existant (host) | Tu as déjà un Postgres géré hors Docker (service systemd) | Pas de double infra, plus simple | Déploiement partiel, dépendances mixtes |
| B. Stack 100% Docker Compose | Tu veux isolation complète | Reproductible, portable, facile à recréer | Tu dois gérer volume + backups |

Si ta peur principale = perte de données, sache:
- Les données Postgres ne "disparaissent" pas tant que le volume nommé ou dossier bind n'est pas supprimé.
- Un `docker-compose down` sans `-v` NE supprime PAS les volumes.
- On ajoute un processus de sauvegarde automatique hors volume (tar + pg_dump) pour ceinture + bretelles.

---
## 2. Schéma Architecture (Compose complet)

Services:
- `postgres`: image officielle, volume `pg_data` (données), init SQL optionnel.
- `backend`: build depuis `apps/backend` (NestJS) → écoute interne 4001.
- `frontend`: build depuis `apps/frontend` (Next.js) → écoute interne 3000.
- `nginx` (optionnel) ou exposition directe (selon ton infra). Pour simplicité ici on expose directement le frontend, l'API passe par ce frontend `NEXT_PUBLIC_API_URL` ou un reverse proxy externe.
- `backup` (job cron-like via container) ou script host.

---
## 3. Volumes & persistance

Volume nommé recommandé:
```
volumes:
  pg_data:
    name: stratum_pg_data
```

Pourquoi un volume nommé ?
- Docker le stocke dans `/var/lib/docker/volumes/stratum_pg_data/_data`
- Un `docker system prune` ne supprime pas les volumes par défaut.

Sauvegarde hors volume (imposé) = si volume cassé → restore possible.

---
## 4. Fichier `docker-compose.yml` proposé

Place-le à la racine du repo (`docker-compose.yml`).

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: stratum-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: stratum
      POSTGRES_PASSWORD: CHANGE_ME_STRONG
      POSTGRES_DB: stratum_db
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U stratum"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    container_name: stratum-backend
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://stratum:CHANGE_ME_STRONG@postgres:5432/stratum_db?schema=public
      JWT_SECRET: CHANGER_CE_SECRET_LONG_ET_RANDOM
      JWT_ACCESS_TTL: 15m
      JWT_REFRESH_TTL_MS: 90d
      PORT: 4001
    ports:
      - "4001:4001" # (Optionnel si reverse proxy externe)
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: docker/frontend.Dockerfile
    container_name: stratum-frontend
    depends_on:
      - backend
    environment:
      NODE_ENV: production
      PORT: 3000
      NEXT_PUBLIC_API_URL: http://localhost:4001/api/v1
    ports:
      - "3000:3000"
    restart: unless-stopped

  # (Optionnel) Nginx si tu veux TLS direct dans compose.
  # nginx:
  #   image: nginx:alpine
  #   depends_on:
  #     - frontend
  #     - backend
  #   volumes:
  #     - ./docker/nginx.conf:/etc/nginx/nginx.conf:ro
  #   ports:
  #     - "80:80"
  #     - "443:443"
  #   restart: unless-stopped

volumes:
  pg_data:
    name: stratum_pg_data

# Utilisation du profil nginx (désactivé par défaut):
# docker compose --profile nginx up -d
```

---
## 5. Dockerfiles minimalistes

Créer dossier `docker/` à la racine.

`docker/backend.Dockerfile`:
```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm install --workspace backend --include-workspace-root --omit=dev=false
RUN npm run build:backend

# Production stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/apps/backend
EXPOSE 4001
CMD ["node", "dist/main.js"]
```

`docker/frontend.Dockerfile`:
```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm install --workspace frontend --include-workspace-root --omit=dev=false
RUN npm run build:frontend

# Production stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=build /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=build /app/node_modules ./node_modules
COPY apps/frontend/public ./apps/frontend/public
WORKDIR /app/apps/frontend
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
```

Notes:
- Ici on réinstalle pas tout pour séparer dev/prod. On pourrait optimiser avec `npm ci` et un root lockfile.
- Prisma Client: si utilisé dans backend, s'assurer que `prisma generate` a été exécuté avant copie (sinon ajouter `npx prisma generate`).

### Entrypoint migrations auto
Le backend utilise maintenant `entrypoint-backend.sh` qui:
- Exécute `prisma migrate deploy` si `AUTORUN_MIGRATIONS=true`
- Peut lancer un seed si `SEED_ON_START=true`
Cela réduit les oublis lors des mises à jour.

Ajout (si nécessaire) dans backend Dockerfile (build stage après install):
```
WORKDIR /app/apps/backend
RUN npx prisma generate
```

---
## 6. Initialisation & première exécution
```
docker compose pull  # (si images distantes, ici build local)
docker compose build
# Lancer sans seed pour voir si tout démarre
docker compose up -d postgres
# Vérifier santé
docker compose logs -f postgres
# Démarrer le backend + frontend
docker compose up -d backend frontend
```

Appliquer migrations dans le container backend:
```
docker compose exec backend npx prisma migrate deploy
```

Seed (si souhaité):
```
docker compose exec backend npm run db:seed
```

Test rapide API:
```
curl http://localhost:4001/api/v1/ -I
```

Accéder au frontend: http://localhost:3000

---
## 7. Sauvegardes automatiques (Anti-perte)

Créer dossier sur l’hôte, hors Docker:
```
sudo mkdir -p /opt/stratum_backups
sudo chown $USER:$USER /opt/stratum_backups
```

Script sauvegarde `backup_stratum_pg.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F_%H-%M)
OUT="/opt/stratum_backups/stratum_${STAMP}.dump"
# Commande dans le container postgres
docker compose exec -T postgres pg_dump -U stratum -d stratum_db -Fc > "$OUT"
# Réduire rétention à 14 jours
find /opt/stratum_backups -type f -name 'stratum_*.dump' -mtime +14 -delete
```

```
chmod +x backup_stratum_pg.sh
```

Cron (host):
```
crontab -e
0 1 * * * /chemin/vers/backup_stratum_pg.sh >> /opt/stratum_backups/cron.log 2>&1
```

Test restauration simulation:
1. Exporter nom volume: `docker volume inspect stratum_pg_data` (ne pas supprimer!)
2. Créer DB vierge (scénario crash):
```
docker compose down
# (Ne pas faire: docker volume rm stratum_pg_data) => cela détruirait les données
# Pour simuler perte, crée un volume clone puis restaure dedans (optionnel)
```
3. Restauration dans un container temporaire (exemple):
```
docker compose up -d postgres
cat /opt/stratum_backups/stratum_2025-10-05_01-00.dump | docker compose exec -T postgres pg_restore -U stratum -d stratum_db -c
```

---
## 8. Mise à jour sans risque

Workflow sûr:
```
# 1. Sauvegarde immédiate
./backup_stratum_pg.sh
# 2. Rebuild avec code à jour
git pull
docker compose build backend frontend
# 3. Arrêt propre (services seulement)
docker compose stop backend frontend
# 4. Migrations
docker compose up -d backend
docker compose exec backend npx prisma migrate deploy
# 5. Démarrage frontend
docker compose up -d frontend
# 6. Vérifications (logs + health)
docker compose logs --tail=50 backend
```

Rollback express (si bug):
```
git checkout <commit_precedent>
docker compose build backend frontend
docker compose up -d backend frontend
# Si migrations destructrices → restaurer dernière sauvegarde
./backup_stratum_pg.sh (déjà fait avant update) => pg_restore si besoin
```

---
## 9. Différences critiques entre commandes Docker

| Commande | Effet sur les données | Remarques |
|----------|-----------------------|-----------|
| `docker compose stop` | Ne touche pas aux volumes | Arrête containers (reprise rapide) |
| `docker compose down` | Ne supprime pas volumes nommés | Sauf si `-v` ajouté |
| `docker compose down -v` | SUPPRIME les volumes associés | À éviter sauf réinit contrôlée |
| `docker volume rm stratum_pg_data` | Détruit les données Postgres | Ne JAMAIS faire sans backup |
| `docker system prune` | N’affecte pas volumes par défaut | Ajoute `--volumes` = dangereux |

Règle d’or: Ne jamais utiliser `down -v` ou `volume rm` sans triple confirmation + backup testé.

---
## 10. Checklist anti-panique

- [ ] Sauvegarde la plus récente < 24h
- [ ] Script backup testé (`file size > 0`)
- [ ] Pas de commande destructive (`down -v`) utilisée récemment
- [ ] Volume `stratum_pg_data` présent (`docker volume ls`)
- [ ] Accès lecture dumps OK (`pg_restore --list` réussit)

---
## 11. FAQ Peurs fréquentes

| Peur | Réalité | Action rassurance |
|------|---------|-------------------|
| "Si un container crash je perds tout" | Volume séparé du container | Vérifier `docker volume ls` |
| "docker compose down va supprimer mes données" | Non, sauf `-v` | Retenir: `down -v` = danger |
| "Je ne verrai pas si le backup est corrompu" | `pg_restore --list` permet de valider | Intégrer test hebdomadaire |
| "Migration Prisma va casser la prod" | Prisma applique historique transactionnel | Backup avant, vérifier logs |
| "Je ne saurai pas restaurer" | Procédure simple `pg_restore` | Faire un test de restauration sur VM clone |

---
## 12. Variante: réutiliser Postgres existant (Approche A)

Modifie `docker-compose.yml` en supprimant le service `postgres`, ajuste `DATABASE_URL` pour pointer vers l’hôte:
```
DATABASE_URL=postgres://stratum:MotDePasseSolide!@host.docker.internal:5432/stratum_db?schema=public
```
Sur Linux sans `host.docker.internal`:
- Ajouter dans compose: `extra_hosts: ["host.docker.internal:172.17.0.1"]` (adapter gateway via `ip route | grep default`).

Sauvegardes restent gérées hors Docker (pg_dump système). Diminution de complexité.

---
## 13. Améliorations futures
- Ajouter service `watchtower` (mise à jour auto images) → Pas recommandé avant maturité.
- Ajout monitoring (Prometheus Postgres exporter + Grafana compose).
- Externaliser secrets via `.env` + `docker compose --env-file`.
- Intégrer Traefik ou Caddy pour TLS dynamique multi-services.

---
## 14. Résumé ultra-court (TL;DR)
```
# Cloner + construire
git clone ... && cd Stratum
docker compose build
# Lancer DB puis backend + migrations
docker compose up -d postgres
sleep 5 && docker compose up -d backend
docker compose exec backend npx prisma migrate deploy
# Seed si besoin
docker compose exec backend npm run db:seed
# Lancer frontend
docker compose up -d frontend
# Sauvegarde quotidienne
./backup_stratum_pg.sh (cron)
```

---
**Fin — Tu peux me demander maintenant de générer les Dockerfiles et compose directement dans le repo si tu veux passer de la doc à l’action.**

---
## 15. Nouveau: Fichier `.env` central

Un fichier `.env.example` est fourni. Copie-le en `.env`:
```
cp .env.example .env
```
Champs importants:
- Ports: `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`
- Secrets: `JWT_SECRET`, `POSTGRES_PASSWORD`
- Migrations auto: `AUTORUN_MIGRATIONS=true`
- API URL frontend: `NEXT_PUBLIC_API_URL`
- Profil nginx: activer via commande compose profil (pas de variable obligatoire)

Avantages de sortir les ports dans `.env`:
- Cohérence unique
- Simplifie le Makefile (pas de modifications croisées)
Inconvénient mineur: Rebuild rarement nécessaire si juste le port change (pour backend/frontend ça ne requiert pas rebuild, seulement restart compose).

## 16. Makefile
Exemples:
```
make build        # build images
make up           # démarre stack sans nginx
make up-all       # inclut profil nginx
make migrate      # applique migrations manuelles
make update       # pull + build + migrate + restart
make backup       # dump Postgres
make restore FILE=/opt/stratum_backups/stratum_2025-10-05_01-00.dump
```

## 17. Migrations automatiques – Explication
L'entrypoint exécute `prisma migrate deploy` (idempotent). Les migrations Prisma:
- S'exécutent dans l'ordre
- Ne réappliquent pas ce qui est déjà appliqué
- Échouent si divergence (sécurité). Dans ce cas les logs afficheront l'erreur avant de démarrer l'app.
Avantage: plus d'oubli de migration après un `git pull`.
Si tu veux désactiver: `AUTORUN_MIGRATIONS=false` dans `.env` puis rebuild/restart backend.

## 18. Nginx embarqué optionnel
Utilise un profil compose `nginx` (désactivé par défaut) pour laisser la liberté d'un reverse proxy externe existant.
Activation:
```
docker compose --profile nginx up -d
```
Certificats montés via variables chemin `NGINX_CERT_PATH` / `NGINX_KEY_PATH` dans `.env`.

## 19. Stratégie Ports dans .env
Placer les ports dans `.env` est acceptable: ils ne sont pas secrets et évitent les conflits si plusieurs instances.
Juste ne mets pas de secrets critiques dans un repo public (renommer `.env.example` sans valeurs sensibles). Le vrai `.env` reste ignoré par git si `.gitignore` contient `.env` (à vérifier et ajouter sinon).

---
Fin des ajouts récents.
