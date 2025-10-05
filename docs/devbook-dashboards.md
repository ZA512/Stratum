# DevBook Dashboards Stratum

> Scope: Phase 1 (Exécution, Avancement & Prévision, Risques & Santé)  
> Source de vérité fonctionnelle: `DASHBOARDS_SPEC.md`  
> Objectif: Suivi d'implémentation incrémentale avec granularité technique.

---
## 1. Préparation & Modèles
- [ ] Créer modèle Prisma `UserSettings` (userId PK, preferences JSONB)
- [ ] Migration DB appliquée
- [ ] Service `UserSettingsService` (getOrDefault, updatePartial)
- [ ] Valeurs par défaut seuils (coverage=0.40, minSample=5, upcomingDueDays=3, staleInProgressDays=3)

---
## 2. Snapshots Journaliers
- [ ] Modèle `BoardDailySnapshot`
- [ ] Index (boardId, dateUTC) unique
- [ ] Job CRON (BullMQ) daily build snapshots
- [ ] Lazy fill si snapshot jour manquant
- [ ] Fonction calcul: derive counts par board (inclut colonnes behaviors)
- [ ] Rétention: purge > 90 jours
- [ ] Tests unitaires calcul snapshot

---
## 3. Infrastructure Service Dashboards
- [ ] Interface `DashboardRequest`, `DashboardResponse`
- [ ] Interface `WidgetDefinition`, `WidgetContext`, `WidgetResult`
- [ ] Registry initial (tableau definitions)
- [ ] Service `DashboardService.getDashboard()` orchestrant
- [ ] Résolution hiérarchie (SELF/AGGREGATED/COMPARISON)
- [ ] Chargement tâches (projection light)
- [ ] Chargement snapshots conditionnel
- [ ] Application requirements (coverage, minItems, history)
- [ ] Gestion des erreurs isolées par widget
- [ ] Log instrumentation (durée totale + par widget)

---
## 4. Widgets Phase 1 (Implémentation Minimale)
### 4.1 Exécution
- [ ] `exec.priorities`
- [ ] `exec.blocked`
- [ ] `exec.upcomingDue`
- [ ] `exec.wipColumns`
- [ ] `exec.activity24h` (MVP: mouvements uniquement)
- [ ] `exec.needInput`

### 4.2 Avancement & Prévision
- [ ] `progress.percent`
- [ ] `progress.burnup` (requiert snapshots>=3)
- [ ] `progress.throughput`
- [ ] `progress.forecast` (points>=4)
- [ ] `progress.overdue`
- [ ] `progress.criticalAging`
- [ ] `progress.effortWeighted` (coverage effort)

### 4.3 Risques & Santé
- [ ] `risk.healthScore`
- [ ] `risk.agingWip`
- [ ] `risk.blockedPersistent`
- [ ] `risk.overdueDistribution`
- [ ] `risk.flowAnomaly`
- [ ] `risk.concentration` (option si temps)
- [ ] `risk.dataQuality`

---
## 5. Modes & Comparaison
- [ ] Implémentation mode SELF
- [ ] Implémentation mode AGGREGATED
- [ ] Implémentation mode COMPARISON (liste sous-kanbans directs)
- [ ] Filtrage sécuritaire descendants

---
## 6. Calculs & Formules
- [ ] Progression simple DONE/TOTAL
- [ ] Progression pondérée effort
- [ ] Throughput (diff snapshots done)
- [ ] Forecast ETA (mean throughput 7j)
- [ ] Aging WIP (startedAt || createdAt)
- [ ] Overdue (dueAt < now & !DONE)
- [ ] Health Score (poids défaut)
- [ ] Stagnation (dernier mouvement > staleInProgressDays)
- [ ] Flow anomaly heuristique (TODO documented)

---
## 7. Frontend (Pages & Composants)
- [ ] Route /dashboards/execution
- [ ] Route /dashboards/progress
- [ ] Route /dashboards/risk
- [ ] Composant `DashboardLayout`
- [ ] Composant `DashboardWidgetCard`
- [ ] Composant `HiddenWidgetsPanel`
- [ ] Switch hiérarchie (include descendants)
- [ ] Switch comparaison sous-kanbans
- [ ] Skeletons loading
- [ ] i18n clés `dashboard.*`

---
## 8. UX / UI Affinements
- [ ] Couleurs cohérentes (success / warning / danger)
- [ ] Tooltips breakdown health score
- [ ] Pagination (si listes >8 items)
- [ ] Accessibilité focus & aria-label gauges
- [ ] Formattage temps relatif (intl)
- [ ] Messages d’absence de données pédagogiques

---
## 9. Tests
### 9.1 Unitaire Backend
- [ ] Widgets compute chemin nominal
- [ ] Widgets compute no-data
- [ ] Coverage insuffisante => hidden
- [ ] Forecast low confidence
- [ ] Health score breakdown cohérent

### 9.2 Intégration Backend
- [ ] Endpoint EXECUTION SELF
- [ ] Endpoint PROGRESS AGGREGATED
- [ ] Endpoint RISK COMPARISON
- [ ] Cas hiérarchie profonde
- [ ] Cas aucune tâche

### 9.3 Frontend
- [ ] Rendu 3 dashboards (smoke)
- [ ] Masquage widget logique (simulate insufficient coverage)
- [ ] Interaction panel hidden widgets
- [ ] Navigation onglets conservation état

### 9.4 Performance
- [ ] p95 SELF < 400ms dataset synthétique
- [ ] p95 AGGREGATED < 900ms (arbre 3 niveaux)

---
## 10. Observabilité & Logs
- [ ] Log global: dashboard, mode, durationMs
- [ ] Log widget: id, durationMs, status
- [ ] Compteur erreurs widgets
- [ ] (Futur) Export métriques Prometheus

---
## 11. Sécurité
- [ ] Vérification appartenance teamId node
- [ ] Filtrage sous-kanbans non autorisés
- [ ] Pas d’exposition champs financiers Phase 1
- [ ] Tests d’accès interdit (403)

---
## 12. Internationalisation & Accessibilité
- [ ] Ajout namespace i18n `dashboard`
- [ ] Traductions fr/en toutes chaînes
- [ ] aria-label pour gauges & histogrammes
- [ ] Contraste vérifié
- [ ] Texte alternatif icônes critiques

---
## 13. Roadmap Technique Future (Cases grisées)
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
- [ ] Décision futur stockage Materialized Stats
- [ ] Ajuster seuil coverage adaptatif (ex: 0.4 -> 0.3 si <X tâches)
- [ ] Ajouter horodatage dernier refresh dataset client
- [ ] Refactor tasks loader pour pagination si > N (ex: 5000)

---
## 15. Definition of Done (Phase 1)
- [ ] 100% widgets Phase 1 implémentés
- [ ] Tests verts (unitaires + intégration + front smoke)
- [ ] p95 performance respectée
- [ ] Documentation DASHBOARDS_SPEC.md alignée (pas de divergence)
- [ ] DevBook mis à jour (ce fichier)
- [ ] Checklist migrée vers outil de suivi si nécessaire

---
_Actualiser les cases au fur et à mesure. En cas de modification structurelle, mettre à jour aussi `DASHBOARDS_SPEC.md`._
