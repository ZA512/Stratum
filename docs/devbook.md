# DevBook Stratum

## ✅ Accompli
- [x] Alignement des clients API frontend (teams, auth, boards, nodes) sur les endpoints Nest + gestion d'erreurs.
- [x] Intégration du dashboard App Router (accueil + vue board) avec navigation breadcrumb et rafraîchissement après mutations.
- [x] Endpoint backend POST /boards/:boardId/columns sécurisé (guard JWT, provisioning comportements par défaut, ordre).
- [x] Formulaires frontend pour créer une colonne et une tâche simple + rafraîchissement du board.
- [x] Correction des URL frontend (/boards/{teamId}) pour pointer vers les IDs Prisma semés.
- [x] Devbook initialisé (ce fichier) pour suivre l'avancement.

## 🚧 En cours / à court terme
- [x] **UI** : activer Tailwind correctement (PostCSS prêt) et finaliser le thème (couleurs bg-surface, bg-card, états hover).
- [x] **UX board** : afficher les colonnes existantes/progress, gérer l'état vide avec CTA.
- [x] **API** : exposer PATCH /boards/:boardId/columns/:id (rename, WIP, position) et DELETE.
- [x] **Nodes** : implémenter conversion simple → moyen → complexe côté UI (consommer POST /nodes/:id/convert).
- [x] **Breadcrumb fractal** : appliquer les specs docs/breadcrumb-ux.md (strates colorées, animation Framer Motion, accessibilité ARIA).
- [x] **Qualité** : corriger les warnings ESLint backend (types any résiduels, promesses non awaitées) puis activer lint dans le pipeline.
- [ ] **Tests** : ajouter
  - [x] Jest e2e \\boards (création colonne)
  - [ ] Test Playwright/Cypress (ajout colonne + carte simple).
- [ ] **Tooling** : commande 
pm run seed:reset (drop + migrate + seed) pour synchroniser les environnements.

## 🔭 Roadmap mid-term
- [ ] Drag & drop (dnd-kit) pour colonnes/cartes avec persistance position.
- [ ] Notifications temps réel (Socket.IO) sur création carte/colonne.
- [ ] Module de styles partagés (packages/shared) pour tokens/typo.
- [ ] Auth refresh automatique (useEffect + refresh endpoint) côté frontend.
- [ ] Storybook des composants (card, breadcrumb, formulaire colonne).

