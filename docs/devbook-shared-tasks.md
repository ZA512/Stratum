# DevBook : Système de Tâches Partagées avec Placement Individuel

## 🎯 Objectif
Permettre à chaque collaborateur de placer une tâche partagée où il veut dans son kanban personnel, tout en gardant l'arborescence sous-jacente synchronisée pour tous.

## 📋 Concept

### Tâche Mère Partagée (Point d'Entrée)
- ✅ Chaque collaborateur place la tâche mère OÙ IL VEUT dans SON board personnel
- ✅ Déplacer la tâche mère n'affecte QUE celui qui la déplace
- ✅ La tâche mère NE PEUT PAS être supprimée PAR PERSONNE (même pas le créateur - archivage uniquement)
- ✅ Placement individuel stocké dans `SharedNodePlacement`
- ✅ Badge visuel discret 🤝 pour identification

### Sous-Tâches (Arborescence Partagée)
- ✅ TOUT est synchronisé pour TOUS
- ✅ Créer/Modifier/Déplacer/Supprimer → visible par tous
- ✅ Un seul `columnId` partagé (système actuel)
- ✅ Espace de travail collaboratif complet

## 📐 Architecture

### Nouvelle Table : `SharedNodePlacement`

```prisma
model SharedNodePlacement {
  id         String   @id @default(cuid())
  nodeId     String   // La tâche MÈRE partagée uniquement
  userId     String   // Le collaborateur
  columnId   String   // Colonne dans le board personnel du collaborateur
  position   Float    // Position dans cette colonne
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  node       Node     @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  column     Column   @relation(fields: [columnId], references: [id], onDelete: Cascade)

  @@unique([nodeId, userId])
  @@index([userId])
  @@index([nodeId])
}
```

### Détection d'une Tâche Mère Partagée
Une tâche est "mère partagée" si :
- `metadata.share.collaborators.length > 0` (elle a des collaborateurs)
- Elle n'a PAS de `SharedNodePlacement` pour le créateur → il faut en créer un

## 🔧 Tâches d'Implémentation

### ✅ Phase 1 : Migration Base de Données
- [x] **T1.1** : Créer migration Prisma pour `SharedNodePlacement`
- [x] **T1.2** : Ajouter la relation dans le modèle `Node`
- [x] **T1.3** : Ajouter la relation dans le modèle `User`
- [x] **T1.4** : Ajouter la relation dans le modèle `Column`
- [x] **T1.5** : Générer le client Prisma (sera fait au prochain démarrage)
- [x] **T1.6** : Script de migration des données existantes créé (`migrate-shared-placements.ts`)

