# PRD — STRATUM Quick Notes Desktop (Tauri)

## Produit

STRATUM – Quick Notes Desktop Companion

## Plateformes

* Windows
* Linux
* macOS (supporté mais non testé)

## Technologie

* **Tauri** (Rust + WebView)
* UI partagée avec la version web (React / Tailwind CSS)
* Communication avec backend via API HTTP (contrat documenté ci-dessous)

---

# 1. Objectif du projet

Fournir un **outil desktop ultra-léger** permettant :

* la **prise de note rapide** à tout moment
* sans ouvrir le navigateur
* sans perturber le flow de travail
* avec un **feedback visuel permanent** (radar vert/orange/rouge)

Ce module **ne remplace pas** la version web :
il agit comme une **porte d’entrée rapide** vers le système Quick Notes.

---

# 2. Périmètre fonctionnel (v1)

## Inclus

* Widget desktop toujours accessible
* Capture rapide de notes (FAIT / ATTENTE / NOTE)
* Indicateur visuel de “fraîcheur de capture”
* Liste des notes non traitées (lecture seule)
* Envoi des notes vers le backend (API abstraite)

## Exclus

* Traitement complet des notes (fait sur le web)
* Navigation dans les kanbans
* Relances automatiques
* IA / OCR / analyse écran

---

# 3. Principes UX fondamentaux

1. **Zéro friction**
2. **Zéro bruit**
3. **Toujours visible**
4. **Jamais bloquant**
5. **Même UX que le web (muscle memory)**

---

# 4. UX globale

## 4.1 Le Radar (état réduit)

État par défaut : **mini widget flottant**

### Apparence

* petit carré ou cercle
* couleur dynamique :

  * 🟢 vert : capture récente
  * 🟠 orange : >1h sans capture
  * 🔴 rouge : >3h sans capture
* badge optionnel : nombre de notes non traitées

### Comportement

* toujours au premier plan (option configurable)
* draggable
* persistant entre redémarrages

### Interaction

* clic gauche → ouvre la capture
* clic droit → menu système (quitter, settings)

---

## 4.2 Mode Capture (fenêtre focus)

### Déclenchement

* clic sur le radar
* raccourci clavier global (ex : `Ctrl+Alt+N`)

### UI

* fenêtre centrée
* taille compacte
* pas de blur desktop (contrairement au web)
* focus immédiat sur le champ texte

### Champs

1. Texte (obligatoire)
2. Type (radio buttons)

   * FAIT
   * ATTENTE
   * NOTE
3. Kanban (optionnel)

   * autocomplete async
   * placeholder “À classer plus tard”

### Actions

* Enter → valider
* Ctrl+Enter → valider + fermer
* Escape → fermer sans enregistrer

### Feedback

* couleur radar repasse au vert
* champ vidé
* possibilité de saisies en rafale

---

## 4.3 Mode Liste (lecture seule)

Accessible depuis la capture si backlog > 0.

### UI

* même fenêtre
* zone inférieure scrollable
* affiche les notes non traitées

### Limites

* pas de suppression
* pas de traitement
* pas de navigation kanban

Objectif : **rappel visuel**, pas gestion.

---

# 5. Logique de couleur (Radar)

La couleur dépend du temps écoulé depuis **la dernière capture validée**.

| Délai   | Couleur |
| ------- | ------- |
| < 1h    | Vert    |
| 1h – 3h | Orange  |
| > 3h    | Rouge   |

Le calcul est **local**, pas dépendant du backend.

---

# 6. Architecture technique

## 6.1 Structure du dépôt

```
stratum-quick-notes-desktop/
├─ src-tauri/
│  ├─ main.rs
│  ├─ tauri.conf.json
│
├─ src/
│  ├─ components/
│  │  ├─ Radar.tsx
│  │  ├─ CapturePanel.tsx
│  │  └─ NotesList.tsx
│  │
│  ├─ store/
│  │  └─ quickNotesStore.ts
│  │
│  ├─ services/
│  │  └─ api.ts (stub)
│  │
│  └─ App.tsx
│
└─ README.md
```

---

## 6.2 State management

### Zustand (obligatoire)

État géré localement :

* fenêtre ouverte / fermée
* timestamp dernière capture
* couleur radar
* notes non traitées (cache local)

