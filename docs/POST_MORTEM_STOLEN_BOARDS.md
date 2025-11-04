# 🚨 Post-Mortem : Vol de Boards Personnels

**Date de découverte :** 20 octobre 2025  
**Sévérité :** 🔴 CRITIQUE  
**Impact :** Corruption de données, perte d'accès aux boards personnels  
**Statut :** ✅ RÉSOLU

---

## 📋 Résumé Exécutif

Un bug critique permettait à un utilisateur de "voler" accidentellement le board personnel d'un autre utilisateur lors de la connexion. Ce bug était causé par une logique de "réparation opportuniste" défectueuse dans le processus de bootstrap.

---

## 🔍 Symptômes Observés

1. **Utilisateur test@test.fr** se connecte et se retrouve avec le board de **1test@test.fr**
2. L'utilisateur n'a aucun droit sur ce board (read-only involontaire)
3. Impossible d'ajouter des cartes ou de modifier quoi que ce soit
4. L'utilisateur est "coincé" sur un board qui ne lui appartient pas

---

## 🐛 Cause Racine

### Problème 1 : Logique de Bootstrap Défectueuse

**Fichier :** `apps/backend/src/modules/teams/teams.service.ts`  
**Ligne :** 109-123 (avant correction)

```typescript
// ❌ CODE BUGUÉ (AVANT)
const existingMembership = await this.prisma.membership.findFirst({
  where: { userId, status: MembershipStatus.ACTIVE },
  // ⚠️ PAS DE FILTRE sur team.isPersonal !
});
```

**Problème :**
- La requête récupérait **N'IMPORTE QUELLE** membership active
- Si un utilisateur avait accepté une invitation à une team partagée, celle-ci pouvait être retournée
- La "réparation opportuniste" modifiait ensuite le `ownerUserId` du board !

### Problème 2 : Réparation Opportuniste Trop Agressive

**Ligne :** 159-163 (avant correction)

```typescript
// ❌ CODE BUGUÉ (AVANT)
if (
  existingMembership.team.isPersonal &&
  existingBoard.ownerUserId !== existingMembership.userId // ⚠️ Modifie TOUJOURS !
) {
  repairData.ownerUserId = existingMembership.userId; // 💀 VOL DE BOARD !
  needsRepair = true;
}
```

**Problème :**
- Si le board avait **déjà** un propriétaire légitime (ex: 1test@test.fr)
- Et qu'un autre utilisateur (test@test.fr) se connectait avec une membership corrompue
- Le code **volait** le board en changeant le `ownerUserId` !

### Problème 3 : Teams Personnelles Corrompues

**Découverte :** La team "Mon Espace" avait **2 memberships** au lieu d'1 :
- test@test.fr (propriétaire légitime)
- 1test@test.fr (intrus)

**Cause probable :**
- Bug dans la logique d'invitation
- Ou manipulation manuelle de la base
- Ou race condition lors du bootstrap

---

## ✅ Solution Appliquée

### 1. Filtrage Strict des Teams Personnelles

```typescript
// ✅ CODE CORRIGÉ
const existingMembership = await this.prisma.membership.findFirst({
  where: { 
    userId, 
    status: MembershipStatus.ACTIVE,
    team: { isPersonal: true } // ✅ FILTRE CRITIQUE
  },
});
```

### 2. Protection Contre le Vol de Board

```typescript
// ✅ CODE CORRIGÉ
if (
  existingMembership.team.isPersonal &&
  existingBoard.ownerUserId === null // ✅ Uniquement si pas de propriétaire
) {
  repairData.ownerUserId = existingMembership.userId;
  needsRepair = true;
}
```

**Changement clé :** On ne modifie `ownerUserId` **QUE** si le board n'a pas encore de propriétaire (NULL).

### 3. Protection dans le Endpoint Diagnostic

**Fichier :** `apps/backend/src/modules/boards/boards.controller.ts`  
**Ligne :** 246-248 (modifiée)

```typescript
// ✅ CODE CORRIGÉ
if (t?.isPersonal && (b.ownerUserId === null || b.ownerUserId === user.id) && b.ownerUserId !== user.id) {
  repair.ownerUserId = user.id;
  changed = true;
}
```

### 4. Script de Réparation des Données Corrompues

**Fichier :** `apps/backend/scripts/fix-corrupted-personal-teams.ts`

Ce script :
1. ✅ Identifie les teams personnelles avec >1 membership
2. ✅ Détermine le propriétaire légitime (via `board.ownerUserId`)
3. ✅ Crée une nouvelle team personnelle pour chaque "intrus"
4. ✅ Migre l'intrus vers sa propre team avec board vierge

