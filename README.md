<div align="center">

# Stratum

### Le Kanban fractal — chaque tâche peut devenir un projet

*Décomposez infiniment. Gardez le contrôle. Pilotez par l'IA.*

[![Alpha](https://img.shields.io/badge/statut-alpha-orange)](#)
[![NestJS](https://img.shields.io/badge/backend-NestJS-red)](#)
[![Next.js](https://img.shields.io/badge/frontend-Next.js%2015-black)](#)
[![License](https://img.shields.io/badge/licence-MIT-blue)](#)

</div>

---

## Qu'est-ce que Stratum ?

Stratum est une plateforme de gestion de projet fondée sur un concept radical : **le Kanban fractal**. Toute tâche peut, à tout moment, être transformée en un Kanban complet à part entière — qui lui-même contiendra des tâches transformables en Kanbans, et ainsi de suite, à l'infini.

Fini les outils qui forcent à choisir entre la vue d'ensemble et le détail. Avec Stratum, vous zoomez, vous dézoomez, vous naviguez dans la profondeur de vos projets sans jamais perdre le fil.

---

## Le Kanban fractal, concrètement

Dans Stratum, tout est un **nœud**. Un nœud peut être :

| Type | Description | Indicateur visuel |
|------|-------------|-------------------|
| **Tâche simple** | Carte classique avec description, assignation, dates | Carte épurée |
| **Tâche moyenne** | Carte avec liste de sous-tâches intégrée | `(3/7)` — progression de la checklist |
| **Tâche complexe** | Carte transformée en Kanban complet | `[2·0·1·5]` — nombre de tâches par colonne |

Un clic sur une tâche complexe ouvre son Kanban enfant. Chaque Kanban enfant peut contenir ses propres tâches complexes. La profondeur est illimitée.

Un fil d'Ariane contextuel vous permet de naviguer dans la hiérarchie sans jamais vous perdre.

---

## Quatre vues, une seule vérité

Toutes les vues partagent la même donnée. Passez de l'une à l'autre en un clic sans perdre votre contexte.

### Kanban

La vue classique, enrichie. Colonnes configurables, comportements métier associés (Backlog, En cours, Bloqué, Terminé), indicateurs fractals sur chaque carte.

![Vue Kanban](captures/Screenshot_kanban_1.png)

![Vue Kanban détail](captures/Screenshot_kanban_2.png)

### Liste

Filtrez, triez, recherchez à travers toute la hiérarchie de vos projets. Idéal pour retrouver une tâche précise ou faire une revue rapide.

![Vue Liste](captures/Screenshot_liste.png)

### Timeline (Gantt)

Visualisez les dépendances entre tâches, planifiez les enchaînements, identifiez le chemin critique. Les liens de dépendance se créent directement depuis les cartes.

![Vue Timeline](captures/Screenshot_timeline.png)

### Mindmap

Une carte heuristique radiale générée automatiquement à partir de la structure de votre projet. Visualisez l'amplitude d'un sous-arbre d'un seul regard, identifiez les branches déséquilibrées, naviguez en double-cliquant sur un nœud.

---

## Piloté par l'IA

Stratum intègre une couche IA conçue pour **agir**, pas seulement suggérer.

- **Quick Notes IA** — Capturez une idée en langage naturel, l'IA la structure et la place dans le bon contexte.
- **Agent de commande** — Demandez à l'IA de créer des tâches, déplacer des cartes, réorganiser un board. Chaque proposition est soumise à votre validation avant exécution.
- **Agent exploratoire** — Interrogez votre projet en langage naturel ("Quelles tâches sont bloquées depuis plus de 3 jours ?").
- **Multi-providers** — Compatible OpenAI, Anthropic, Mistral, Gemini, Ollama (local) ou mode heuristique sans clé API.

---

## Dashboards & observabilité projet

Des tableaux de bord analytiques calculés en temps réel sur vos boards :

- **Score de santé** — indicateur synthétique de l'état d'un projet.
- **Burnup & prévision** — courbe d'avancement et date de fin estimée.
- **Throughput & débit** — mesure de la vélocité de l'équipe.
- **Tâches bloquées, en retard, vieillissantes** — alertes proactives.
- **Priorités & actions requises** — ce qui demande votre attention maintenant.

---

## Collaboration d'équipe

- Invitations par email ou lien sécurisé.
- Gouvernance partagée — pas de propriétaire unique sur les équipes.
- Rôles RACI avec **héritage automatique** dans la hiérarchie (et possibilité de casser l'héritage nœud par nœud).
- **Partage de tâches** entre équipes différentes.
- Activité en temps réel via WebSocket.
- **Automation** — rappels automatiques sur les tâches bloquées, expiration du backlog, revalidation périodique.

---

## Filtres avancés

Combinez plusieurs critères : statut, assigné, date, priorité, type de tâche, profondeur hiérarchique. Les filtres s'appliquent sur toutes les vues simultanément.

![Filtres](captures/Screenshot_filter.png)

---

## Fiche technique

| Composant | Technologie |
|-----------|-------------|
| Backend | NestJS + Prisma + PostgreSQL |
| Frontend | Next.js 15 (App Router) + Tailwind CSS |
| Temps réel | Socket.IO |
| Jobs asynchrones | BullMQ + Redis |
| Auth | JWT (access 15min + refresh 90j) |
| IA | OpenAI / Anthropic / Mistral / Gemini / Ollama |
| Observabilité | Prometheus + Grafana |
| Déploiement | Docker Compose, Ubuntu, Unraid |

---

## Installation

### Méthode 1 — Docker Compose (recommandée)

La méthode la plus rapide pour un déploiement auto-hébergé.

**Prérequis :** Docker + Docker Compose

```bash
# Cloner le dépôt
git clone https://github.com/ZA512/Stratum.git
cd Stratum

# Configurer l'environnement
cp .env.example .env
# Éditer .env : renseigner POSTGRES_PASSWORD, JWT_SECRET, NEXT_PUBLIC_API_URL
nano .env

# Lancer tous les services
docker compose up -d

# Vérifier l'état
docker compose ps
docker compose logs -f backend
```

L'application est accessible sur `http://localhost:3000`.  
L'API et sa documentation Swagger sont sur `http://localhost:4001/api/v1` et `http://localhost:4001/docs`.

Les migrations Prisma sont appliquées automatiquement au démarrage (`AUTORUN_MIGRATIONS=true`).

**Commandes utiles (via Makefile) :**

```bash
make up          # Démarrer les services
make down        # Arrêter les services
make logs        # Suivre les logs
make migrate     # Appliquer les migrations manuellement
make seed        # Charger les données de démo
make backup      # Sauvegarder la base de données
make shell-db    # Ouvrir psql
```

---

### Méthode 2 — Unraid (images pré-construites, sans code source)

Idéal pour un NAS Unraid, sans avoir à compiler quoi que ce soit.

```bash
# Sur votre Unraid en SSH
mkdir -p /mnt/user/appdata/stratum
cd /mnt/user/appdata/stratum

# Télécharger les fichiers de configuration
curl -o docker-compose.yml https://raw.githubusercontent.com/ZA512/Stratum/main/docker-compose.prod.yml
curl -o .env https://raw.githubusercontent.com/ZA512/Stratum/main/.env.unraid.example

# Configurer
nano .env
# → POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGINS (votre domaine)

# Lancer
docker compose up -d
```

Les images sont téléchargées automatiquement depuis GitHub Container Registry (`ghcr.io/za512/stratum-*`).

Pour plus de détails : [docs/UNRAID_DEPLOY.md](docs/UNRAID_DEPLOY.md)

---

### Méthode 3 — Ubuntu natif (Node.js + PostgreSQL + Nginx)

Pour un serveur dédié avec contrôle maximal.

**Prérequis :** Node.js 20+, npm 10+, PostgreSQL 14+, Nginx

```bash
# 1. Cloner et installer les dépendances
git clone https://github.com/ZA512/Stratum.git
cd Stratum
npm install

# 2. Configurer la base de données
sudo -u postgres psql -c "CREATE ROLE stratum WITH LOGIN PASSWORD 'MotDePasseSolide!';"
sudo -u postgres psql -c "CREATE DATABASE stratum_db OWNER stratum;"

# 3. Configurer le backend
cd apps/backend
cp .env.example .env
# → DATABASE_URL, JWT_SECRET, REDIS_URL, variables mail
nano .env

# 4. Appliquer les migrations et le seed de démo
npm run prisma:generate
npm run prisma:migrate
npm run db:seed

# 5. Construire les applications
cd ../..
npm run build:backend
npm run build:frontend

# 6. Démarrer (en production, utiliser PM2 ou systemd)
npm run dev:backend   # ou: node apps/backend/dist/main.js
npm run dev:frontend  # ou: next start apps/frontend
```

Pour la configuration Nginx, SSL Let's Encrypt et les services systemd : [docs/INSTALL_UBUNTU.md](docs/INSTALL_UBUNTU.md)

---

### Méthode 4 — Développement local

```bash
git clone https://github.com/ZA512/Stratum.git
cd Stratum

# Démarrer PostgreSQL et Redis via Docker
docker compose -f docker-compose.dev-services.yml up -d

# Installer les dépendances
npm install

# Configurer le backend
cd apps/backend
cp .env.example .env
# DATABASE_URL=postgres://stratum:stratum@localhost:5432/stratum_db?schema=stratum
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
cd ../..

# Lancer en développement
npm run dev:backend   # http://localhost:4001
npm run dev:frontend  # http://localhost:3000
```

---

## Variables d'environnement essentielles

| Variable | Description | Exemple |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL | `MonMotDePasse!` |
| `JWT_SECRET` | Clé secrète JWT (min. 32 caractères) | `openssl rand -base64 32` |
| `NEXT_PUBLIC_API_URL` | URL publique de l'API | `http://localhost:4001/api/v1` |
| `CORS_ORIGINS` | Origines autorisées (CORS) | `https://stratum.mondomaine.com` |
| `AI_PROVIDER` | Provider IA | `openai`, `anthropic`, `ollama`, `heuristic` |
| `AI_API_KEY` | Clé API du provider IA | *(laisser vide pour heuristic/ollama)* |

Voir [.env.example](.env.example) pour la liste complète.

---

## Structure du monorepo

```
Stratum/
├── apps/
│   ├── backend/          # API NestJS (Auth, Teams, Boards, Nodes, Dashboards, IA)
│   └── frontend/         # Next.js 15 App Router + Tailwind
├── packages/             # Typages et utilitaires partagés (à venir)
├── docs/                 # Architecture, PRD, devbooks, CDC
├── docker/               # Dockerfiles multi-stage
├── captures/             # Captures d'écran
└── docker-compose.yml    # Compose principal (dev + build)
```

---

<div align="center">

**Stratum** — Gérez la complexité sans la subir.

</div>