## 📝 Notes
- Données démo : team_stratum, board_stratum_root, column_* (voir prisma/seed.ts). Les nouveaux endpoints doivent respecter ces IDs.
- Le front bascule automatiquement sur /boards/{teamId} ; si vous créez d'autres équipes, exposez-les via seed ou API.
- La page board reste volontairement brute (en attente d'activation Tailwind) pour se concentrer sur le flux fonctionnel.

---

# 🔄 Journal & Mémoire (nouveau format)

## 🗓️ Tâches courantes - 26/09/2025
- [x] Cartes Kanban : affichage de l’ID court (#) + extrait description optionnel + avatar assigné + indicateur d’échéance dynamique.
- [x] Backend : ajout du champ `shortId` auto-incrémenté, enrichissement de `/boards/:id/detail` (description, assignees, estimation).
- [x] Front : toggle global « Description on/off » sur le board + UI revue (compteur & sous-board regroupés).
- [ ] Menu contextuel carte (déplacement multi-board, suppression récursive) — à réaliser sur itération suivante.

## 🗓️ Tâches courantes - 27/09/2025
- [x] Ajuster la palette du badge d’échéance pour respecter les seuils basés sur l’estimation (rouge = estimation, orange = 2× estimation, valeurs par défaut 2/7 jours).
- [ ] Implémenter le menu contextuel carte (édition, déplacement multi-board, suppression simple/récursive).
- [ ] Préparer la modale de déplacement (arborescence des boards, règles d’exclusion des descendants).

## 🗓️ Tâches courantes - 28/09/2025
- [x] Lot 2 (partiel) : filtres assignés/priorités + recherche textuelle (debounce 300 ms, seuil 3 caractères) + toggles rapides « Mes tâches » et « Avec sous-kanban ».
- [x] Lot 2 (partiel) : tri combiné intra-colonne (priorité → échéance) au-dessus de l’ordre manuel.
- [ ] Lot 2 (suite)
  - [x] Persistance utilisateur des filtres (stockage local + réhydratation).
  - [ ] Implémentation backend des filtres pour alléger le payload.

## 🗓️ Tâches courantes - 29/09/2025
- [x] Persistance locale des filtres/tri/affichages du board (localStorage par board) + réhydratation automatique.
- [x] Bouton de réinitialisation conservé (nettoyage des états et du stockage) + garde-fou si localStorage indisponible.
- [ ] Déléguer le filtrage côté backend (requêtes paramétrées) pour réduire le volume JSON échangé.

## 🗓️ Tâches courantes - 30/09/2025
- [x] Menu contextuel des cartes : bouton trois-points + options « Éditer », « Déplacer », « Supprimer » avec fermeture automatique.
- [x] Backend nodes : endpoint `GET /nodes/:id/delete-preview` + suppression contrôlée (simple vs récursive) avec recalcul progression parent.
- [x] Frontend : modale de confirmation suppression (compteur agrégé a.b.c.d, blocage option simple si enfants présents).
- [ ] Déplacement multi-board (arborescence + exclusion descendants) — reste à implémenter dans un lot dédié.

## 🗓️ Tâches courantes - 01/10/2025
- [x] Backend : normaliser la sélection `shortId` dans `GET /boards/:id/detail` et corriger le mapping `NodeDto` pour les identifiants courts.
- [x] Frontend : finaliser la carte enrichie (ID court, description optionnelle, avatars, échéances colorées, compteur enfants, icône sous-board) et le menu contextuel avec modale de suppression.
- [x] Documentation : journaliser l’état d’avancement du lot contextuel/suppression et préciser le suivi du déplacement multi-board restant.
- [ ] Déplacement multi-board : construire l’arborescence de sélection et sécuriser les règles d’exclusion descendants.

ℹ️ Notes :
- `npm run prisma:migrate --workspace backend -- --name add_node_short_id` échoue ici faute de `DATABASE_URL`; migration SQL créée manuellement.
- Les filtres/menus avancés restent à planifier après finalisation du Lot 1.

Ce journal sert désormais de mémoire persistante. Chaque lot de travail est découpé en tâches atomiques. Si l'IDE plante, repartir de la première tâche non cochée sous la section active.

## 📌 Lot actif: Améliorations Blocage + Compteurs + UX Cartes
Contexte: Ajouter gestion des tâches bloquées (relances), afficher les compteurs enfants 4.0.0.0 sur carte et dans le header, simplifier carte (supprimer Edit), remplacer lien sous-board par icône, vérifier DnD vers Backlog.

### 🎯 Objectifs
1. Persister données de suivi blocage (emails relance, intervalle jours, date estimée de fin).
2. Afficher section conditionnelle dans le drawer quand la tâche est dans une colonne au comportement BLOCKED.
3. Afficher le compteur des sous-tâches sous forme a.b.c.d (Backlog.En cours.Bloqué.Fait) dans:
   - Header du drawer (placement propre, aligné / réduit le bruit visuel)
   - Bas à droite de chaque carte sur le board.
4. Retirer bouton "Edit" (double‑clic suffit) des cartes.
5. Remplacer le lien texte "Sous-board →" par une icône (grille) + tooltip.
6. S'assurer que le drag & drop fonctionne pour revenir vers Backlog (suppression de toute restriction implicite).

### 🧱 Découpage Technique
- [x] (1) Prisma: ajouter champs Node
  - blockedReminderEmails   String[] @default([])
  - blockedReminderIntervalDays Int?
  - blockedExpectedUnblockAt DateTime?
  Migration + regen client.
- [x] (2) Backend DTO/Service
  - Étendre NodeDto / UpdateNodeDto
  - Validation: emails distincts, format rudimentaire /@/, intervalle >=1 si défini.
  - Mapping retour API.
- [x] (3) Front types & API
  - Étendre types NodeDetail / update payload
  - Adapter `updateNode`.
- [x] (4) Drawer UI
  - Replacer compteur 4.0.0.0 (header: align meilleur, style monospace).
  - Section Blocage conditionnelle (inputs: emails, intervalle jours, date estimée) + diff tracking.
- [x] (5) Cartes (CardItem)
  - Supprimer bouton Edit
  - Ajouter badge compteur en bas à droite (si données disponibles)
  - Icône sous-board (grille SVG) + focus/hover styles.
- [x] (6) Fournir counts côté listing (board enrichi: counts/effort/priority inline)
  - Ancienne note conservée pour historique.
- [x] (7) DnD Backlog
  - Vérifier `onDragEnd` + backend moveChildNode → retirer potentielle contrainte.
- [x] (8) Tests manuels & erreurs TS
  - get_errors front/backend.
- [x] (9) Mise à jour DevBook: cocher chaque sous-tâche une fois réalisée.

🧩 Spécification Blocage (implémentée)
- Visible uniquement si la tâche est dans une colonne au comportement BLOCKED.
- Champs:
  - Emails à relancer (liste, séparateur virgule/espaces; nettoyés/dédoublonnés; validation simple email)
  - Intervalle de relance (jours, 1–365)
  - Date estimée de fin du blocage (date ISO)
- Effets:
  - Persistés côté Prisma (`Node`), exposés via DTO, modifiables via PATCH /nodes/:id
  - Aucune relance automatique encore (stock pour automatisations futures)

🐞 Fix DnD colonne vide
- Problème: impossible de lâcher une carte dans une colonne sans cartes visibles.
- Solution: chaque colonne est maintenant droppable; un surlignage apparaît au survol en drag.

### 🔍 Hypothèses / Règles
- Emails séparés par virgule ou espaces; trimming + dédoublonnage.
- Pas d'envoi mail implémenté (stock uniquement).
- Section Blocage visible si colonne courante.key == BLOCKED (pas besoin d'un champ status séparé).
- Intervalle jours optionnel si liste emails vide.
- Compteur sur carte: rendu conditionnel (affiché uniquement si counts disponibles sans requête supplémentaire).

### 🧪 Validation prévue
- Créer une tâche → ajouter 2-3 sous-tâches pour voir compteur.
- Déplacer carte entre colonnes y compris retour Backlog.
- Mettre tâche en colonne Bloqué → remplir champs → sauvegarder → rouvrir (valeurs persistées).
- Vérifier absence du bouton Edit et fonctionnement double-clic.

### 🗂 Prochain lot envisagé (brouillon)
- Priorité / Effort (enum + UI)
- Commentaires inline
- Ordre persistant des sous-tâches
- Dépendances + recalcul progress automatique

---

Historique récent (résumé):
- Ajout champ progress (backend & front) + slider.
- Simplification sous-tâches (liste unique + toggle done/backlog) + correction contraste.
- Fix ordre hooks (ChildTasksSection) en supprimant early return.
- Fermeture auto du drawer après sauvegarde.
- Format compteur a.b.c.d coloré dans header.

---

## 📥 Backlog détaillé (nouveaux sujets)

1) Largeur du tiroir d’édition (TaskDrawer)
- Actuel ~520px (sm:w-[520px]).
- Attendu: occuper davantage d’espace (ex: md:w-[720px] lg:w-[840px]) tout en restant responsive.
- Implémentation: ajuster classes Tailwind et breakpoint; conserver fermeture ESC/clic overlay.

2) Priorité de la tâche
- Niveaux: none, critical, high, medium, low, lowest.
- Backend: enum Prisma Priority + champ Node.priority (default NONE), DTO/Service (validation).
- Front: sélecteur simple dans TaskDrawer; badge sur carte (couleur par niveau) en option.

3) RACI (4 zones d’assignation par rôle)
- Rôles: R (Responsible), A (Accountable), C (Consulted), I (Informed).
- UI: input type select2-like (recherche, chips, suppression par croix, multi-valeurs) pour chaque rôle.
- Backend: soit enrichir NodeAssignment avec un champ roleRaci, soit stocker dans `statusMetadata`/`metadata` (clé `raci: { R:[], A:[], C:[], I:[] }`) pour un premier jet.
- Front: champ multi-sélection avec auto-complétion des utilisateurs de l’équipe (à définir: endpoint de recherche users).

