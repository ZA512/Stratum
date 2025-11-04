# DevBook : Système de Journal d'Activité (Activity Log)

## 🎯 Objectif

Enregistrer automatiquement toutes les actions effectuées sur les tâches pour permettre un suivi collaboratif et un audit complet.

## 📋 Concept

### Principe
- **Chaque action** sur une tâche génère un log
- **Limite** : 20 logs max par tâche (configurable via `.env`)
- **Suppression automatique** des logs les plus anciens quand limite dépassée
- **Cascade** : Si tâche supprimée → logs supprimés

### Types d'Activités Trackés

```typescript
enum ActivityType {
  NODE_CREATED              // Tâche créée
  NODE_UPDATED              // Tâche mise à jour (générique)
  NODE_MOVED                // Déplacée de colonne
  NODE_DELETED              // Supprimée
  NODE_ARCHIVED             // Archivée
  NODE_RESTORED             // Restaurée depuis archives
  NODE_SNOOZED              // Mise en snooze
  NODE_UNSNOOZED            // Sortie du snooze
  COLLABORATOR_ADDED        // Collaborateur ajouté
  COLLABORATOR_REMOVED      // Collaborateur retiré
  INVITATION_SENT           // Invitation envoyée
  INVITATION_ACCEPTED       // Invitation acceptée
  INVITATION_DECLINED       // Invitation refusée
  COMMENT_ADDED             // Commentaire ajouté
  DESCRIPTION_UPDATED       // Description modifiée
  TITLE_UPDATED             // Titre modifié
  DUE_DATE_UPDATED          // Date d'échéance modifiée
  PRIORITY_UPDATED          // Priorité modifiée
  EFFORT_UPDATED            // Effort estimé modifié
  TAGS_UPDATED              // Tags modifiés
  ASSIGNEES_UPDATED         // Assignés modifiés
  MOVED_TO_BOARD            // Déplacée vers un autre kanban
  PROGRESS_UPDATED          // Progression modifiée
  BLOCKED_STATUS_CHANGED    // Statut bloqué modifié
  RACI_UPDATED              // RACI modifié
}
```

### Structure de Log

```typescript
{
  id: "log_abc123",
  nodeId: "node_xyz789",
  userId: "user_alice",
  type: "NODE_MOVED",
  metadata: {
    fromColumnId: "col_1",
    toColumnId: "col_2",
    fromColumnName: "EN COURS",
    toColumnName: "DONE"
  },
  createdAt: "2025-10-18T12:34:56.789Z"
}
```

## 📐 Architecture

### Backend

#### 1. **Table Prisma**
```prisma
model ActivityLog {
  id         String       @id @default(cuid())
  nodeId     String
  userId     String
  type       ActivityType
  metadata   Json?        // Données contextuelles
  createdAt  DateTime     @default(now())

  node       Node         @relation(onDelete: Cascade)
  user       User         @relation(onDelete: Cascade)

  @@index([nodeId, createdAt])
}
```

#### 2. **Service Activity**
- `logActivity(nodeId, userId, type, metadata)` : Enregistre + nettoie
- `getBoardActivity(boardId, limit)` : Récupère logs du board
- `getNodeActivity(nodeId)` : Récupère logs d'une tâche
- `getTodayActivityCount(boardId)` : Compte logs du jour

#### 3. **Endpoints API**
```
GET /activity/boards/:boardId        → Liste des logs du board
GET /activity/boards/:boardId/stats  → Compteur du jour
GET /activity/nodes/:nodeId          → Liste des logs d'une tâche
```

### Frontend

#### 1. **Badge avec Compteur**
```tsx
<button onClick={openActivityPanel}>
  <span className="material-symbols-outlined">history</span>
  {todayCount > 0 && <span className="badge">{todayCount}</span>}
</button>
```

#### 2. **Panel Coulissant**
```tsx
<ActivityPanel boardId={boardId} />

// Affiche :
// 📅 Aujourd'hui (12)
//   🕐 Il y a 2 min
//   👤 Alice a déplacé la tâche #34 de EN COURS vers DONE
//   
//   🕐 Il y a 15 min
//   👤 Bob a modifié la description de la tâche #35
```

#### 3. **i18n Messages**
```json
{
  "activity": {
    "NODE_MOVED": "{{user}} a déplacé la tâche #{{nodeShortId}} de {{fromColumn}} vers {{toColumn}}",
    "DESCRIPTION_UPDATED": "{{user}} a modifié la description de la tâche #{{nodeShortId}}",
    "INVITATION_SENT": "{{user}} a envoyé une invitation à {{inviteeEmail}} sur la tâche #{{nodeShortId}}",
    // ...
  }
}
```

## 🔧 Tâches d'Implémentation

