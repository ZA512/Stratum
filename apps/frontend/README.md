# Stratum Frontend

Application Next.js (App Router) qui consomme l API du backend NestJS. L objectif est de proposer la navigation fractale (breadcrumb), la gestion des equipes et le pilotage des boards.

## Scripts utiles

- 
pm run dev : lance le serveur Next en mode developpement.
- 
pm run build : construit la version production.
- 
pm run start : demarre la version construite.
- 
pm run lint : verifie les regles ESLint.

Depuis la racine du monorepo, vous pouvez egalement lancer 
pm run dev:frontend pour prelever les scripts de workspace.

## Configuration

Le frontend attend la variable NEXT_PUBLIC_API_URL (default: http://localhost:3000/api/v1). Creez un fichier .env.local a la racine de pps/frontend si vous devez cibler un autre backend.

## Authentification demo

Le formulaire pre-remplit les identifiants injectes par 
pm run db:seed dans le backend : lice@stratum.dev / stratum.

## Etapes suivantes

- Integrer les listes de boards et les noeuds detaillees via les endpoints /boards et /nodes.
- Brancher les flux temps reel (Socket.io ou WebSocket) pour les mises a jour du kanban.
- Couvrir les parcours clefs par des tests Playwright ou Cypress.