4) Mode Expert (onglets Tâche / Temps)
- Activation: toggle “mode expert” dans le Kanban.
- Onglet Temps: deux blocs
  - Bloc Temps et effort
    • Temps estimé (heures)
    • Temps réel saisi OPEX
    • Temps réel saisi CAPEX
    • Date début / Date fin prévue
    • Date réelle de fin
    • Statut facturation: À facturer / Facturé / Payé
  - Bloc Coûts et budgets
    • Taux horaire (auto ou manuel)
    • Coût réel = temps réel × taux horaire (auto)
    • Budget prévu (optionnel)
    • Budget consommé (% ou €)
- Backend: champs dédiés dans Node (ou objet `statusMetadata.time` pour un POC), validations numériques et dates.
- Front: onglets dans le drawer; persistance via updateNode.

5) Effort (taille)
- Valeurs: <2min, XS, S, M, L, XL, XXL (voir mapping couleurs ci‑dessous).
- Backend: enum Effort + Node.effort (nullable) — IMPLEMENTÉ.
- Front: select dans TaskDrawer + badge sur la carte — IMPLEMENTÉ.

6) Tags
- Multi-tags par tâche.
- Backend: soit table de relation NodeTag (normalisée), soit tableau de chaînes `tags String[]` pour MVP.
- Front: champ chips (ajout par saisie + ENTER), suggestion de tags existants.

