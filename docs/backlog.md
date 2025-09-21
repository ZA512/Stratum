# Stratum - Backlog initial

## 1. Phase Fondation (Semaines 1-4)
- Mise en place du monorepo (frontend Next.js, backend NestJS, worker BullMQ) avec CI de base.
- Authentification JWT + OIDC (Google) avec gestion de compte utilisateur (profil, avatar, preferences de langue/theme).
- Gestion des equipes : creation, invitations par email, acceptation/refus, attribution d'un titre global.
- Modele de donnees de base : User, Team, Membership, Node, Board, Column, ActivityLog.
- API REST CRUD pour Nodes et Boards (creation projet, lire tableau racine, mettre a jour meta).
- Colonnes par defaut (Backlog, In Progress, Blocked, Done) parametrables; edition du libelle.
- Gestion Kanban simple (drag & drop colonne/carte, sockets temps reel pour board).
- Implementation breadcrumb fractal minimal (frontend) avec navigation entre niveaux.
- Internationalisation en/en-US et fr/fr-FR avec detection auto + toggle utilisateur.
- Journalisation des actions (creation de node, deplacement de carte) visible par API.

## 2. Phase MVP (Semaines 5-8)
- Types de taches : simple (description, assignation), moyenne (checklist interne), complexe (creation sous-board).
- Conversion dynamique d'une tache simple -> moyenne -> complexe.
- Mise en place des dependances entre nodes (finish-to-start), blocage du passage en Done.
- Module Backlog expirant : parametrage global + override par team, revalidation manuelle, archivage avec restauration.
- Statut Bloque : raison du blocage, rappel auto (BullMQ), selection de la personne a notifier.
- Commentaires et pieces jointes sur les nodes (storage S3-compatible).
- Notifications in-app et email basiques (deplacement, assignation, rappel bloque).
- Theming light/dark + personnalisation par team (palette stockee, preview live).
- Tableau de bord MVP : nombre de taches par statut, temps moyen en bloque, liste des dependances critiques.
- Tests e2e principaux (backend Supertest, frontend Cypress) + documentation OpenAPI generee.

## 3. Phase Extension (Semaines 9-12)
- Automatisations avancees : regles conditionnelles (si bloque > X jours -> escalade), templates de regles.
- Vue portefeuille multi-projets avec filtres (team, statut, responsable, tags).
- Export/Import CSV & JSON pour boards, nodes et themes.
- Integrations initiales : Webhooks generiques, connecteur Slack de notification.
- Gestion offline/optimistic robuste pour drag & drop et edition (retry background).
- Historique complet affichable dans UI (timeline par node + audit global par board).
- Analytics additionnels : burndown chart par board, lead time moyen, heatmap des blocages.
- Module de theming partage/export JSON pour utilisateurs.
- Mise en place de feature flags pour deploiements progressifs (ex: rules engine beta).

## 4. Phase Plus (Post-MVP)
- Application mobile (React Native) reutilisant l'API.
- Integrations profondes (Teams, Jira, Linear) via connecteurs dedies.
- Automatisation avancée (Workflows multi-etapes, scripts personnalisables).
- IA assistive (resumes de tache, suggestion d'actions sur blocage).
- Support multi-region (replication Postgres, CDN assets) et parametrage fuseaux horaires.

## 5. Definition de done globale
- Couverture de tests backend >= 80 %, frontend >= 70 % sur composants critiques.
- Documentation API synchronisee (OpenAPI + collection Postman).
- Monitoring Sentry + tableaux de bord Grafana pour latence, taux d'erreur, temps moyen en blocage.
- Internationalisation verifiee (anglais + francais) pour toutes vues exposees.
- Accessibilite : respects ARIA basique sur kanban et breadcrumb, navigation clavier, contraste AA.

