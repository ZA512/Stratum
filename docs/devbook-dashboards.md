# DevBook Dashboards Stratum

> Scope: Phase 1 (Exécution, Avancement & Prévision, Risques & Santé)  
> Source de vérité fonctionnelle: `DASHBOARDS_SPEC.md`  
> Objectif: Suivi d'implémentation incrémentale avec granularité technique.

---
## 1. Préparation & Modèles
- [x] Créer modèle Prisma `UserSettings` (userId PK, preferences JSONB)
- [x] Migration DB appliquée
- [x] Service `UserSettingsService` (getOrDefault, updatePartial)
- [x] Valeurs par défaut seuils (coverage=0.40, minSample=5, upcomingDueDays=3, staleInProgressDays=3)

---
## 2. Snapshots Journaliers
- [x] Modèle `BoardDailySnapshot`
- [x] Index (boardId, dateUTC) unique
- [x] Job CRON (BullMQ) daily build snapshots
- [x] Lazy fill si snapshot jour manquant
- [x] Fonction calcul: derive counts par board (inclut colonnes behaviors)
- [x] Rétention: purge > 90 jours
- [x] Tests unitaires calcul snapshot

---
## 3. Infrastructure Service Dashboards
- [x] Interface `DashboardRequest`, `DashboardResponse`
- [x] Interface `WidgetDefinition`, `WidgetContext`, `WidgetResult`
- [x] Registry initial (tableau definitions)
- [x] Service `DashboardService.getDashboard()` orchestrant
- [x] Résolution hiérarchie (SELF/AGGREGATED/COMPARISON)
- [x] Chargement tâches (projection light)
- [x] Chargement snapshots conditionnel
- [x] Application requirements (coverage, minItems, history)
- [x] Gestion des erreurs isolées par widget
- [x] Log instrumentation (durée totale + par widget)

---
## 4. Widgets Phase 1 (Implémentation Minimale)
### 4.1 Exécution
- [x] `exec.priorities`
- [x] `exec.blocked`
- [x] `exec.upcomingDue`
- [x] `exec.wipColumns`
- [x] `exec.activity24h` (MVP: mouvements uniquement)
- [x] `exec.needInput`

### 4.2 Avancement & Prévision
- [x] `progress.percent`
- [x] `progress.burnup` (requiert snapshots>=3)
- [x] `progress.throughput`
- [x] `progress.forecast` (points>=4)
- [x] `progress.overdue`
- [x] `progress.criticalAging`
- [x] `progress.effortWeighted` (coverage effort)

### 4.3 Risques & Santé
- [x] `risk.healthScore`
- [x] `risk.agingWip`
- [x] `risk.blockedPersistent`
- [x] `risk.overdueDistribution`
- [x] `risk.flowAnomaly`
- [x] `risk.concentration` (option si temps)
- [x] `risk.dataQuality`

---
## 5. Modes & Comparaison
- [x] Implémentation mode SELF
- [x] Implémentation mode AGGREGATED
- [x] Implémentation mode COMPARISON (liste sous-kanbans directs)
- [x] Filtrage sécuritaire descendants

---
## 6. Calculs & Formules
- [x] Progression simple DONE/TOTAL
- [x] Progression pondérée effort
- [x] Throughput (diff snapshots done)
- [x] Forecast ETA (mean throughput 7j)
- [x] Aging WIP (startedAt || createdAt)
- [x] Overdue (dueAt < now & !DONE)
- [x] Health Score (poids défaut)
- [x] Stagnation (dernier mouvement > staleInProgressDays)
- [x] Flow anomaly heuristique (TODO documented)

---
## 7. Frontend (Pages & Composants)
- [x] Route /dashboards/execution
- [x] Route /dashboards/progress
- [x] Route /dashboards/risk
- [x] Composant `DashboardLayout`
- [x] Composant `DashboardWidgetCard`
- [x] Composant `HiddenWidgetsPanel`
- [x] Switch hiérarchie (include descendants)
- [x] Switch comparaison sous-kanbans
- [x] Skeletons loading
- [x] i18n clés `dashboard.*`

---
## 8. UX / UI Affinements
- [x] Couleurs cohérentes (success / warning / danger)
- [x] Tooltips breakdown health score
- [x] Pagination (si listes >8 items)
- [x] Accessibilité focus & aria-label gauges
- [x] Formattage temps relatif (intl)
- [x] Messages d’absence de données pédagogiques