🧩 Découpage technique proposé (ordre suggéré)
- [x] A. Largeur drawer (UI-only) — appliqué: sm 640px, md 720px, lg 840px
- [ ] B. Priorité (Prisma + DTO + UI simple)
 - [x] B. Priorité (Prisma + DTO + UI simple) — migration: add_priority_to_node, UI select dans drawer
- [ ] C. Effort (Prisma + DTO + UI simple)
- [ ] D. Tags (MVP: String[] + UI chips)
- [ ] E. RACI (MVP via metadata; UI chips + futur endpoint users)
- [ ] F. Mode Expert (onglets + champs temps/coûts en metadata; future normalisation Prisma)

---

## ✅ Lot terminé: Effort — carré couleur (Drawer + Cartes)

### Objectif
Rendre l’effort d’une tâche visible et rapide à appréhender via un petit carré de couleur:
- Dans le TaskDrawer (en‑tête)
- Sur les cartes du board (badge discret)

### Implémentation
- Backend (Prisma/Nest):
  - Champ `Node.effort` (enum nullable) exposé dans les DTO; validations côté update déjà en place.
- Frontend (Next.js/React):
  - Drawer: `apps/frontend/src/features/nodes/task-drawer/TaskDrawer.tsx`
    - Affiche un carré coloré dans l’en‑tête, à côté du titre et des compteurs a.b.c.d.
    - Sélecteur Effort dans le panneau latéral pour modifier la valeur.
  - Cartes: `apps/frontend/src/app/boards/[teamId]/[[...board]]/components/CardItem.tsx`
    - Affiche un petit carré (3×3) en haut à droite, avec `title` et `aria-label`.
    - Lazy fetch de l’effort via `fetchNode(node.id)` (fichier `features/nodes/nodes-api.ts`).

### Mapping couleurs (effort → couleur Tailwind)
- UNDER2MIN → emerald-400
- XS → sky-400
- S → blue-400
- M → amber-400
- L → orange-500
- XL → rose-500
- XXL → red-600

Remarque: pour l’instant, non défini = pas de badge (cartes) et carré neutre non affiché.

### Accessibilité
- Attributs `title`/`aria-label` renseignés (ex: « Effort: M ») pour lecteur d’écran et tooltip.

