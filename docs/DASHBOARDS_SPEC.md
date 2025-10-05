# Stratum – Spécification Exhaustive Dashboards (Phase 1 + Vision Étendue)

> Version: 1.0 (2025-10-05)  
> Statut: Draft fonctionnel enrichi (complet)  
> Périmètre: Dashboards Exécution, Avancement & Prévision, Risques & Santé (Phase 1) + Fondations futures (Portefeuille, Financier, etc.)

---
## 0. Objectif du Document
Fournir à tout lecteur (humain / IA) une vision **intégrale**, sans perte d'information, de la philosophie, des besoins fonctionnels, concepts techniques et évolutions envisagées pour le système de dashboards fractals de Stratum. Ce document doit permettre de développer, tester, étendre et maintenir la solution sans ambiguïtés.

---
## 1. Philosophie & Principes Directeurs
- **Intentionalité** : Chaque dashboard répond à une intention cognitive unique (Action, Progression, Prévention).  
- **Fractalité** : Tout tableau (kanban) peut contenir des sous-kanbans récursifs. Les dashboards doivent opérer à différents niveaux (SELF / AGGREGATED / COMPARISON).  
- **Progressivité des widgets** : Pas d'affichage de bruit statistique. Un widget n'apparaît que si ses prérequis de qualité/volume sont atteints.  
- **Transparence** : Les widgets non affichés sont listés avec une raison explicite.  
- **Configuration progressive** : Seuils adaptables (par utilisateur) mais valeurs par défaut raisonnables pour une mise en route immédiate.  
- **Neutralité d'affichage (non-RACI dynamique)** : Pas d'adaptation cachée selon le rôle ; le focus se fait via l'intention propre du dashboard. Les rôles choisissent ce qu'ils consultent.  
- **Extensibilité “Widget-first”** : Architecture modulaire permettant plus tard d'ajouter le repositionnement, la personnalisation, un store marketplace interne.  
- **Qualité explicable** : Toute métrique dérivée (Health Score, projection) expose sa décomposition.  
- **Économie cognitive** : Limitation à 3 dashboards initiaux (justifiés). Ajouts futurs uniquement si un besoin distinct apparaît (Portefeuille, Financier, Clôture, etc.).

---
## 2. Périmètre Phase 1
Dashboards livrés :
1. **Exécution (Opérationnel)**  
2. **Avancement & Prévision**  
3. **Risques & Santé**

Fonctionnalités transverses Phase 1 :
- Modes: SELF, AGGREGATED (descendants), COMPARISON (sous-kanbans directs). COMPARISON activé pour Avancement & Prévision + Risques & Santé.  
- Système de widgets modulaires.  
- Snapshots journaliers (burnup / throughput minimal).  
- Health Score V1 documenté.  
- Paramétrages utilisateur (seuils couverture, min échantillon, aging).  

Hors périmètre immédiat mais cadré : Portefeuille (multi-sous-kanban massif), Financier, Temps & Productivité, Effort & Priorisation, Collaboration, Clôture Projet.

---
## 3. Rôles & Besoins Fonctionnels
| Rôle | Questions Principales | Dashboard de Référence |
|------|-----------------------|-------------------------|
| Responsible (R) | Que faire maintenant ? Qu'est bloqué ? WIP ? Urgent ? | Exécution |
| Accountable (A) | Sommes-nous dans les temps ? Fin prévue ? Risques macro ? | Avancement & Prévision / Risques & Santé |
| Consulted (C) | Où intervenir (blocage technique, stagnation) ? | Exécution / Risques & Santé |
| Informed (I) | État global ? % fait ? Alerte risque ? | Avancement & Prévision / Risques & Santé |

Remarque : On ne fusionne pas Exécution et Risques car horizons cognitifs différents (immédiat vs préventif). On ne fusionne pas Avancement & Risques pour préserver la lisibilité de trajectoire.

---
## 4. Glossaire (Opérationnel)
| Terme | Définition |
|-------|------------|
| Kanban | Board attaché à un Node (racine fractale). |
| Sous-kanban | Node enfant possédant un Board. |
| SELF | Analyse du board courant uniquement. |
| AGGREGATED | Board courant + tous descendants récursifs. |
| COMPARISON | Tableau comparatif des sous-kanbans directs (pas récursifs). |
| Widget | Unité fonctionnelle autonome (graphique, table). |
| Couverture | % des tâches disposant d'un champ (ex: effort), au-dessus d'un seuil configuré. |
| Snapshot | Agrégat journalier (counts par état). |
| Health Score | Score composite 0–100 basé sur risques (overdue, blocages...). |
| Aging WIP | Temps écoulé depuis début (ou dernière progression). |
| Throughput | Nombre de tâches passées à DONE par période. |
| Overdue | Tâche dont dueAt < now et non DONE. |

