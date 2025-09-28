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

## 🗓️ Tâches courantes - 02/10/2025
- [x] Drawer tâche : ajout des champs RACI multi-sélection (R, A, C, I) et synchronisation avec l’API équipes.
- [x] Drawer tâche : mode expert avec onglets « Classique » / « Temps & coût », suivi temps/budgets (estimations, OPEX, CAPEX, taux horaire, budgets) et calcul du coût réel.
- [x] Cartes kanban : affichage progression (%) et infobulle RACI consolidée sur la vue board.
- [x] Paramètre board : persistance du mode expert et intégration dans le filtre (toggle disponible côté board UI settings).
- [ ] Tests automatisés : ajouter la couverture sur la validation numérique et la persistance RACI.

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

3) ~~RACI (4 zones d’assignation par rôle)~~ ✅
   - Implémenté backend (DTO/services) + drawer front (multi-sélection avec recherche, puces retirables, chargement membres d’équipe).
   - Persisté via `updateNode` (payload RACI) avec recalcul du diff tracking.

4) ~~Mode Expert (onglets Tâche / Temps)~~ ✅
   - Toggle disponible dans les filtres du board (persisté) ouvrant les onglets « Classique » / « Temps & coût ».
   - Bloc Temps & effort : estimations, temps réels OPEX/CAPEX, planning, statut facturation.
   - Bloc Coûts & budgets : taux horaire, coût réel calculé, budget prévu et consommé (€, %).
   - Validation des saisies numériques (virgule/point) et mapping complet côté backend/front.

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
- [x] B. Priorité (Prisma + DTO + UI simple) — migration: add_priority_to_node, UI select dans drawer
- [x] C. Effort (Prisma + DTO + UI simple)
- [x] D. Tags (MVP: String[] + UI chips)
- [x] E. RACI (MVP via metadata; UI chips + endpoint users équipe)
- [x] F. Mode Expert (onglets + champs temps/coûts en metadata; future normalisation Prisma)

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
 
### 2025-09-28 – Uniformisation largeur colonnes & simplification progression (Board)

Objectifs:
1. Stabiliser la grille visuelle: toutes les colonnes ont exactement la même largeur quelle que soit la longueur des titres ou la présence de description.
2. Réduire la charge visuelle par carte: suppression de la barre de progression (bruit et densité sur petit format) au profit d’un pourcentage compact.
3. Préparer un futur mode « compact » sans introduire de décalages dynamiques (slots réservés / placeholders).

Implémentation:
- `ColumnPanel.tsx`: remplacement `min-w / max-w` par `w-[320px]` (valeur de référence). Cette constante pourra être factorisée dans un token Tailwind si on ajoute un mode densité.
- `task-card.tsx`: suppression du conteneur barre; ajout d’un bloc fixe (min-w 42px) affichant `NN%` ou `--` si aucune progression. Alignement garanti entre cartes.
- Footer TaskCard conservé en grid 12 colonnes; l’ordre relatif des autres items (complexité, fractal path) reste stable.

Raisons:
- Ergonomie: les variations de largeur perturbent la lecture horizontale et la mémoire spatiale.
- Performance cognitive: barre + pourcentage doublonnent l’information; garder le nombre suffit à ce stade.

Pistes futures:
- Introduire un mode densité réduite (280px) piloté par préférence utilisateur (`localStorage`).
- Revenir à une jauge minimaliste (mini-sparkline) seulement si la progression devient un signal clé (ex: > 30% des cartes suivies par progression incrémentale).
- Exposer `COLUMN_WIDTH` via CSS custom property pour adaptation responsive conditionnelle.

Impacts tests manuels:
1. Vérifier absence de “saut” lors du toggle description on/off.
2. Vérifier DnD: la hitbox reste identique (aucun shrink inattendu).
3. Vérifier accessibilité: le pourcentage a un `title` (tooltip) lorsque présent et un fallback `--` sinon.

Statut: DONE.

### 2025-09-28 – Stabilisation barre filtres (bouton Réinitialiser)

Problème: l’apparition/disparition du bouton « Réinitialiser » décalait les autres commandes (pillules et bouton filtres avancés), générant un “layout shift” irritant.