Aucune logique métier lourde.

---

## 6.3 API backend (contrat requis)

Le projet **dépend** de l’API Quick Notes déjà existante dans le backend Stratum.
Les interactions possibles ne sont pas des stubs : elles sont définies par les routes ci-dessous.

### Authentification

* Toutes les routes sont protégées par JWT.
* L’app desktop doit envoyer le header `Authorization: Bearer <token>`.
* Sans token valide → 401.

### Ressources principales

Base path : `/quick-notes`

1) **Créer une note rapide**

* `POST /quick-notes`
* Body JSON :
   * `text` (string, obligatoire, 1–2000 chars)
   * `type` (enum) : `FAIT` | `ATTENTE` | `NOTE`
   * `kanbanId` (string, optionnel, nullable)
* Réponse : `QuickNote` (voir schéma plus bas)
* Règles :
   * `text` est trimé côté backend.
   * `type` invalide → 400.
   * `kanbanId` inexistant ou inaccessible → 404.

2) **Lister les notes ouvertes (non traitées)**

* `GET /quick-notes?status=open`
* Paramètre `status` :
   * seul `open` est accepté
   * toute autre valeur → 400
* Réponse : `QuickNoteList` (items + count)

3) **Lister les kanbans disponibles (autocomplete)**

* `GET /quick-notes/boards`
* Réponse : liste de `QuickNoteBoard`
* Filtrage côté backend :
   * kanbans non archivés
   * l’utilisateur est membre actif de l’équipe
   * kanbans non terminés (pas dans une colonne DONE)

### Endpoints existants mais hors scope v1 desktop

Ces routes existent dans le backend mais ne sont **pas utilisées** par ce companion v1 :

* `POST /quick-notes/:id/treat` → archive une note
* `POST /quick-notes/:id/attach` → attache/retire un kanban a posteriori
* `POST /quick-notes/cleanup` → purge des notes traitées > 7 jours

### Schémas de réponse

**QuickNote**

* `id` (string)
* `text` (string)
* `type` (enum)
* `kanbanId` (string | null)
* `kanbanName` (string | null)
* `kanbanTeamId` (string | null)
* `kanbanAvailable` (boolean) → indique si le kanban est toujours valide
* `createdAt` (ISO string)
* `treatedAt` (ISO string | null)

**QuickNoteList**

* `items` (QuickNote[])
* `count` (number)

**QuickNoteBoard**

* `id` (string)
* `name` (string)
* `teamId` (string)
* `teamName` (string)

### Impacts UX (rappel)

* La couleur du radar reste **locale** (basée sur la dernière capture validée).
* Le backlog “notes non traitées” correspond à `GET /quick-notes?status=open`.
* L’autocomplete “Kanban” consomme `GET /quick-notes/boards`.

---

## 6.4 Persistance locale

Stockage minimal :

* dernière capture timestamp
* position du radar
* préférences utilisateur

Technos possibles :

* Tauri Store
* localStorage

---

# 7. Comportements système

## Fenêtre

* frameless
* toujours au-dessus (option)
* non présente dans la barre des tâches (option)

## Raccourci global

* configurable
* actif même si l’app est minimisée

---

# 8. Sécurité & confidentialité

* aucune capture écran
* aucune analyse du système
* aucune donnée stockée en clair hors notes
* tout le reste transite via API (hors scope)

---

# 9. Acceptance Criteria

## Fonctionnel

* le radar est toujours visible
* clic ouvre la capture en <200ms
* une note peut être saisie sans souris
* la couleur change automatiquement
* fermeture sans perte de données

## UX

* aucune latence perceptible
* aucune interruption sonore
* aucune fenêtre intrusive

---

# 10. Hors scope explicite

* synchronisation offline
* IA d’inférence
* traitement des notes
* gestion des kanbans
* notifications push

---

# 11. Vision long terme (non implémentée)

* partage exact du composant Capture avec le web
* mode “overlay minimal”
* relances locales
* stats personnelles (discipline)

---

# Résumé exécutif

Ce projet n’est **pas** une app de gestion.

C’est :

* un **radar cognitif**
* une **porte d’entrée réflexe**
* un **anti-oubli silencieux**

Il doit être :

* petit
* rapide
* fiable
* invisible quand tout va bien
* impossible à ignorer quand on oublie