### Perf & Data loading
- Les cartes déclenchent un `GET /nodes/:id` pour récupérer l’effort (lazy); pas de surcharge visible lors du scroll normal.
- Pistes futures: batcher les détails, ou exposer l’effort directement dans le payload du board pour éviter des requêtes par carte.

### Validation
- Créer/ouvrir une tâche → définir l’effort dans le Drawer → sauvegarder → vérifier:
  - Carré d’effort visible dans l’en‑tête du Drawer avec la couleur correspondante.
  - Carré d’effort visible sur la carte correspondante (tooltip/aria label OK).

### Maintenance
- Pour ajuster le mapping couleur, modifier les classes Tailwind dans:
  - Drawer: `TaskDrawer.tsx` (section carré d’effort dans l’en‑tête)
  - Cartes: `CardItem.tsx` (badge effort en haut à droite)

### Statut
- DONE (backend + frontend + UX)

🔎 Hypothèses
- Recherche utilisateurs d’équipe: endpoint à ajouter si on veut auto-complétion.
- Pour un MVP, stocker RACI/Temps/Coûts dans metadata pour aller vite, puis normaliser.
- Badges (priorité/effort/tags) sur carte: affichage conditionnel, compact.

---

## ✅ Lot terminé: Enrichissement Board Nodes (counts + effort + priorité inline)

### Objectif
Éliminer les requêtes N+1 (summary + lite) sur chaque carte en incluant directement dans la réponse `GET /boards/:id/detail` les champs nécessaires à l’aperçu :
- `counts` agrégés des sous‑tâches (backlog, inProgress, blocked, done)
- `effort`
- `priority`

### Implémentation
Backend :
- Mise à jour `BoardsService.getBoardWithNodes` pour :
  - Charger toutes les cartes d’un board.
  - Récupérer en une requête tous les enfants dont `parentId` ∈ cartes.
  - Agréger côté serveur les comportements de colonne -> counts.
  - Injecter `counts`, `effort`, `priority` dans chaque `BoardNodeDto`.
- DTO `BoardNodeDto` enrichi (nouvelles propriétés optionnelles).

Frontend :
- Type `BoardNode` enrichi dans `boards-api.ts`.
- `CardItem.tsx` refactoré : suppression des appels `fetchNodeSummary` et `fetchNode`; usage direct des données déjà reçues.
- Ajout badge priorité (pastille couleur) conditionnel (`priority !== NONE`).

### Mapping couleur priorité
| Priorité | Couleur |
|----------|---------|
| CRITICAL | red-600 |
| HIGH     | rose-500|
| MEDIUM   | amber-500|
| LOW      | emerald-500|
| LOWEST   | slate-500|
| NONE     | (non rendu) |

### Performance
Avant : 2 requêtes supplémentaires par carte (summary + lite).\
Après : 0 requête additionnelle — réduction latence et charge réseau, cohérence immédiate.

### Accessibilité / UX
- Badges priorité & effort avec `title` + `aria-label`.
- Counts restitués identiques à l’état serveur (pas de dérive optimiste ici).

### Validation manuelle
1. Charger un board avec plusieurs cartes : observer absence d’appels /nodes/:id/summary.
2. Créer des sous‑tâches → refresh board → counts mis à jour directement.
3. Changer priorité + effort → reopen board → badges corrects sans fetch additionnel.

### Statut
DONE

### Pistes futures
- Paramètre optionnel `?compact=1` pour payload plus léger (si besoin mobile).
- Ajout d’un hash version (ETag logique) pour revalidation conditionnelle.

---

## ✅ Lot terminé: Compactage visuel badges (Priorité + Effort)

### Objectif
Réduire l’encombrement horizontal des cartes et de l’en-tête du drawer en fusionnant les deux indicateurs (priorité, effort) sous forme de pile verticale homogène (pastilles 3×3 / 2.5×2.5 dans le drawer).

