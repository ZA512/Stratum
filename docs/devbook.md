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
