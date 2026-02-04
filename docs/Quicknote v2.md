# PRD — Quick Notes v1 (Capture + Traitement en journée)

## Produit : STRATUM

## Scope : Web uniquement (module desktop en phase 2)

## Stack : Next.js App Router (SPA) + API backend

## Objectif : Capturer rapidement des micro-événements (FAIT / ATTENTE / NOTE) puis les traiter progressivement ou en fin de journée via un dock persistant.

---

# 1. Problème

L’utilisateur travaille vite, change souvent de contexte, et oublie surtout les micro-engagements :

* relances (“attendre Marc”)
* petites actions faites
* notes temporaires à classer

Le coût cognitif de “bien organiser” au moment de la capture est trop élevé.

---

# 2. Objectifs

## Capture immédiate (Phase A)

* saisir en 2 secondes
* ne pas obliger le classement
* conserver le focus

## Traitement progressif (Phase B)

* traiter les notes au fil de la journée ou en fin de journée
* naviguer dans les kanbans sans perdre la liste
* supprimer (archiver) une note en un clic

## UX premium

* un seul point d’entrée (“Radar”)
* transition fluide entre capture et traitement
* aucune perte de contexte (SPA)

---

# 3. Concept UX global

## Un seul widget : “Quick Notes Radar”

* clic → mode capture (modal focus)
* si backlog > 0 → bouton “Traitement des entrées”
* clic traitement → transformation en dock persistante

---

# 4. Phase A — Quick Capture (Modal Focus)

## Déclenchement

* bouton/pastille Radar fixe (toutes pages)
* emplacement : haut droite

---

## UI : Modal centrée avec arrière-plan flouté

### Règles

* tout le reste est flou (overlay sombre + blur léger)
* focus total sur la saisie
* Escape ferme la modal
* Enter valide

---

## Champs de saisie

### 1. Kanban (saisie optionnel)

* composant Select2-like async search
* placeholder : “À classer plus tard (Inbox)”
* non obligatoire

### 2. Texte (obligatoire)

* textarea
* autofocus
* bouton = valider & continuer
* bouton = valider & fermer

### 3. Type (obligatoire)

3 boutons radio collés :

* ✅ FAIT
* ⏳ ATTENTE
* 📝 NOTE

Default : NOTE

---

## Validation

Après validation :

* note créée via API
* champ texte vidé
* modal reste ouverte (mode rafale)
* badge backlog mis à jour
* petit toast pour informer

---

## Bouton conditionnel

Si au moins 1 note non traitée existe :

→ afficher un bouton :

**“Traitement des entrées”**

---

# 5. Transition Capture → Traitement

Quand l’utilisateur clique “Traitement des entrées” :

* animation morphing (200–250ms)
* la modal glisse vers le bas gauche
* elle se transforme en dock compacte
* le flou se retire progressivement

Objectif : continuité mentale (“ce que j’ai capturé est toujours là”).

---

# 6. Phase B — Traitement (Dock persistante)

## UI : Dock en bas à gauche

* visible pendant toute la navigation
* non bloquante
* reste affichée tant qu’il reste des notes non traitées
* scroll interne (ascenseur)

### Important

On ne limite pas à 5 notes :
le dock affiche toutes les notes non traitées avec scroll.
Visuellement, environ 5 lignes sont visibles simultanément.

---

## Contenu du dock

### Liste des notes non traitées

Chaque ligne contient :

* type (icône)
* texte
* kanban associé (si présent)
* bouton ❌ (croix) pour traiter/supprimer

---

## Actions par note

### A) Traiter/Supprimer (croix)

Bouton ❌ à droite :

* archive la note (treated_at)
* retire immédiatement la ligne de la liste
* archive conservée 7 jours (backend)

Pas de confirmation lourde.

---

### B) Navigation vers kanban

Si un kanban est associé :

* le nom du kanban est cliquable
* clic → navigation SPA vers ce kanban
* ouverture du kanban en mode modification (vue normale existante)

Le dock reste visible.

---

## Fermeture du dock

### Règle

* tant qu’il reste des notes non traitées → dock reste affichée
* si liste vide → dock disparaît automatiquement

### Bouton fermeture manuelle

Une croix globale sur la fenêtre permet de masquer temporairement.

---

# 7. Données & Backend

## Table : quick_notes

| champ       | type              | description           |
| ----------- | ----------------- | --------------------- |
| id          | uuid/int          | identifiant           |
| user_id     | fk                | multi-user future     |
| text        | string            | contenu               |
| type        | enum              | NOTE / DONE / WAITING |
| kanban_id   | nullable fk       | cible optionnelle     |
| created_at  | datetime          | timestamp             |
| treated_at  | nullable datetime | archive               |
| reminder_at | nullable datetime | futur                 |

---

# 8. API Endpoints

## Create note

`POST /api/quick-notes`

```json
{
  "text": "Relancer Marc budget",
  "type": "WAITING",
  "kanban_id": null
}
```

---

## List open notes

`GET /api/quick-notes?status=open`

---

## Treat note (archive)

`POST /api/quick-notes/{id}/treat`

---

## Attach kanban

`POST /api/quick-notes/{id}/attach`

```json
{ "kanban_id": "123" }
```

---

# 9. Frontend Architecture (Next.js)

## Placement obligatoire (persistance)

Dans `app/layout.tsx` :

```tsx
<QuickNotesRadar />
<QuickNotesDock />
{children}
```

Ainsi :

* navigation kanban profonde sans perte
* dock toujours disponible

---

## State Management

### Zustand (UI)

* modal ouverte ?
* dock visible ?
* count open notes

### TanStack Query (data)

* fetch notes open
* optimistic update on treat

---

# 10. Acceptance Criteria

## Capture

* modal ouverte en 1 clic
* saisie + validation en <2s
* kanban optionnel
* bouton traitement apparaît si backlog >0

## Traitement

* dock persistante visible pendant navigation
* scroll complet des notes non traitées
* clic kanban → navigation vers bon niveau
* croix traite instantanément

## UX

* un seul point d’entrée
* animation fluide
* aucune modal bloquante en traitement
* dock disparaît quand tout est traité

---

# Résumé final

Quick Notes = Radar cognitif :

* Capture en modal focus (blur)
* Traitement en dock persistante scrollable
* Notes traitées via ❌ (archive 7 jours)
* Navigation directe vers kanban lié
* Dock disparaît quand Inbox vide
* Lorsque le dock se ferme auto ou manuel on lance un controle sur les notes archivés et si plus de 7 jours hop suppression (ainsi pas besoin de cron)