### Implémentation
Frontend uniquement :
- `CardItem.tsx` : suppression de l’ancienne disposition (priorité inline avant le titre + effort séparé à droite). Ajout d’une pile `absolute top-2 right-2` affichant 0–2 pastilles (priorité si != NONE, puis effort si défini).
- `TaskDrawer.tsx` : remplacement du carré effort unique par une pile verticale (priorité au-dessus si définie, effort dessous) pour cohérence visuelle.

### Règles UI
- Si priorité = NONE et effort null ⇒ aucune pile rendue (pas de placeholder visuel inutile).
- Ordre : Priorité (haut) → Effort (bas) pour refléter la hiérarchie d’importance perçue.
- Couleurs identiques aux mappings précédemment documentés (pas de changement de sémantique).

### Accessibilité
- Chaque pastille garde `title` + `aria-label` distincts (ex: « Priorité: HIGH », « Effort: M »).
- Stack marquée `aria-hidden` dans le drawer sauf pour les labels individuels (évitant duplication verbale).

### Avantages
- Économie visuelle : supprime un flux horizontal et libère espace pour le titre long.
- Lisibilité accrue sur mobiles / petites largeurs de colonnes.
- Mise à jour triviale si un troisième badge (ex: SLA) doit s’intégrer (pile extensible).

### Limites
- Sans légende, l’utilisateur novice doit survoler pour comprendre; reste acceptable (tooltips + titres concis).
- Risque de surcharge couleur si ajout futur de tags colorés dans le même coin (prévoir éventuellement regroupement ou overlay menu).

### Statut
DONE



---

## 📌 Tâches courantes (2025-09-25)
Suivi opérationnel des items actifs afin de reprendre facilement sur une autre machine. Mettre à jour les statuts ( [ ] = non démarré, [~] = en cours, [x] = terminé ).

| Statut | Tâche | Détails synthétiques |
|--------|-------|----------------------|
| [x] | Mettre à jour devbook avec les tâches | Section ajoutée (présente) |
| [ ] | Ajouter champ tags Prisma | `Node.tags String[] @default([])` + migration + DTO + mapNode |
| [ ] | Support tags updateNode backend | Validation tableau chaînes (trim, uniq, max 20, longueur tag <=32) |
| [ ] | Progression auto sous-tâches | Recalcul dans `createChildNode` & `toggleChildDone` (progress=round(done/total*100)) |
| [ ] | Enrichir BoardNode blockedExpectedUnblockAt | Exposer dans `BoardNodeDto` (déjà stocké) |
| [ ] | Frontend types & API tags+blocked | Étendre types NodeDetail / update payload |
| [ ] | UI TaskDrawer tags | Chips ajout/suppression + Enter pour ajouter |
| [ ] | Filtre masquer colonne DONE | Toggle local state sur BoardPageShell (ne touche pas backend) |
| [ ] | Badge blocage prolongé | Carte: si BLOCKED et expectedUnblockAt < now -> badge warning |
| [ ] | Build & validation | `npm run build` racine + MAJ DevBook final |

Règles Tags (MVP):
- Stockage direct tableau de chaînes (`String[]`).
- Normalisation: trim, suppression doublons (case-insensitive), filtrer chaînes vides.
- Limites: max 20 tags par tâche, chaque tag 1–32 chars, charset libre (pas de virgule si possible côté UI pour éviter parsing futur).

Reprise rapide: si arrêt pendant migration tags → vérifier que la migration existe dans `prisma/migrations` et relancer `npx prisma migrate dev` dans `apps/backend`.

### ✅ Lot terminé: Tags + Progression auto + Filtre DONE + Badge blocage

Nouveautés livrées (25/09/2025):
- Tags (MVP) : stockage `Node.tags String[]`, UI chips dans TaskDrawer (ajout Enter, suppression ×). Validation côté backend (max 20, ≤32 chars, trim, déduplication case-insensitive).
- Progression auto : recalcul parent (done/total arrondi) lors de `createChildNode`, `toggleChildDone`, `moveChildNode` (transaction unique) — évite incohérences entre sous-tâches et barre de progression.
- Filtre « Masquer colonnes DONE » : toggle local dans `BoardPageShell` (filtrage purement client, pas d’appel réseau supplémentaire).
- Badge blocage prolongé : pastille rouge pulsante si `blockedExpectedUnblockAt < now` sur la carte. (Pour l’instant pas de vérif explicite du comportement BLOCKED faute de `behaviorKey` coté node; acceptable MVP.)

