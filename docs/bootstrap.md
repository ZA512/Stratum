## Bootstrap initial de l'espace

Objectif: lorsqu'un nouvel utilisateur se connecte et n'appartient à aucune équipe, on crée automatiquement un espace de travail minimal (team + board racine + colonnes par défaut + root node) pour éviter l'écran vide.

### Flux côté backend

Endpoint: `POST /api/v1/teams/bootstrap`

Service: `TeamsService.bootstrapForUser(userId)`

Étapes (transaction Prisma):
1. Vérifie si l'utilisateur a déjà une équipe (membership actif). Si oui retourne la première (idempotence).
2. Crée team + membership OWNER.
3. Crée un node racine de type SIMPLE puis le promeut en COMPLEX après création du board.
4. Crée un board attaché à ce node.
5. S'assure que les 4 behaviors (BACKLOG, IN_PROGRESS, BLOCKED, DONE) existent pour le board.
6. Crée les colonnes par défaut si absentes.
7. Retourne `{ team, rootNodeId, boardId }`.

### Flux côté frontend

Fichier: `src/app/page.tsx`

1. Charge les équipes (`fetchTeams`).
2. Si tableau vide et pas encore tenté: appelle `bootstrapTeams()`.
3. Après succès: refetch des teams (TODO: possible redirection automatique sur le board à venir).
4. En échec: affiche l'erreur et propose un bouton manuel pour réessayer.

### Configuration des ports

Pour éviter un conflit avec Next.js (port 3000), le backend Nest écoute maintenant par défaut sur `4001` (voir `apps/backend/src/main.ts`).

Frontend lit l'URL API via `NEXT_PUBLIC_API_URL` dans `.env.local` (actuellement `http://localhost:4001/api/v1`).

Changer de port:

```
# apps/backend/.env (à créer éventuellement)
PORT=5000

# apps/frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

### Améliorations futures

- Rediriger automatiquement l'utilisateur vers la page du board nouvellement créé.
- Toast de confirmation / onboarding (quick tips).
- Tests e2e pour vérifier l'idempotence de l'endpoint bootstrap.
- Bouton "Créer une nouvelle équipe" pour multi-espaces.

---
Dernière mise à jour: 2025-09-23