Solution: retrait du bouton de la rangée principale; insertion d’un bouton positionné absolument en bas à droite du conteneur de la barre (`absolute bottom-3 right-4`).

Effets:
* Plus aucun déplacement horizontal lors de l’activation/désactivation de filtres.
* Visibilité suffisante (contraste + hover) sans polluer l’espace des filtres rapides.
* Accessibilité: rôle conservé (bouton standard). Pas d’aria supplémentaire requis.

Points futurs éventuels:
* Ajouter raccourci clavier (ex: Alt+R) pour reset rapide.
* Afficher compteur de filtres actifs à côté de l’icône (déjà pastille, peut évoluer en badge numérique).

Statut: DONE.

### 2025-09-28 – Toggle Mode Expert & Tooltip RACI custom

Objectifs:
1. Rendre activable le mode expert déjà câblé (temps, coûts, onglets) sans manipulation manuelle du localStorage.
2. Améliorer la lisibilité du RACI sur les cartes via un tooltip multi‑ligne stable (éviter limitations du `title` natif).

Implémentation:
- Barre filtres (`BoardPageShell.tsx`): ajout d’une pillule `Expert on/off` utilisant `useBoardUiSettings()` (persistance locale par équipe).
- `task-card.tsx`: remplacement de l’attribut `title` pour les avatars par un tooltip custom accessible (role=tooltip, `aria-describedby`). Ouverture au survol/focus, fermeture au blur/mouseleave. Rendu multi‑ligne via `whitespace-pre-line`.

Accessibilité:
- Navigation clavier: focus sur le premier avatar déclenche l’affichage; sortie (blur) le ferme.
- Pas de piège focus: tooltip purement décoratif (pas focusable).

Limites & pistes:
- Pas encore de delay ou d’animation (peut être ajouté si besoin).
- Fermeture sur scroll non gérée (considérée acceptable pour MVP; possibilité d’écouter `scroll` parent si nécessaire).

Statut: DONE.

### 2025-09-28 – Redirection automatique session expirée

Problème: l’utilisateur restait bloqué sur une page avec erreurs réseau après expiration / invalidation de session, sans retour automatique au login.

Solution:
* `auth-provider.tsx`: au montage, si aucune session locale et route != /login → redirection `/login?next=...`.
* `logout()` accepte maintenant `{ returnTo }` et redirige vers `/login?next=`.
* Wrapper `handleApi` (BoardPageShell) déclenche `logout()` sur 401 détecté.
* Page login: après succès, si param `next` commençant par `/`, redirection vers cette cible; sinon `/`.

Avantages: UX cohérente, pas de confusion “network error”, deep-link conservé.

Prochaines pistes: interceptor fetch global, rafraîchissement silencieux sur onglets multiples (BroadcastChannel).

Statut: DONE.

### 2025-09-28 – Tooltip RACI anti‑flicker

Amélioration UX mineure du tooltip custom RACI sur les avatars des cartes.

Changements:
* Délai d’ouverture: 150 ms avant affichage (évite les apparitions/disparitions rapides lors de simples traversées de la souris).
* Fermeture sur scroll fenêtre (suppression immédiate du tooltip pour éviter qu’il flotte hors contexte après un scroll violent).
* Implémentation: timer + `useEffect` d’abonnement scroll dans `task-card.tsx`.

Motivation:
* Réduction du bruit visuel quand on survole simplement la zone d’avatars en allant cliquer ailleurs.
* Conformité avec patterns de tooltips “intent-based” (délai modéré < 200 ms).

Pistes futures:
* Détection de scroll parent spécifique plutôt que globale window si virtualisation introduite.
* Ajout d’une légère animation fade/scale (actuellement apparition instantanée pour clarté).

Statut: DONE.

---

## Section : Inviter ou partager ou utilisateur

### Règles de base