Impacts techniques:
- Backend: ajout field Prisma + migration `add_tags_to_node`; extension DTO `NodeDto`, `UpdateNodeDto`, `BoardNodeDto`; mapping `BoardsService.getBoardWithNodes` enrichi (tags + blockedExpectedUnblockAt) ; recalcul progress parent factorisé (`recomputeParentProgress`).
- Frontend: types étendus (`boards-api.ts`, `nodes-api.ts`, `types.ts`), TaskDrawer (section Tags + dirty diff), BoardPageShell (hideDone via `useMemo`), CardItem (badge overdue + useMemo), ESLint ajustements (retrait any, réduction warnings critiques).

Tests manuels conseillés:
1. Créer sous-tâches (progress auto = 0→% attendu après marquage DONE). 
2. Ajouter plusieurs tags (dont doublons & >32 chars) pour vérifier filtrage & toasts erreurs.
3. Activer / désactiver filtre DONE (colonnes disparaissent / réapparaissent sans flicker DnD).
4. Définir `blockedExpectedUnblockAt` à hier → badge rouge visible; ajuster à futur → badge disparaît.

Pistes next:
- Index de recherche Tag → filtre par tag sur board.
- Couleur/tag count sur carte (limiter bruit visuel, peut-être groupé sous un popover). 
- Batch recalcul progress (éviter recalcul complet si ±1 change). 


---

## 🧪 Réflexions UX à formaliser (Cartes & Filtres Kanban)

### 1. Contenu visible d’une carte sur le board
- ID court de la tâche: format `#44` (affiché avant le titre ou en overlay discret en haut à gauche / style monospace gris).
- Menu contextuel (3 points, coin supérieur droit) ouvrant un sous‑menu :
  1. (Icône crayon) « Éditer la tâche » — doublon avec double‑clic accepté (redondance = discoverability).
  2. (Icône flèches multidirection / dossier déplacé) « Déplacer dans un autre kanban » → ouvre une popup avec arborescence des kanbans parents/frères (ex: `Projets`, `Projets > SIEM`, `Projets > SIEM > Décommissionnement`). Règle: on ne peut pas déplacer vers un de ses descendants pour éviter cycles.
  3. (Icône poubelle rouge) « Supprimer la tâche » → modal de confirmation listant :
     - Option A: supprimer uniquement cette tâche.
     - Option B: supprimer récursivement (afficher total agrégé & distribution type compteur 1.5.1.45 coloré pour matérialiser l’impact).

### 2. Corps de la carte
- Titre (tronqué multi‑ligne contrôlée: 2 lignes max avec ellipsis CSS).
- Extrait description: X premiers caractères (limite ~90–120) optionnel selon un toggle global « Description on/off » dans la barre d’outils du board (préférence volatile locale / future persistance utilisateur).
- Avatar assigné (cercle bas gauche) :
  - Si image utilisateur → image.
  - Sinon initiales: première lettre prénom + première lettre nom (uppercase).
- Indicateur d’échéance à droite de l’avatar :
  - Calcul: `delta = (dueDate - today)` en jours. Affichage sous forme `-11` (jours restants) / `+1` (jours dépassés).
  - Couleurs par défaut (si pas d’estimation durée):
    - > 7 jours: vert.
    - 3–7 jours: orange.
    - ≤ 2 jours ou dépassé (delta <= 2 ou delta > 0 en positif) : rouge.
  - Ajustement si estimation (durée) renseignée (ex: 7j) : on décale les bornes en soustrayant la durée. Exemple: estimation = 7j ⇒ seuil orange = 14 jours restants, seuil rouge = 7 jours restants. Formule générique: `seuilOrange = 7 + estimatedDays`, `seuilRouge = 2 + estimatedDays` (à affiner avec UX). Tooltip: `21/10/2025 estimation 7j` sinon juste la date formatée.