### ✅ Phase 1 : Infrastructure Backend (FAIT)
- [x] **T1.1** : Ajouter enum `ActivityType` dans schema.prisma
- [x] **T1.2** : Créer table `ActivityLog` avec relations
- [x] **T1.3** : Générer migration Prisma
- [x] **T1.4** : Créer `ActivityService` avec logActivity + cleanup automatique
- [x] **T1.5** : Créer `ActivityController` avec 3 endpoints
- [x] **T1.6** : Créer `ActivityModule` et l'ajouter à AppModule
- [x] **T1.7** : Ajouter `MAX_ACTIVITY_LOGS_PER_NODE` dans .env.example
- [x] **T1.8** : Créer DTOs (ActivityLogDto, BoardActivityStatsDto)

### ✅ Phase 2 : Intégration dans NodesService (21/25 types loggés)
- [x] **T2.1** : Injecter ActivityService dans NodesService
- [x] **T2.2** : Logger NODE_CREATED dans createNode
- [x] **T2.3** : Logger NODE_MOVED dans moveChildNode
- [x] **T2.4** : Logger NODE_MOVED dans moveSharedNodePlacement
- [x] **T2.5** : Logger MOVED_TO_BOARD dans moveNodeToBoard
- [ ] **T2.6** : Logger NODE_DELETED dans deleteNode *(non applicable - cascade delete DB)*
- [x] **T2.7** : Logger NODE_ARCHIVED dans updateNode (archivedAt)
- [x] **T2.8** : Logger NODE_RESTORED dans restoreNode
- [ ] **T2.9** : Logger NODE_SNOOZED/UNSNOOZED *(non implémenté - fonctionnalité snooze absente)*
- [x] **T2.10** : Logger TITLE_UPDATED dans updateNode (si title change)
- [x] **T2.11** : Logger DESCRIPTION_UPDATED dans updateNode (si description change)
- [x] **T2.12** : Logger DUE_DATE_UPDATED dans updateNode (si dueAt change)
- [x] **T2.13** : Logger PRIORITY_UPDATED dans updateNode (si priority change)
- [x] **T2.14** : Logger EFFORT_UPDATED dans updateNode (si effort change)
- [x] **T2.15** : Logger TAGS_UPDATED dans updateNode (si tags change)
- [x] **T2.16** : Logger PROGRESS_UPDATED dans updateNode (si progress change)
- [x] **T2.17** : Logger BLOCKED_STATUS_CHANGED dans updateNode (si blockedReason change)
- [ ] **T2.18** : Logger ASSIGNEES_UPDATED *(pas d'endpoint direct d'update assignés)*
- [x] **T2.19** : Logger RACI_UPDATED quand RACI change
- [x] **T2.20** : Logger COLLABORATOR_ADDED dans acceptNodeShareInvitation
- [x] **T2.21** : Logger COLLABORATOR_REMOVED dans removeNodeCollaborator
- [x] **T2.22** : Logger INVITATION_SENT dans addNodeCollaborator
- [x] **T2.23** : Logger INVITATION_ACCEPTED dans acceptNodeShareInvitation
- [x] **T2.24** : Logger INVITATION_DECLINED dans declineNodeShareInvitation
- [x] **T2.25** : Logger COMMENT_ADDED dans createNodeComment

### ✅ Phase 3 : Frontend - API Client
- [x] **T3.1** : Créer `activity-api.ts` avec fetchBoardActivity, fetchBoardActivityStats, fetchNodeActivity
- [x] **T3.2** : Créer types TypeScript pour ActivityLog, BoardActivityStats, ActivityType enum
- [x] **T3.3** : Créer hooks `useBoardActivityLogs`, `useBoardActivityStats`, `useNodeActivityLogs`
- [x] **T3.4** : Créer helpers `formatTimeAgo`, `formatActivityMessage`, `groupActivitiesByPeriod`

### ✅ Phase 4 : Frontend - i18n
- [x] **T4.1** : Ajouter section `activity` dans `fr.json` avec tous les messages
- [x] **T4.2** : Ajouter section `activity` dans `en.json` avec traductions
- [x] **T4.3** : Créer helper `formatActivityMessage(log, t)` pour construire messages

### ✅ Phase 5 : Frontend - UI Badge
- [x] **T5.1** : Importer hook `useBoardActivityStats` dans BoardPageShell
- [x] **T5.2** : Fetch compteur du jour au chargement du board avec auto-refresh 120s
- [x] **T5.3** : Ajouter badge "history" dans header (entre logo et boutons Settings/SignOut)
- [x] **T5.4** : Afficher compteur si todayCount > 0
- [x] **T5.5** : Ajouter traductions `board.activity.badge.tooltip` et `.aria` (FR + EN)
- [x] **T5.6** : Connecter onClick pour ouvrir le panneau d'activité