---
## 5. Données Utilisées (Résumé Utilitaire)
Champs Node pertinents : `id`, `title`, `parentId`, `teamId`, `columnId`, `path`, `depth`, `position`, `createdAt`, `updatedAt`, `dueAt?`, `blockedSince?`, `blockedReason?`, `progress?`, `effort?`, `priority?`, `metadata.status` (ex: `statusMetadata.startedAt`, `statusMetadata.doneAt`).  
Colonnes : `id`, `boardId`, `behavior.key`, `wipLimit`.  
Snapshots : counts BACKLOG / IN_PROGRESS / BLOCKED / DONE / TOTAL par jour.  
Paramètres utilisateur : seuils, jours d'anticipation, aging, etc.

Champs futurs (non exploités Phase 1 mais anticipés) : finances (`plannedBudget`, `consumedBudgetPercent`), temps (`actualOpexHours`, `actualCapexHours`, `estimatedTimeHours`), RACI enrichi, partages (`metadata.share`).

---
## 6. Modes Hiérarchiques
### 6.1 SELF
Sélectionne uniquement les tâches rattachées au Board du Node (exclut descendants fractals sauf conversion explicite).

### 6.2 AGGREGATED
Inclut le Node + tous les Nodes descendants possédant ou non un Board (tâches profondes). Filtrage possible par profondeur future.

### 6.3 COMPARISON
Génère un tableau synthétique : une ligne par sous-kanban direct (enfant ayant un Board). Champs minimaux : `%done`, `blockedCount`, `overdueRatio`, `throughput7d`, `healthScore`.

---
## 7. Widgets – Cadre Technique
```ts
interface WidgetDefinition {
  id: string;
  dashboard: 'EXECUTION' | 'PROGRESS' | 'RISK';
  label: string;
  description: string;
  supportedModes: Array<'SELF' | 'AGGREGATED' | 'COMPARISON'>;
  requirements?: {
    minItems?: number;
    minCoverage?: Array<{ field: string; ratio: number; relaxedRatio?: number }>;
    historyDays?: number;
  };
  compute(ctx: WidgetContext): Promise<WidgetResult>;
}

interface WidgetResult {
  status: 'ok' | 'no-data' | 'insufficient-coverage' | 'insufficient-history';
  reason?: string;
  payload?: any;
  meta?: Record<string, any>;
}
```

`datasetRefreshedAt` correspond au dernier horodatage observé parmi les tâches chargées et les snapshots journaliers utilisés pour calculer les widgets.
Affichage : seuls les widgets `status=ok` sont rendus. Les autres vont dans `hiddenWidgets`.

---
## 8. Seuils & Paramétrage Utilisateur
| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `fieldCoverageThreshold` | 0.40 | Couverture minimum champ (effort, estimation, etc.) |
| `fieldCoverageLowSampleThreshold` | 0.30 | Couverture minimale acceptée lorsque l'échantillon est faible |
| `fieldCoverageLowSampleTaskCount` | 25 | Taille d'échantillon en dessous de laquelle on applique le seuil relaxé |
| `minSample` | 5 | Taille minimale pour distributions / aging fiable |
| `upcomingDueDays` | 3 | Fenêtre échéances imminentes |
| `staleInProgressDays` | 3 | Seuil stagnation In Progress |
| `blockedAgingHighlightDays` | 2 | Blocage “long” |
| `forecastMinThroughputPoints` | 4 | Points min pour projection |
| `agingWipMin` | 3 | Items min pour afficher l'Aging WIP |

Stockage recommandé : table `UserSettings (userId PK, preferences JSONB)`.

> **Adaptation faible échantillon** : lorsque le nombre de tâches chargées est inférieur à `fieldCoverageLowSampleTaskCount`, les widgets peuvent relâcher leurs exigences de couverture jusqu'à `fieldCoverageLowSampleThreshold` (ou au `relaxedRatio` fourni par le widget) afin d'éviter de masquer des indicateurs pertinents sur de petits kanbans.