- [ ] **Vérité globale** : Un nœud (tâche/projet) a un statut et un contenu uniques, partagés par tous les invités.
- [ ] **Rangement local** : Chaque utilisateur peut organiser une tâche partagée dans n’importe quel kanban ou colonne de son choix. Le placement d’un nœud dans un kanban n’affecte pas les autres utilisateurs.
- [ ] **Atterrissage des partages** : L’utilisateur choisit un dossier d’arrivée par défaut (racine ou kanban choisi). Option "Demander à chaque partage" disponible.
- [ ] **Synchronisation des statuts** : La synchro se fait par comportement (`backlog`, `en_cours`, `bloque`, `revue/test`, `termine`, `annule`).
- [ ] **"Terminé" protégé** : Un nœud parent ne passe `termine` que si 100% de sa descendance est `termine`.

### Invitations & héritage

- [ ] **Accès hérité** : Inviter sur un parent donne accès à tout son sous-arbre.
- [ ] **Dé-doublonnage à l’invite** : Si l’invité a déjà l’accès via un parent, l’invitation est bloquée avec un message explicatif.

### Cas limites

- [ ] **Parent partagé après enfant** : Consolidation par défaut avec option "Annuler" ou "Garder séparé".
- [ ] **Sous-tâche partagée après tâche** : Prévenir que le partage est inutile si l’accès est déjà hérité.
- [ ] **Alias volontaire** : L’utilisateur peut créer un deuxième montage du même nœud avec badge "Alias".

### UX à l’ouverture & messages

- [ ] **Toast d’arrivée** : Infini jusqu’à fermeture, indique le partage et la destination.
- [ ] **Modale d’invitation** : Affiche l’état d’accès du destinataire et empêche les doublons inutiles.

### Scénarios → Résultat attendu

| Scénario | Résultat |
|----------|----------|
| Parent partagé après enfant | Consolidation par défaut avec toast persistant |
| Enfant partagé après parent | Accès direct confirmé sans nouveau montage |
| Alias volontaire | Badge "Alias" + lien "Aller à l’original" |

### Implémentation technique

#### Modèle de données

- `node(id, parent_id, status, …)` — vérité globale.
- `mount(id, user_id, node_id, local_parent_mount_id nullable, order)` — placements locaux (alias).
- `access(node_id, principal_id, mode: direct|inherited, role)` — droits.
- `board_prefs(user_id|team_id, mapping: {behavior: column_id})`.

#### Endpoints API

- `POST /nodes/:id/share` : Partager un nœud avec un utilisateur.
- `POST /nodes/:id/invite` : Inviter un utilisateur sur un nœud.
- `PATCH /nodes/:id/status` : Modifier le statut d’un nœud.
- `GET /nodes/:id/access` : Voir les droits d’accès.

#### Algorithmes clés

- **Réception d’une invitation**

```typescript
if hasAccessViaAncestor(user, node): block_invite()  // déjà couvert par héritage
grantDirectAccess(user, node)
dest = user.shareLanding()  // racine ou kanban choisi
if hasMount(user, node): toast("Accès direct confirmé"); return
createMount(user, node, dest)

// consolidation si parent reçu après enfants
for child in mountedDescendants(user, node):
    moveMountUnder(child, mountOf(user,node))
showToast("Consolidation … [Annuler] [Garder séparé]")
```

- **Changement de statut** → emit event; chaque client place le nœud dans sa colonne préférée du même comportement.
- **Dé-doublonnage recherche/notifications** → `SELECT DISTINCT node_id …`.

## Restauration Tooltip RACI

- [ ] **Cause disparition** : refactoring intermédiaire — dépendance sur `assigneeTooltip` uniquement, absence de fallback lorsque les props RACI ID legacy étaient fournies sans la chaîne calculée.
- [ ] **Correctif** : ajout d'un `computedTooltip` qui :
  - privilégie la valeur `assigneeTooltip` si déjà calculée par un composant parent (multi-ligne avec noms complets)
  - sinon reconstruit un tooltip minimal depuis `responsibleIds | accountableIds | consultedIds | informedIds`
- [ ] **Accessibilité** : `aria-describedby` actif uniquement quand ouvert; délai ouverture 150ms; fermeture sur scroll & blur.
- [ ] **Fallback absence** : si aucune donnée RACI -> pas de listeners (évite coût inutile).
- [ ] **Test manuel** : survol avatars avec / sans données RACI; vérifier fermeture lors d'un scroll.




