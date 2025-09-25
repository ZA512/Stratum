## Règles Kanban (Paradigme implicite)

Dernière mise à jour: 2025-09-23

### 1. Principe général
Chaque entrée (Node) est une tâche. Elle devient implicitement un "mini‑kanban" dès qu'une première sous‑tâche est créée. Aucun type explicite (SIMPLE / MEDIUM / COMPLEX) n'est désormais exposé à l'utilisateur.

### 2. Board implicite
- Lors de la création d'une première sous‑tâche pour un Node sans board, le backend crée automatiquement:
  1. Un Board (1‑1 avec le Node parent).
  2. Les 4 comportements de colonne standards (BACKLOG, IN_PROGRESS, BLOCKED, DONE) s'ils n'existent pas déjà dans l'équipe.
  3. Les 4 colonnes par défaut (Backlog, En cours, Bloqué, Terminé) avec positions 0..3.
- Idempotent: ré-appeler la création de sous‑tâche n'instancie pas plusieurs boards.

### 3. Conversion (legacy) dépréciée
`POST /nodes/:id/convert` n'effectue plus de transformation de type: il appelle simplement l'auto-création du board (ensureBoard) et sera supprimé en Phase 3.

### 4. Sous‑tâches
- Stockées en tant que Nodes enfants avec `parentId = id du parent` et `columnId` pointant vers une colonne du board parent.
- Le statut d'une sous‑tâche est dérivé du `behaviorKey` de sa colonne.
- Ajout: position calculée comme (max position dans la colonne + 1).

### 5. Colonnes & comportements
- Comportements standard fixes: BACKLOG, IN_PROGRESS, BLOCKED, DONE (clé + label + couleur par défaut).
- WIP (Work In Progress limit) stocké sur la colonne (optionnel). Enforcement backend à venir (todo #6).
- Une colonne DONE permet le marquage terminé; déplacer/rebasculer une sous‑tâche alterne entre BACKLOG et DONE dans `toggleChildDone`.

### 6. Résumés & métriques
- `GET /nodes/:id/detail` fournit `summary.counts` + board + enfants.
- `GET /nodes/:id/summary` (léger) renvoie uniquement `{ id, hasBoard, counts }`.
- Cycle time stocké dans `statusMetadata` des sous-tâches:
  - `startedAt`: première entrée dans une colonne IN_PROGRESS (ou fallback si passage direct à DONE).
  - `doneAt`: première entrée dans une colonne DONE (non écrasé si retour BACKLOG / IN_PROGRESS).
  - `firstMovedAt`: première transition depuis la création (utilisé pour lead time éventuel).
  - (Futur) `lastColumnChangeAt` possible pour calculs plus poussés.

### 7. Sécurité & intégrité
- Vérification membership ACTIVE (`ensureUserCanWrite`) sur chaque mutation.
- Les mouvements vérifient que la colonne cible appartient bien au même board (via ensureBoardWithColumns).
- TODO sécurité (#17 initial global list) : renforcer validation cross-team sur moveChild (actuellement implicite via parent/teamId).

### 8. Reorder & move
- `reorderChildren` met à jour l'ordre (position) strict d'une seule colonne.
- `moveChildNode` gère changement de colonne + repositionnement.
- Stratégie: réindexation entière pour garantir densité des positions (entiers 0..n).
- TODO futur: batch operations & positions fractionnaires si besoin d'éviter réindexations massives.

### 9. UI (résumé)
- Plus de bouton "Convertir".
- Drawer affiche section Sous‑tâches si un board est déjà créé (ou message d’état vide sinon — amélioration à venir).
- Clic sur une carte ouvre le Drawer (focus accessible, TODO: trap focus / navig clavier).

### 10. Tests recommandés
1. Création première sous‑tâche → board + colonnes présents (4 colonnes).
2. Deuxième sous‑tâche → pas de doublon colonnes.
3. toggleChildDone → déplacement entre BACKLOG et DONE.
4. moveChildNode inter‑colonnes → positions re-numérotées proprement.
5. reorderChildren cohérent (vérifier intégrité liste).
6. convert (legacy) sur node déjà boardé → no-op.

### 11. Roadmap phases
- Phase 1 (DONE): Implémentation board implicite, suppression UI conversion.
- Phase 2 (option): Migration schema Prisma — suppression `NodeType` & attribut `type`.
- Phase 3: Retrait endpoint convert et nettoyage final des DTO liés.

### 12. Schéma technique simplifié (actuel)
Node (root / task)
 └── Board (optionnel, 1‑1)
      ├── Column BACKLOG
      ├── Column IN_PROGRESS
      ├── Column BLOCKED
      └── Column DONE
        └── Child Nodes (sous‑tâches) avec columnId référent

### 13. Décisions encore ouvertes
| Sujet | Décision à prendre |
|-------|--------------------|
| Enforcement WIP | Rejeter création/move si limite atteinte (409) |
| startedAt/doneAt | Implémenté (cycle time basique) |
| Suppression NodeType | Confirmer bénéfices vs coût migration |
| Endpoint summary léger | Ajouter route `/nodes/:id/summary` pour éviter detail complet |
| Accessibilité advanced | Focus trap Drawer + navigation clavier DnD |

### 14. Glossaire
- ensureBoard: procédure transactionnelle garantissant l'existence du board + colonnes standard.
- behaviorKey: sémantique de statut portée par la colonne.
- snapshot stack (frontend): pile d'états pour rollback optimiste.

---
Pour toute modification majeure, mettre à jour cette page et référencer dans les PRs.