- Compteur enfants `a.b.c.d` (Backlog / En cours / Bloqué / Fait) en bas à droite (déjà implémenté) + icône kanban cliquable devant pour accéder au sous-board.

### 3. Filtres (aucun bouton « valider » — réactif immédiat)
- Par utilisateur (multi‑sélection + option « Aucun » => tous). Ajouter un filtre rapide « Mes tâches » (auto = user connecté).
- Par priorité (multi‑sélection; prévoir tri cohérent si priorité filtrée + option ordre personnalisé).
- Par recherche textuelle (saisie > = 3 caractères pour déclencher; debounce ~300ms) sur : titre + description + tags + éventuellement ID (#44).
- Filtre rapide « Avec sous-kanban » (affiche uniquement les cartes ayant des enfants / un board attaché). Terme alternatif à tester: « Conteneurs » / « Nœuds parents ».
- (Plus tard) Filtre par tags (multi + opérateur ET / OU configurable ? MVP = OU).

### 4. Tri / Ordonnancement intra-colonne
Ordre de priorité final résulte d’une pile de règles :
1. Tri manuel (drag & drop) = couche la plus basse (persisté position).
2. Si tri utilisateur « par priorité » activé → regrouper par niveau (CRITICAL → LOWEST → NONE) tout en conservant l’ordre relatif interne existant par groupe.
3. Option « trier par échéance » : sous‑tri (après regroupement priorité) sur dueAt asc (nulls en bas). Combinaison possible: priorité primaire, deadline secondaire.
4. Future surcharge : tri par effort ou progression (non prioritaire pour l’instant).

### 5. Options d’affichage
- Toggle global « Description » (afficher/masquer extraits).
- (Futur) Toggle « Avatars » ou mode compact mobile.
- (Futur) Densité: confortable / compacte (padding vertical, height cartes).

### 6. Données supplémentaires nécessaires (gap analysis)
- Estimation (durée) champ non encore présent (à introduire: `estimatedDays` float ou heures). Peut vivre dans `statusMetadata.time.estimatedDays` en MVP.
- Assignation principale (owner) vs multi assignments: choisir un champ `primaryAssigneeId` ou dériver du premier assignment.
- Soft-delete stratégie si suppression cascade: journal d’audit (hors scope MVP mais noter besoin).

### 7. Sécurité & contraintes
- Déplacement cross-board: vérifier droits d’écriture sur team cible (même team obligatoirement ? sinon migration appartenance?). MVP: restreindre à même team.
- Suppression récursive: transaction + calcul agrégé préalable (SELECT COUNT + group by colonne comportement) pour afficher distribution avant confirmation.

### 8. Performance & Implémentation progressive
Étapes proposées:
1. Surface UI du menu contextuel (sans actions lourdes) + action Edit existante.
2. Ajout modale déplacement (lecture arborescence: BFS depuis root team, exclure descendants du node courant).
3. Badge échéance dynamique (sans ajustement estimation) puis itération avec estimation.
4. Filtres utilisateurs / priorité / texte.
5. Toggle description + préférence en localStorage.
6. Suppression récursive (back + modal).
7. Ajustements estimation / recalibrage couleurs.

### 9. Risques / Points à clarifier
- Empilage de badges (priorité, effort, overdue, tags) risque surcharge visuelle → prévoir fusion future.
- Tri + filtrage + DnD: s’assurer que le tri virtuel n’écrase pas la position persistée (appliquer transformations présentation seulement, ne pas PATCH tant qu’utilisateur ne réordonne pas explicitement en mode « manuel »).
- Localisation: codes jours restants (`-11`, `+3`) indépendants de locale (OK), tooltips localisés.

### 10. Glossaire rapide
- Overdue: dueAt passée (delta >= 0 => rouge).
- Estimated shift: élargissement des seuils de couleur basé sur estimation.

Fin réflexions — à consolider dans une future RFC avant implémentation.