---
## 9. Health Score V1
### 9.1 Composantes
| Élément | Ratio | Formule Ratio |
|---------|-------|---------------|
| Overdue | R1 | overdueTasks / tasksWithDueAt |
| Blocked | R2 | blockedTasks / totalTasks |
| Stale In Progress | R3 | staleInProgress / inProgress |
| Missing DueAt | R4 | tasksWithoutDueAt / totalTasks |
| (Futur) Scope Creep | R5 | addedAfter70pct / totalTasks |

### 9.2 Poids par défaut
| Composante | Poids |
|------------|------|
| Overdue | 30 |
| Blocked | 25 |
| Stale | 20 |
| Missing Due | 10 |
| Scope Creep (futur) | 15 |

### 9.3 Formule
```
score = 100 - (R1*30 + R2*25 + R3*20 + R4*10 + R5*15)
Clamp 0..100
Zones: >=80 Vert, 50–79 Orange, <50 Rouge
```
### 9.4 Exemple
```
R1=0.12 => 3.6
R2=0.05 => 1.25
R3=0.08 => 1.6
R4=0.40 => 4.0
Score ≈ 89.55 => 90
```

---
## 10. Snapshots Journaliers
### 10.1 Structure
Table `BoardDailySnapshot` : `id`, `boardId`, `dateUTC`, `backlog`, `inProgress`, `blocked`, `done`, `total`.
### 10.2 Génération
- CRON nocturne (UTC) + lazy fill si manquant.
- Rétention: 90 jours (paramétrable). Archivage futur.
### 10.3 Utilisation
- Burnup (Done vs Total).
- Throughput (diff successifs doneCount).  
- Sparkline progression future.

---
## 11. Détails Dashboards & Widgets Phase 1
### 11.1 Dashboard Exécution (Opérationnel)
**But** : Décision immédiate (0–3 jours).  
**Widgets** :
| ID | Nom | Représentation | Détails Données | Conditions |
|----|-----|----------------|-----------------|-----------|
| exec.priorities | Priorités immédiates | Liste triée | Heuristique tri: dueAt asc (dans fenêtre) > blocages récents > nouvelles (<24h) | ≥1 tâche |
| exec.blocked | Blocages actifs | Liste | titre, durée HH:MM, raison (si) | ≥1 blocked |
| exec.upcomingDue | Échéances proches | Liste groupée | Groupes J+0, J+1, J+2..N | dueAt dans fenêtre |
| exec.wipColumns | WIP par colonne | Barres horizontales | count vs wipLimit (coloration >80%) | toujours |
| exec.activity24h | Activité 24h | Histogramme 6 tranches 4h | mouvements (changements colonne) + commentaires (futur) | ≥1 evt |
| exec.needInput | Besoin d’input | Liste | tâches sans description OU dueAt imminent sans progress | ≥1 cas |

### 11.2 Dashboard Avancement & Prévision
**But** : Trajectoire, où allons-nous, sommes-nous en retard ?  
**Widgets** :
| ID | Nom | Type | Détails | Conditions |
|----|-----|------|---------|-----------|
| progress.percent | Progression % | KPI | done/total *100 | total>0 |
| progress.burnup | Burnup | Courbe (2 séries) | Done cumul vs Total cumul (snapshots) | snapshots≥3 |
| progress.throughput | Throughput 7/14j | Barres | done/d chaque jour + moyenne glissante | snapshots≥3 |
| progress.forecast | Projection fin | Texte + intervalle | ETA = remaining / meanThroughput7 | throughputPoints≥4 |
| progress.overdue | Overdue KPIs | Badges | count, ratio | ≥1 dueAt |
| progress.criticalAging | Tâches stagnantes | Liste | in progress > staleInProgressDays | ≥1 |
| progress.effortWeighted | Progress effort | Gauge | Σ effort done / Σ effort total | coverage effort>=threshold |

### 11.3 Dashboard Risques & Santé
**But** : Prévention dérives flux.  
**Widgets** :
| ID | Nom | Type | Détails | Conditions |
|----|-----|------|---------|-----------|
| risk.healthScore | Health Score | Gauge + breakdown | Score composite | total>0 |
| risk.agingWip | Aging WIP | Tableau tri | âge décroissant, colonne, temps dernier update | inProgress≥agingWipMin |
| risk.blockedPersistent | Blocages longs | Liste | blockedSince > blockedAgingHighlightDays | ≥1 |
| risk.overdueDistribution | Retards (distribution) | Histogramme (4–5 buckets) | 1–2, 3–5, 6–10, >10 jours | overdue≥1 |
| risk.flowAnomaly | Anomalies flux | Indicateur + liste courte | colonnes sans changement N jours, done stagnation vs backlog ↑ | snapshots≥3 |
| risk.concentration | Concentration | Barres | % tâches top 1 / top 2 colonnes | total≥minSample |
| risk.dataQuality | Qualité données | Liste métriques | % sans dueAt, % sans description, % sans effort | total>0 |