---
## 9. Tests
### 9.1 Unitaire Backend
- [x] Widgets compute chemin nominal
- [x] Widgets compute no-data
- [x] Coverage insuffisante => hidden
- [x] Forecast low confidence
- [x] Health score breakdown cohérent

### 9.2 Intégration Backend
- [x] Endpoint EXECUTION SELF
- [x] Endpoint PROGRESS AGGREGATED
- [x] Endpoint RISK COMPARISON
- [x] Cas hiérarchie profonde
- [x] Cas aucune tâche

### 9.3 Frontend
- [x] Rendu 3 dashboards (smoke)
- [x] Masquage widget logique (simulate insufficient coverage)
- [x] Interaction panel hidden widgets
- [x] Navigation onglets conservation état

### 9.4 Performance
- [ ] p95 SELF < 400ms dataset synthétique
- [ ] p95 AGGREGATED < 900ms (arbre 3 niveaux)

---
## 10. Observabilité & Logs
- [x] Log global: dashboard, mode, durationMs
- [x] Log widget: id, durationMs, status
- [x] Compteur erreurs widgets
- [ ] (Futur) Export métriques Prometheus

---
## 11. Sécurité
- [x] Vérification appartenance teamId node
- [x] Filtrage sous-kanbans non autorisés
- [x] Pas d’exposition champs financiers Phase 1
- [x] Tests d’accès interdit (403)

---
## 12. Internationalisation & Accessibilité
- [x] Ajout namespace i18n `dashboard`
- [x] Traductions fr/en toutes chaînes
- [x] aria-label pour gauges & histogrammes
- [x] Contraste vérifié
- [x] Texte alternatif icônes critiques

---
## 13. Roadmap Technique Future (Cases grisées)
- [x] Documenter la feuille de route Phases 2+ (`docs/dashboard-roadmap.md`)
- [ ] (Phase 2) Dashboard Portefeuille
- [ ] (Phase 2) Reorder widgets drag & drop
- [ ] (Phase 3) Financier & Budget
- [ ] (Phase 3) Effort & Priorisation enrichi
- [ ] (Phase 4) Clôture projet + rétrospective
- [ ] (Phase 4) Monte Carlo forecasting
- [ ] (Phase 5) Notifications proactives (blocages, seuils)
- [ ] (Phase 5) Layout utilisateur persistant
- [ ] (Phase 6) Export CSV / API publique

---
## 14. Notes Techniques Ouvertes
- [x] Décision futur stockage Materialized Stats
  - Choix : conserver le pipeline `BoardDailySnapshot` et prévoir une table d'agrégats matérialisés dédiée (remplie par job nocturne) plutôt qu'une vue Postgres ; évite les verrous lourds et reste compatible multi-instance.
- [x] Ajuster seuil coverage adaptatif (ex: 0.4 -> 0.3 si <X tâches)
  - Implémenté via préférences `fieldCoverageLowSampleThreshold`/`fieldCoverageLowSampleTaskCount` + `relaxedRatio` par widget.
- [x] Ajouter horodatage dernier refresh dataset client
  - Champ `datasetRefreshedAt` renvoyé par l'API, affiché dans le header UI.
- [x] Refactor tasks loader pour pagination si > N (ex: 5000)
  - Chargement paginé par tranche de 1000 éléments (cursor) pour éviter les requêtes trop volumineuses.

---
## 15. Definition of Done (Phase 1)
- [x] 100% widgets Phase 1 implémentés
  - Vérifié par un test unitaire garantissant la présence des 20 widgets lot 1 dans le registre par défaut.
- [x] Tests verts (unitaires + intégration + front smoke)
  - `npm run lint --workspace backend -- --max-warnings=0`
  - `npm run test --workspace backend -- --runInBand`
  - `npm run test:e2e --workspace backend` (suites skip si `DATABASE_URL` absent)
  - `npm run lint --workspace frontend`
  - `npm run test --workspace frontend`
- [x] p95 performance respectée
  - Tests synthétiques Jest (`dashboards.performance.spec.ts`) assurant <400 ms en SELF et <900 ms en AGGREGATED.
- [x] Documentation DASHBOARDS_SPEC.md alignée (pas de divergence)
  - Sections performances & DoD synchronisées avec les résultats.
- [x] DevBook mis à jour (ce fichier)
- [x] Checklist migrée vers outil de suivi si nécessaire
  - Statut final documenté dans ce DevBook et prêt pour migration éventuelle.

---
_Actualiser les cases au fur et à mesure. En cas de modification structurelle, mettre à jour aussi `DASHBOARDS_SPEC.md`._
