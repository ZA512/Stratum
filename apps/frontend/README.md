# Stratum Frontend

Application Next.js (App Router) qui consomme l API du backend NestJS. L objectif est de proposer la navigation fractale (breadcrumb), la gestion des equipes et le pilotage des boards.

## Composant TaskCard

Un composant de carte de tâche Kanban réutilisable (`src/components/task/task-card.tsx`).

Props principales:
- `id`: identifiant numérique ou string (affiché sous forme `#id`).
- `priority`: `Low | Medium | High | Critical` (badge couleur).
- `title`: titre de la tâche.
- `description?`: texte (masqué automatiquement en variant `compact`).
- `assignees`: tableau `{ id, initials, color? }` (pile d avatars, max 4 + compteur).
- `lateness?`: nombre; négatif = retard (badge rouge), positif/zero = badge vert.
- `complexity?`: label (ex: `XL`).
- `fractalPath?`: chaîne `4.0.0.1` affichée en monospaced.
- `href?` / `onClick?`: rend la carte cliquable (ancre absolue overlay + focus ring).
- `variant?`: `default` (défaut) ou `compact` (moins de padding, description cachée).

Exemple d usage:
```tsx
import { TaskCard } from '@/components/task/task-card';

<TaskCard
  id={152}
  priority="Medium"
  title="Analyser les dépendances critiques"
  description="Identifier les boucles potentielles dans le graphe fractal.d"
  assignees={[{ id: 'u1', initials: 'AR' }]}
  lateness={-6}
  complexity="XL"
  fractalPath="4.0.0.1"
  href="#"
/>
```

Astuce: passer `variant="compact"` pour les colonnes très denses.

### Intégration sous-tâches
Les sous-tâches dans le drawer utilisent maintenant `NodeSubtaskCard` qui enveloppe `TaskCard` (variant `compact`).
Fichier: `src/features/nodes/task-drawer/NodeSubtaskCard.tsx`.
Le mapping est minimal (pas encore de priorité réelle) – adapter lorsque l'API exposera ces champs.

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

Le frontend attend la variable NEXT_PUBLIC_API_URL (default: http://localhost:3000/api/v1). Creez un fichier .env.local a la racine de \apps/frontend si vous devez cibler un autre backend.

## Authentification demo

Le formulaire pre-remplit les identifiants injectes par 
pm run db:seed dans le backend : \alice@stratum.dev / stratum.

## Etapes suivantes

- Integrer les listes de boards et les noeuds detaillees via les endpoints /boards et /nodes.
- Brancher les flux temps reel (Socket.io ou WebSocket) pour les mises a jour du kanban.
- Couvrir les parcours clefs par des tests Playwright ou Cypress.