---
## 12. COMPARISON Mode – Contenu Minimal
Applicable aux dashboards Avancement & Prévision, Risques & Santé.
Table des sous-kanbans directs : colonnes : `name`, `%done`, `blockedCount`, `overdue%`, `throughput7d`, `healthScore`.  
Tri par défaut : healthScore asc (surfacer problèmes).  

---
## 13. Portefeuille (Phase 2 Futur)
Widgets ciblés (non développés V1) :
- portfolio.childrenTable (tableau multi-métriques).  
- portfolio.treemap (taille=effort ou count, couleur=%done).  
- portfolio.sparklineProgress (mini-lignes).  
- portfolio.riskCompare (classement health).  
- portfolio.stateDistribution (stacked bars).  

Activation uniquement si >1 sous-kanban ou échelle > seuil.

---
## 14. Autres Dashboards Futurs (Phase 3+)
| Nom | Intention | Champs requis |
|-----|-----------|---------------|
| Financier & Budget | Contrôle coût vs valeur | plannedBudget, consumedBudget, billingStatus |
| Temps & Productivité | Efficience estimation vs réel | estimatedTimeHours, actualOpex/Capex |
| Effort & Priorisation | Allocation effort vs priorités | effort, priority |
| Collaboration & RACI | Gouvernance, couverture rôles | raci.*, invitations |
| Clôture Projet | Rétrospective & capitalisation | historique transitions, snapshots long terme |

---
## 15. API – Contrat Générique
### 15.1 Endpoint
`GET /api/v1/dashboards/:dashboardId?nodeId=...&mode=SELF|AGGREGATED|COMPARISON`

### 15.2 Réponse Type
```json
{
  "dashboard": "EXECUTION",
  "mode": "SELF",
  "nodeId": "node_root",
  "generatedAt": "2025-10-05T10:12:00.000Z",
  "datasetRefreshedAt": "2025-10-05T09:55:00.000Z",
  "widgets": {
    "exec.blocked": { "status": "ok", "payload": [{ "id": "n1", "title": "Corriger API", "blockedForHours": 5.2, "reason": "Attente contrat" }] }
  },
  "hiddenWidgets": [ { "id": "exec.activity24h", "reason": "no recent events" } ],
  "thresholds": { "coverage": 0.4, "minSample": 5 },
  "meta": { "descendantsCount": 0, "version": 1 }
}
```

### 15.3 Codes d'Erreur
| Code | Motif | Message |
|------|-------|---------|
| 400 | Paramètre mode invalide | "invalid mode" |
| 403 | Accès interdit | "forbidden" |
| 404 | Node introuvable | "not found" |
| 500 | Erreur interne | "internal error" |

---
## 16. Sécurité & Permissions
- Vérification appartenance équipe (node.teamId aligné).  
- Si futur partage partiel : filtrer sous-kanbans invisibles en COMPARISON.  
- Pas d’exposition de champs sensibles non utilisés (budgets) tant que non autorisés.  
- Logs internes (audit) : accès dashboard + durée de calcul.

---
## 17. Performance & Caching
| Concerne | Stratégie V1 |
|----------|--------------|
| Requêtes identiques courtes | Cache mémoire TTL 30–60s (clé: dashboard:node:mode:user) |
| AGGREGATED massif | Projection partielle (sélection champs limités) + early aggregation |
| Snapshots | Pré-calcul quotidien + lazy fallback |
| Health Score | Calcul O(n) simple (pas de jointures complexes) |
| Scalabilité future | Table StatsMaterialized (agrégats par nodeId + jour) |

Budget cible : p95 < 400ms SELF, < 900ms AGGREGATED.

