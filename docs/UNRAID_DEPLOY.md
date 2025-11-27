# Guide de déploiement Stratum sur Unraid

## Méthode recommandée : Docker Compose

La méthode la plus simple est d'utiliser Docker Compose sur Unraid. **Vous n'avez pas besoin du code source**, seulement des fichiers de configuration.

### Étape 1 : Préparer le dossier sur Unraid

Connectez-vous en SSH à votre Unraid et créez le dossier :

```bash
mkdir -p /mnt/user/appdata/stratum
cd /mnt/user/appdata/stratum
```

### Étape 2 : Télécharger les fichiers de configuration

```bash
# Télécharger docker-compose.prod.yml
curl -o docker-compose.yml https://raw.githubusercontent.com/ZA512/Stratum/main/docker-compose.prod.yml

# Télécharger le template .env
curl -o .env https://raw.githubusercontent.com/ZA512/Stratum/main/.env.unraid.example
```

### Étape 3 : Configurer le fichier .env

Éditez le fichier `.env` :

```bash
nano .env
```

**Variables à modifier obligatoirement :**
- `POSTGRES_PASSWORD` : Un mot de passe sécurisé pour PostgreSQL
- `JWT_SECRET` : Une clé secrète d'au moins 32 caractères (générer avec `openssl rand -base64 32`)
- `CORS_ORIGINS` : L'URL de votre domaine (ex: `https://stratum.mondomaine.com`)

### Étape 4 : Lancer Stratum

```bash
cd /mnt/user/appdata/stratum
docker-compose up -d
```

### Étape 5 : Vérifier que tout fonctionne

```bash
# Voir les logs
docker-compose logs -f

# Vérifier l'état des conteneurs
docker-compose ps
```

Accédez à `http://192.168.1.59:3000` pour voir le frontend.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Reverse Proxy (SWAG/Nginx)                   │
│                    stratum.votredomaine.com                     │
├──────────────────────────┬──────────────────────────────────────┤
│        Frontend          │              Backend                 │
│   stratum.domain.com     │   stratum.domain.com/api/v1/*        │
│   ou app.stratum.domain  │   ou api.stratum.domain              │
└──────────────────────────┴──────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────┐      ┌─────────────────────┐
│  stratum-frontend   │      │  stratum-backend    │
│  192.168.1.59:3000  │ ───► │  192.168.1.59:4001  │
└─────────────────────┘      └─────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
             ┌────────────┐     ┌───────────┐
             │ PostgreSQL │     │   Redis   │
             │    :5432   │     │   :6379   │
             └────────────┘     └───────────┘
```

## Commandes utiles

```bash
# Démarrer
docker-compose up -d

# Arrêter
docker-compose down

# Voir les logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Mettre à jour les images
docker-compose pull
docker-compose up -d

# Redémarrer un service
docker-compose restart backend
```

---

## Méthode alternative : Conteneurs individuels

Si vous préférez installer chaque conteneur manuellement via l'interface Unraid :

## Variables d'environnement requises

### Backend (`ghcr.io/za512/stratum-backend:latest`)

| Variable | Requis | Exemple | Description |
|----------|--------|---------|-------------|
| `DATABASE_URL` | ✅ | `postgres://user:pass@192.168.1.59:5432/stratum?schema=public` | URL de connexion PostgreSQL |
| `REDIS_URL` | ✅ | `redis://192.168.1.59:6379` | URL de connexion Redis |
| `JWT_SECRET` | ✅ | `votre-secret-jwt-32-caracteres` | Clé secrète pour les tokens JWT (min 32 chars) |
| `PORT` | ❌ | `4001` | Port d'écoute (défaut: 4001) |
| `CORS_ORIGINS` | ❌ | `https://stratum.domain.com,https://app.domain.com` | Origines autorisées (séparées par virgules) |
| `AUTORUN_MIGRATIONS` | ❌ | `true` | Exécuter les migrations au démarrage |

### Frontend (`ghcr.io/za512/stratum-frontend:latest`)

| Variable | Requis | Exemple | Description |
|----------|--------|---------|-------------|
| `BACKEND_INTERNAL_URL` | ✅ | `http://192.168.1.59:4001` | URL interne du backend (pour SSR) |
| `PORT` | ❌ | `3000` | Port d'écoute (défaut: 3000) |
| `HOSTNAME` | ❌ | `0.0.0.0` | Hostname d'écoute (défaut: 0.0.0.0) |

## Configuration Unraid (méthode manuelle)

### 1. Backend Container

**Docker Hub Repository:** `ghcr.io/za512/stratum-backend:latest`

```
Network Type: Bridge
Port Mappings:
  Container Port: 4001 → Host Port: 4001

Environment Variables:
  DATABASE_URL=postgres://stratum:votremotdepasse@192.168.1.59:5432/stratum?schema=public
  REDIS_URL=redis://192.168.1.59:6379
  JWT_SECRET=votre-secret-jwt-minimum-32-caracteres-securise
  CORS_ORIGINS=https://stratum.votredomaine.com
  AUTORUN_MIGRATIONS=true
```

### 2. Frontend Container

**Docker Hub Repository:** `ghcr.io/za512/stratum-frontend:latest`

```
Network Type: Bridge
Port Mappings:
  Container Port: 3000 → Host Port: 3000

Environment Variables:
  BACKEND_INTERNAL_URL=http://192.168.1.59:4001
```

## Configuration Reverse Proxy (SWAG/Nginx Proxy Manager)

### Option A: Même domaine avec path `/api/v1`

Configuration Nginx pour `stratum.votredomaine.com`:

```nginx
server {
    listen 443 ssl http2;
    server_name stratum.votredomaine.com;
    
    # SSL config...
    
    # API Backend - proxy vers /api/v1/*
    location /api/v1/ {
        proxy_pass http://192.168.1.59:4001/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Swagger docs
    location /docs {
        proxy_pass http://192.168.1.59:4001/docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Frontend - tout le reste
    location / {
        proxy_pass http://192.168.1.59:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option B: Sous-domaines séparés

- `app.stratum.domain.com` → Frontend (192.168.1.59:3000)
- `api.stratum.domain.com` → Backend (192.168.1.59:4001)

Dans ce cas, configurez le frontend avec:
```
NEXT_PUBLIC_API_URL=https://api.stratum.domain.com/api/v1
```

Et le backend avec:
```
CORS_ORIGINS=https://app.stratum.domain.com
```

## Ports exposés

| Service | Port interne | Port recommandé Unraid |
|---------|--------------|------------------------|
| Backend | 4001 | 4001 |
| Frontend | 3000 | 3000 |
| PostgreSQL | 5432 | 5432 |
| Redis | 6379 | 6379 |

## Healthchecks

- **Backend:** `http://192.168.1.59:4001/health`
- **Frontend:** `http://192.168.1.59:3000`

## Troubleshooting

### Le frontend ne peut pas atteindre le backend

1. Vérifiez que `BACKEND_INTERNAL_URL` est correctement configuré
2. Vérifiez que `CORS_ORIGINS` inclut votre domaine frontend
3. Testez directement: `curl http://192.168.1.59:4001/health`

### Erreur CORS

Ajoutez votre domaine frontend à `CORS_ORIGINS` du backend:
```
CORS_ORIGINS=https://stratum.domain.com,http://localhost:3000
```

### Base de données non accessible

Vérifiez que PostgreSQL accepte les connexions depuis le conteneur backend:
- Vérifiez `pg_hba.conf` pour autoriser l'IP du backend
- Vérifiez que le port 5432 est accessible
