# Stratum Dashboards – Roadmap Technique (Phase 2+)

> Cette feuille de route prolonge la Phase 1 livrée et décrit les jalons fonctionnels et techniques prévus pour les lots futurs.
> Elle s'appuie sur `DASHBOARDS_SPEC.md` et enrichit la section 13 du DevBook avec des précisions actionnables.

---
## Vision Globale
| Phase | Focus | Résultat cible |
|-------|-------|----------------|
| Phase 2 | Portefeuille | Vue consolidée multi-boards + priorisation transverse |
| Phase 3 | Financier & Budget | Suivi budgétaire et effort financier |
| Phase 4 | Clôture & Retours | Statistiques post-mortem et apprentissages |
| Phase 5 | Proactivité | Notifications et recommandations |
| Phase 6 | Ouverture | Export et API publique |

Chaque phase se découpe en lots trimestriels avec livraisons incrémentales. Les dépendances techniques sont précisées pour garantir une montée en charge maîtrisée.

---
## Phase 2 – Dashboard Portefeuille
### Objectifs Fonctionnels
- Consolider la santé et la progression de plusieurs kanbans dans une vue unique.
- Introduire des filtres multi-teams et la hiérarchie d'entreprise.
- Permettre une priorisation transverse basée sur l'impact business.

### Évolutions Techniques
- Étendre le service `DashboardsService` avec un mode `PORTFOLIO` (agrégation de boards hétérogènes).
- Mettre en place une table `PortfolioSnapshot` alimentée hebdomadairement pour éviter les requêtes coûteuses.
- Créer des widgets dédiés : `portfolio.healthMatrix`, `portfolio.investmentSplit`, `portfolio.criticalRisks`.
- Adapter le front : nouvelle route `/dashboards/portfolio`, composants de comparaison multi-board, filtres (team, initiative, horizon).

### Pré-requis
- Optimiser le loader des tasks pour supporter la pagination (cf. note technique 14).
- Définir des stratégies de cache Redis pour les agrégations globales.

---
## Phase 3 – Financier & Budget
### Objectifs Fonctionnels
- Introduire des indicateurs de consommation budgétaire et d'effort (OPEX/CAPEX).
- Visualiser la dérive budgétaire, les engagements et le retour sur investissement.

### Évolutions Techniques
- Étendre le modèle Prisma `Task` avec les métadonnées financières prévues (`plannedBudget`, `consumedBudgetPercent`, temps facturable).
- Créer des routines ETL pour synchroniser les données financières externes (ERP / compta).
- Implémenter des widgets : `finance.budgetBurn`, `finance.variance`, `finance.effortMix`, `finance.cashflowForecast`.
- Sécuriser l'accès via de nouveaux rôles (ex. `FINANCE_VIEWER`) et scoper les réponses API.

### Pré-requis
- Revoir le mécanisme de redaction de métadonnées pour supporter des masques basés sur les rôles.
- Mettre en place un module d'autorisation fine (policy-based) côté backend.

---
## Phase 4 – Clôture Projet & Rétrospective
### Objectifs Fonctionnels
- Offrir un rapport synthétique en fin de projet : temps moyen, déviation scope, post-mortem.
- Capitaliser sur les apprentissages avec des cartes d'actions.

### Évolutions Techniques
- Ajout de snapshots rétrospectifs (`ProjectClosureSnapshot`) capturant les statistiques finales.
- Génération de rapports PDF/HTML avec templates (utiliser un worker dédié).
- Widgets : `closure.timeline`, `closure.scopeCreep`, `closure.retrospectiveActions`.
- Intégration avec un module feedback pour suivre les actions post-rétrospective.

### Pré-requis
- Pipeline d'historisation (materialized views ou table) pour stocker les jalons clés (start/end).
- Mise en place d'un service de génération de documents (Node headless Chrome ou service externalisé).

---
## Phase 5 – Notifications Proactives & Personnalisation
### Objectifs Fonctionnels
- Envoyer des alertes sur les blocages critiques, dépassements de seuils, stagnations.
- Permettre aux utilisateurs de personnaliser leur tableau de bord (ordre des widgets, préférences).

### Évolutions Techniques
- Création d'un `NotificationService` (BullMQ + canaux email/Slack).
- Définition d'un moteur de règles configurable (conditions sur widgets, seuils utilisateur).
- Ajout d'une table `UserDashboardLayout` pour stocker l'ordre et la visibilité des widgets.
- Mise à jour du front pour drag & drop, persistance des layouts et gestion des alertes en temps réel (websocket ou SSE).

### Pré-requis
- Étendre `UserSettingsService` pour supporter des préférences avancées (règles d'alertes, canaux).
- Mettre en place une stratégie de throttling / debounce pour éviter le spam de notifications.

---
## Phase 6 – Export & API Publique
### Objectifs Fonctionnels
- Permettre l'export CSV/JSON des données de dashboard.
- Offrir une API publique sécurisée pour alimenter des outils BI externes.

### Évolutions Techniques
- Exposer des endpoints REST/GraphQL avec tokens PAT et rate limiting.
- Implémenter un service d'export (CSV, JSON, potentiellement XLSX) avec génération asynchrone.
- Ajouter un catalogue de schémas (OpenAPI) et un portail développeur minimal.

### Pré-requis
- Audit de sécurité API (OWASP) et mise en place de tests d'intrusion automatisés.
- Observabilité renforcée (Prometheus/Grafana) pour monitorer l'usage API.

---
## Dépendances Transverses
- **Performance (Section 9.4)** : instrumenter des tests de charge synthétiques avant d'activer le mode portefeuille.
- **Observabilité Prometheus** : cible pour Phase 5 afin de suivre l'usage notifications/API.
- **Refactor Loader Tasks** : incontournable pour Phase 2+ (pagination, indexation DB, cache).

---
## Suivi & Prochaine Étape
1. Valider la priorisation avec le Product Owner.
2. Créer des tickets épics dans l'outil de gestion (un épic par phase, lots à détailler).
3. Démarrer la phase 2 en prototypant le mode `PORTFOLIO` côté backend.

Ce document doit être mis à jour à chaque revue trimestrielle ou arbitrage produit.