### ✅ Phase 6 : Frontend - Panel d'Activité
- [x] **T6.1** : Créer composant `ActivityPanel.tsx` (sidebar coulissant avec framer-motion)
- [x] **T6.2** : Fetch liste des logs du board avec useBoardActivityLogs (limite 50, auto-refresh 60s)
- [x] **T6.3** : Grouper par période avec groupActivitiesByPeriod (Aujourd'hui, Hier, Cette semaine, Plus ancien)
- [x] **T6.4** : Afficher avatar + formatActivityMessage + formatTimeAgo pour chaque log
- [x] **T6.5** : Rendre logs cliquables pour naviguer vers la tâche (ouvre TaskDrawer)
- [x] **T6.6** : Ajouter états loading/error, empty state, boutons refresh/close
- [x] **T6.7** : Fermeture avec Escape ou clic overlay
- [x] **T6.8** : Intégrer dans BoardPageShell avec état isActivityPanelOpen
- [x] **T6.9** : Ajouter traductions common.actions.refresh et .close (FR + EN)

### ⏳ Phase 7 : Tests
- [ ] **T7.1** : Test e2e : Alice déplace tâche → log créé
- [ ] **T7.2** : Test e2e : Bob voit l'activité d'Alice dans le panel
- [ ] **T7.3** : Test : Limite 20 logs → anciens supprimés
- [ ] **T7.4** : Test : Tâche supprimée → logs supprimés
- [ ] **T7.5** : Test : Badge compteur mis à jour en temps réel

### ⏳ Phase 8 : Améliorations Futures
- [ ] **T8.1** : Filtres (par utilisateur, par type, par période)
- [ ] **T8.2** : Onglet "Historique" dans TaskDrawer (logs de la tâche)
- [ ] **T8.3** : Export CSV des logs
- [ ] **T8.4** : Recherche dans les logs
- [ ] **T8.5** : Notifications push basées sur logs

## 📝 Notes Techniques

### Metadata par Type d'Activité

```typescript
// NODE_MOVED
metadata: {
  fromColumnId: string,
  toColumnId: string,
  fromColumnName: string,
  toColumnName: string
}

// DESCRIPTION_UPDATED, TITLE_UPDATED
metadata: {
  oldValue: string,
  newValue: string
}

// PRIORITY_UPDATED
metadata: {
  oldPriority: "MEDIUM",
  newPriority: "HIGH"
}

// INVITATION_SENT
metadata: {
  inviteeEmail: string,
  invitationId: string
}

// MOVED_TO_BOARD
metadata: {
  fromBoardId: string,
  toBoardId: string,
  fromBoardName: string,
  toBoardName: string
}

// TAGS_UPDATED
metadata: {
  addedTags: string[],
  removedTags: string[]
}

// NODE_SNOOZED
metadata: {
  until: string (ISO date),
  reason?: string
}
```

### Stratégie de Nettoyage

```typescript
// À chaque insertion :
1. Créer le nouveau log
2. Compter les logs de la tâche
3. SI count > MAX_ACTIVITY_LOGS_PER_NODE :
   - Récupérer les N plus anciens (N = count - MAX)
   - Les supprimer en batch
```

### Performance

- **Index composite** : `(nodeId, createdAt)` pour requêtes rapides
- **Cleanup synchrone** : Dans la même transaction que l'action
- **Limite backend** : 100 logs max par requête (configurable)

## 🚀 Plan d'Exécution

1. ✅ **Phase 1** (FAIT) : Infrastructure backend
2. ⏳ **Phase 2** (PRIORITAIRE) : Intégration logging dans NodesService (25 points)
3. ⏳ **Phase 3** : Frontend API client
4. ⏳ **Phase 4** : i18n messages
5. ⏳ **Phase 5** : Badge UI
6. ⏳ **Phase 6** : Panel d'activité
7. ⏳ **Phase 7** : Tests
8. ⏳ **Phase 8** : Améliorations

## ⚠️ Points d'Attention

- **Performance** : Cleanup automatique dans transaction → pas de logs orphelins
- **i18n** : Messages construits côté frontend → traduction automatique
- **Metadata** : Toujours inclure les noms (colonnes, boards) en plus des IDs pour affichage sans requête supplémentaire
- **Privacy** : Logs visibles par tous les collaborateurs du board
- **Rétention** : 20 logs par tâche = ~2-3 mois d'activité moyenne

## 🔄 État Actuel

- ✅ Phase 1 complète
- ⏳ Phase 2 à démarrer
- 📊 Estimation : 2-3 jours pour implémentation complète