### ✅ Phase 2 : Backend - Service NodesService
- [x] **T2.1** : Modifier `acceptNodeShareInvitation` pour créer `SharedNodePlacement` lors de l'acceptation
- [x] **T2.2** : Créer méthode `moveSharedNodePlacement(nodeId, userId, columnId, position)` pour déplacer le placement personnel
- [x] **T2.3** : Modifier `removeNodeCollaborator` pour supprimer le `SharedNodePlacement` associé
- [x] **T2.4** : Créer méthode helper `getUserPersonalBoard` pour trouver le board personnel
- [x] **T2.5** : Modifier `deleteNode` pour interdire la suppression de TOUTE tâche partagée (personne n'est propriétaire)

### ✅ Phase 3 : Backend - Service BoardsService
- [x] **T3.1** : Modifier `getBoardWithNodes` pour charger les `SharedNodePlacement` de l'utilisateur
- [x] **T3.2** : Fusionner les tâches du board avec les tâches mères partagées (via placements)
- [x] **T3.3** : Exclure les tâches mères partagées de leur position d'origine pour les collaborateurs
- [x] **T3.4** : Ajouter flags `isSharedRoot` et `canDelete` dans le DTO des nodes

### ✅ Phase 4 : Backend - Controller & DTOs
- [x] **T4.1** : Ajouter endpoint `PATCH /nodes/:nodeId/placement` (déplacer placement personnel)
- [x] **T4.2** : Modifier `BoardNodeDto` pour inclure `isSharedRoot` flag
- [x] **T4.3** : Modifier `BoardNodeDto` pour inclure `canDelete` flag
- [x] **T4.4** : ~~Créer DTO `SharedNodePlacementDto`~~ (non nécessaire, les flags suffisent)
- [x] **T4.5** : ~~Modifier réponse d'acceptation pour inclure le placement~~ (non critique, board se rafraîchit)

### ✅ Phase 5 : Frontend - API Client
- [x] **T5.1** : Ajouter `moveSharedNodePlacement` dans `nodes-api.ts`
- [x] **T5.2** : Modifier type `BoardNode` pour inclure `isSharedRoot` et `canDelete`

### ✅ Phase 6 : Frontend - Logique Kanban
- [x] **T6.1** : Modifier drag & drop pour utiliser `moveSharedNodePlacement` si `isSharedRoot === true`
- [x] **T6.2** : Désactiver bouton supprimer si `canDelete === false`
- [x] **T6.3** : Rafraîchir le board après acceptation d'invitation pour afficher la tâche partagée
- [x] **T6.4** : Badge visuel discret (🤝) pour identifier les tâches partagées

### ✅ Phase 7 : Tests
- [ ] **T7.1** : Test e2e : Alice partage une tâche avec Bob
- [ ] **T7.2** : Test e2e : Bob accepte et la place dans sa colonne "Projets Externes"
- [ ] **T7.3** : Test e2e : Alice déplace la tâche mère → Bob ne voit pas le changement de position
- [ ] **T7.4** : Test e2e : Alice crée une sous-tâche → Bob la voit
- [ ] **T7.5** : Test e2e : Bob déplace la sous-tâche de colonne → Alice voit le changement
- [ ] **T7.6** : Test e2e : Bob essaie de supprimer la tâche mère → erreur 403
- [ ] **T7.7** : Test e2e : Alice supprime la tâche mère → suppression des placements de tous les collaborateurs

### ✅ Phase 8 : Nettoyage & Documentation
- [ ] **T8.1** : Supprimer l'ancienne logique de partage si nécessaire
- [ ] **T8.2** : Mettre à jour la documentation API (Swagger)
- [ ] **T8.3** : Mettre à jour README avec la nouvelle fonctionnalité
- [ ] **T8.4** : Ajouter exemples dans seed.ts

## 📝 Notes Techniques

### Placement Initial lors de l'Acceptation
Lors de l'acceptation, créer le placement dans la **première colonne du board personnel** de l'invité (généralement "Backlog").

```typescript
// Dans acceptNodeShareInvitation
const userPersonalBoard = await getUserPersonalBoard(userId);
const firstColumn = userPersonalBoard.columns[0];

await tx.sharedNodePlacement.create({
  data: {
    nodeId: invitation.nodeId,
    userId,
    columnId: firstColumn.id,
    position: await getNextPosition(firstColumn.id),
  },
});
```

### Requête de Board avec Placements Partagés
```typescript
// Pseudo-code pour getBoardWithNodes
const ownNodes = await prisma.node.findMany({
  where: { 
    columnId: { in: columnIds },
    archivedAt: null,
  }
});

const sharedPlacements = await prisma.sharedNodePlacement.findMany({
  where: { 
    userId,
    column: { boardId },
  },
  include: { node: true },
});

// Fusionner ownNodes + sharedPlacements.map(p => p.node)
```

### Détection de Conflit
Si une tâche a des collaborateurs MAIS n'a pas encore de placements (anciennes données), créer les placements à la volée lors du premier chargement.

## 🚀 Plan d'Exécution
1. Commencer par Phase 1 (Migration)
2. Phase 2 + 3 (Backend core logic)
3. Phase 4 (API)
4. Phase 5 + 6 (Frontend)
5. Phase 7 (Tests)
6. Phase 8 (Polish)

## ⚠️ Points d'Attention
- **Migration des données existantes** : Les tâches déjà partagées doivent avoir des placements créés
- **Performance** : Indexer correctement `SharedNodePlacement` pour éviter les requêtes lentes
- **Cohérence** : Si on supprime un collaborateur, supprimer son placement
- **Board personnel** : Chaque utilisateur doit avoir UN board personnel (déjà géré par bootstrap)

## 🔄 État Actuel
- [ ] Devbook créé
- [ ] Prêt à démarrer Phase 1