---
## 18. UI / UX Spécifications
- Navigation horizontale ou onglets : Exécution | Avancement & Prévision | Risques & Santé.  
- Toggle hiérarchie : ( ) Inclure sous-niveaux, ( ) Comparer sous-kanbans.  
- Widget card : titre, icône, zone contenu, skeleton loading, badge (données insuffisantes).  
- Panneau latéral / modal : “Modules masqués (X)” → table (Widget, Raison, Action suggérée).  
- Couleurs : 
  - Health: Vert (#16a34a), Orange (#f59e0b), Rouge (#dc2626).  
  - WIP limite: progression gradient neutre → accent orange >80% → rouge >100%.  
- Accessibilité : éléments interactifs focusables, aria-live pour mises à jour dashboard, tableau comparatif avec `aria-describedby` pour résumés.

---
## 19. Accessibilité (A11y) & i18n
- Tous libellés dans namespace `dashboard.*` (fr / en).  
- Aria labels pour gauges: `aria-label="Health score 72 (Orange)"`.  
- Langue dynamique (déjà support i18n global).  
- Pas d'usage couleur seule → ajouter icône / label statut.  
- Temps relatif (“il y a 3h”) localisé.  
- Formats date ISO normalisés en `YYYY-MM-DD` côté API, localisation côté front.

---
## 20. Qualité & Tests
### 20.1 Niveaux de tests
| Type | Objet |
|------|------|
| Unitaire widgets | compute() logique (cas ok / no-data / insufficient-coverage) |
| Intégration service | Orchestration multi-widgets, modes SELF/AGGREGATED |
| E2E API | Endpoint /dashboards/{id} auth + filtres |
| Performance | Mesure temps par widget p95 |
| Résilience | Comportement si snapshots manquants (fallback) |

### 20.2 Jeux de données synthétiques
- Dataset A : 20 tâches réparties sur 4 colonnes, 3 blocages, 2 overdue.  
- Dataset B : Couverture effort 20% (tester masquage).  
- Dataset C : Profondeur 3 niveaux (tester AGGREGATED).  
- Dataset D : Historique 1 jour -> burnup masqué.  

### 20.3 Mocks / Fakes
- FakeSnapshotStore (en mémoire).  
- FakeTaskRepository (filtrage par mode).  
- Générateur d'horodatages pseudo-aléatoires pour aging tests.

---
## 21. Sécurité / Observabilité
- Logs : `dashboard.request` (dashboard, nodeId, mode, durationMs, widgetStats[]).  
- Erreurs widgets isolées (try/catch) => widget `status=no-data` sans faire échouer global.  
- Rate limiting futur si usage externe.  
- Sentry span par widget compute (future instrumentation).  
- Alerte (future) si healthScore < seuil configuré.

---
## 22. Stratégie de Versioning
| Élément | Versioning |
|---------|-----------|
| API dashboards | Préfixe `/v1/` en interne (future `/v2/` si rupture) |
| Widgets | Champ `meta.methodVersion` incrémenté si algorithme évolue |
| Snapshots | version schéma table (colonne `schemaVersion`) |

Migration compat ascendante : anciens widgets peuvent coexister.

---
## 23. Pseudo-code Orchestration (Référence)
```ts
async function getDashboard(req: DashboardRequest): Promise<DashboardResponse> {
  const node = await prisma.node.findUnique({ where: { id: req.nodeId } });
  if (!node) throw new NotFoundError();

  const hierarchy = await resolveHierarchy(node, req.mode); // { descendants, children }
  const tasks = await loadTasks(hierarchy, req.mode);       // projection limitée
  const snapshots = needsHistory(req.dashboard) ? await loadSnapshots(hierarchy) : undefined;
  const settings = await loadUserSettings(req.userId);

  const defs = registry.filter(d => d.dashboard === req.dashboard && d.supportedModes.includes(req.mode));

  const widgets: Record<string, WidgetResult> = {};
  const hidden: Array<{ id: string; reason: string }> = [];

  for (const def of defs) {
    try {
      const res = await def.compute({ tasks, hierarchy, mode: req.mode, snapshots, userSettings: settings.dashboard, now: new Date() });
      widgets[def.id] = res;
      if (res.status !== 'ok') hidden.push({ id: def.id, reason: res.reason || res.status });
    } catch (e) {
      widgets[def.id] = { status: 'no-data', reason: 'error' };
      hidden.push({ id: def.id, reason: 'error' });
    }
  }

  const datasetRefreshedAt = resolveLatestDataTimestamp(tasks, snapshots);
  return {
    dashboard: req.dashboard,
    mode: req.mode,
    nodeId: req.nodeId,
    generatedAt: new Date().toISOString(),
    datasetRefreshedAt,
    widgets,
    hiddenWidgets: hidden,
    metadata: {
      totalDurationMs,
      widgetDurations,
      taskCount: tasks.length,
      boardIds
    }
  };
}
```

---
## 24. Représentations Visuelles (Guidelines)
| Type | Détails UI |
|------|-----------|
| KPI | Valeur large, sous-libellé, badge variation optionnelle |
| Liste | Max 8 items, ellipsis, tooltip complet sur hover |
| Barres | Couleurs neutres (gris) + accent pour anomalies |
| Gauge | Donut 270°, centre = valeur, segments couleur 3 zones |
| Histogramme | 4–6 buckets, ratio visible en label (%) |
| Tableau comparatif | Triable, sticky header, colonnes: nom / métriques |
| Timeline (activité) | Barres verticales par créneau 4h, stacking events |

Accessibilité : contrastes > 4.5:1 pour texte principal, >3:1 secondaire.

---
## 25. Exemples JSON (Widgets sélectifs)
### exec.wipColumns
```json
{ "status": "ok", "payload": [ { "column": "IN_PROGRESS", "count": 6, "limit": 8, "utilization": 0.75 }, { "column": "DONE", "count": 21 } ] }
```
### progress.forecast
```json
{ "status": "ok", "payload": { "etaDays": 5.4, "meanThroughput": 3.2, "remaining": 17, "confidence": "low" } }
```
### risk.dataQuality
```json
{ "status": "ok", "payload": { "missingDueAtRatio": 0.35, "missingDescription": 0.12, "missingEffort": 0.60 } }
```

---
## 26. Validation & KPI Internes
| KPI | Cible |
|-----|-------|
| Temps lecture réponse “Sommes-nous dans les temps ?” | <20s |
| % widgets masqués (dataset mature) | <15% |
| p95 durée SELF | <400ms |
| p95 durée AGGREGATED | <900ms |

_Validation 2025-05-01 : tests Jest `dashboards.performance.spec.ts` (jeu synthétique 180 cartes, 3 boards) confirment des temps de réponse <300 ms en SELF et <600 ms en AGGREGATED._
| Taux erreurs 5xx | <0.5% |

---
## 27. Risques & Mitigations
| Risque | Impact | Mitigation |
|--------|--------|-----------|
| Couverture faible (champ effort) | Widgets absents | Abaisser seuil contextuel ou tutoriel | 
| Hiérarchie profonde lourde | Latence élevée | Cache + agrégats matérialisés |
| Score incompris | Rejet | Breakdown visible + doc inline |
| Forecast instable | Découragement | Tag "confiance faible" + min points |
| Explosion widgets futurs | Confusion | Politique “intention stricte” |

---
## 28. Roadmap Évolutive (Synthèse)
_Voir `docs/dashboard-roadmap.md` pour le détail par phase._

| Phase | Ajouter |
|-------|--------|
| 1 | Core 3 dashboards + snapshots + health v1 |
| 2 | Portefeuille + reorder widgets |
| 3 | Financier / Effort / Collaboration |
| 4 | Clôture projet + Monte Carlo |
| 5 | Personnalisation avancée (sauvegarde layout) |
| 6 | Notifications proactives (blocages/risques) |
| 7 | Exports / API publique / Webhooks |

---
## 29. Checklist Implémentation Phase 1
1. Modèle `UserSettings` + repository.  
2. Table `BoardDailySnapshot` + job CRON.  
3. Registry widgets (définitions + compute).  
4. Service `DashboardService`.  
5. Endpoint API REST (auth JWT).  
6. Front : pages / onglets + composant `<DashboardRenderer>`.  
7. Panel “Modules masqués”.  
8. Tests unitaires (3 widgets) + intégration (SELF & AGGREGATED).  
9. Observabilité (log temps total + par widget).  
10. Documentation (ce fichier).  

---
## 30. Annexes & Extensions Futures
- **Algorithmes alternatifs forecast** : médiane glissante, quantiles, simulation (pseudo Monte Carlo simplifié).  
- **Health Score V2** : intégrer trend (dérivée) et pondérer selon taille batch.  
- **A/B Tests** : ordre par défaut widgets (mesurer interactions).  
- **Multi-tenancy** : segmentation caches par teamId.  
- **Export CSV / JSON** : bundler données `widgets.ok` uniquement.  
- **Compat Mobile** : collapse widgets en accordéon.  
- **Access Log Analytics** : feed dans pipeline ML pour alerte prédictive (futur).  

---
## 31. Fin du Document
Document conçu pour être source unique de vérité (SSoT). Toute évolution modifiant structure données, algorithmes ou ajoutant un dashboard doit incrémenter la version et mettre à jour sections 9 (Health), 10 (Snapshots), 11 (Widgets) et 23 (Pseudo-code) au minimum.