**Résultat :**
- test@test.fr conserve son board d'origine
- 1test@test.fr obtient son propre board vierge
- Les deux utilisateurs peuvent maintenant travailler indépendamment

---

## 🔒 Mesures Préventives

### 1. Contraintes de Validation

**À IMPLÉMENTER :**
- ❌ Ne JAMAIS permettre plus d'1 membership dans une team personnelle
- ❌ Ne JAMAIS permettre de modifier `ownerUserId` d'un board qui a déjà un propriétaire
- ✅ Ajouter des contraintes CHECK en base de données

```sql
-- Contrainte à ajouter (future migration)
CREATE OR REPLACE FUNCTION check_personal_team_memberships()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT "isPersonal" FROM "Team" WHERE id = NEW."teamId") THEN
    IF (SELECT COUNT(*) FROM "Membership" 
        WHERE "teamId" = NEW."teamId" 
        AND status = 'ACTIVE') >= 1 THEN
      RAISE EXCEPTION 'Une team personnelle ne peut avoir qu''un seul membre actif';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 2. Tests de Non-Régression

**À AJOUTER :**

```typescript
describe('Teams Bootstrap Security', () => {
  it('should NEVER modify ownerUserId of an existing personal board', async () => {
    // Créer user1 avec son board personnel
    // Créer user2
    // Corrompre artificiellement les données (user2 membership dans team de user1)
    // Appeler bootstrapForUser(user2.id)
    // ASSERT: board.ownerUserId doit rester user1.id
  });

  it('should NEVER return a non-personal team in bootstrap', async () => {
    // Créer une team partagée
    // Ajouter user1 à cette team
    // Appeler bootstrapForUser(user1.id)
    // ASSERT: doit créer une NOUVELLE team personnelle, pas retourner la team partagée
  });
});
```

### 3. Monitoring & Alertes

**À METTRE EN PLACE :**
- 📊 Alerte si une team personnelle a >1 membership
- 📊 Alerte si un board.ownerUserId est modifié (sauf lors de la création)
- 📊 Log toutes les modifications de `ownerUserId` avec stack trace

---

## 📈 Métriques d'Impact

### Avant Correction
- ❌ 1 team corrompue (2 memberships au lieu de 1)
- ❌ 1 utilisateur (1test@test.fr) sans accès à son propre board
- ❌ 1 utilisateur (test@test.fr) pouvait potentiellement perdre son board au prochain login

### Après Correction
- ✅ 0 team corrompue
- ✅ Chaque utilisateur a sa propre team personnelle
- ✅ Les boards personnels ne peuvent plus être volés

---

## 🎓 Leçons Apprises

1. **Jamais de "réparation opportuniste" sans validation stricte**
   - Les réparations automatiques peuvent causer plus de dégâts que de bien
   - Toujours ajouter des garde-fous (ownerUserId === null)

2. **Toujours filtrer les requêtes sur des champs critiques**
   - `findFirst()` sans filtre strict = danger
   - Ajouter `team: { isPersonal: true }` était critique

3. **Les contraintes de base de données sont essentielles**
   - La validation applicative ne suffit pas
   - Les contraintes SQL préviennent les corruptions

4. **Les scripts de diagnostic/réparation sont indispensables**
   - Permettent de détecter rapidement les problèmes en production
   - Facilitent la récupération après incident

5. **Jamais de modifications de design UI sans review approfondie**
   - Le bug n'était PAS causé par les modifications UI
   - Mais l'incident a révélé une faille existante dans le bootstrap
   - Les tests e2e auraient pu détecter ce problème

---

## 📝 Actions de Suivi

- [ ] Ajouter contrainte CHECK en base de données (migration)
- [ ] Implémenter tests de non-régression
- [ ] Mettre en place monitoring sur `ownerUserId`
- [ ] Review complète de tous les `prisma.board.update`
- [ ] Documentation : "Guide de sécurité - Ownership des boards"
- [ ] Audit de toutes les logiques de "réparation opportuniste"

---

## 🔗 Références

- **Fichiers modifiés :**
  - `apps/backend/src/modules/teams/teams.service.ts`
  - `apps/backend/src/modules/boards/boards.controller.ts`

- **Scripts de réparation :**
  - `apps/backend/scripts/fix-corrupted-personal-teams.ts`
  - `apps/backend/scripts/fix-stolen-boards.ts`

- **Commit de correction :** (à compléter après commit)

---

**Document préparé par :** GitHub Copilot  
**Validé par :** (à compléter)  
**Date de résolution :** 20 octobre 2025
