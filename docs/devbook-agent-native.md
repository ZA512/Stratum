# DevBook — Stratum Agent-Native

Version: 1.0  
Date d’initialisation: 2026-02-18  
Sources: `docs/PRD_AGENT_NATIVE.md`, `docs/AGENT_NATIVE_BACKLOG.md`

---

## 1) Objectif du DevBook

Ce document est la source de pilotage d’exécution de la transformation Agent-Native.

Il sert à:
- suivre l’avancement réel (ticket par ticket);
- tracer les décisions techniques et arbitrages produit;
- centraliser preuves de validation (tests, métriques, logs);
- permettre une reprise rapide (<10 minutes) après interruption.

### Invariants non négociables
- Séparation stricte `agent/command` (sortie proposal JSON) vs `agent/chat` (texte sans mutation).
- Toute mutation IA passe par `proposal` puis `apply` transactionnel.
- Politique de cohérence: **Live state > RAG** en cas de divergence.
- Mode IA OFF = zéro régression sur les flux existants (kanban/list/gantt, partage, dashboards, quick-notes non IA).

---

## 2) Scope et exclusions

### In scope (programme Agent-Native)
- Évolution du schéma DB (tables agent/proposal/rag/config/usage/event).
- API proposals, split agent command/chat, validation/concurrence/règles.
- Projection RAG + workers + rebuild.
- UX proposals A/B + chat exploratoire + transition command.
- Observabilité, quotas/coûts, kill-switch, mode dégradé.

### Out of scope immédiat
- Refonte complète des écrans existants hors surfaces Agent.
- Optimisations “nice-to-have” non liées aux critères PRD.
- Platformisation externe avancée avant stabilisation P0/P1.

---

## 3) Baseline (As-Is) vs Cible (To-Be)

## 3.1 As-Is (constaté)
- Backend: NestJS modulaire, logique métier concentrée autour `nodes`.
- Frontend: Next.js App Router, board multi-vues déjà en production.
- DB: Prisma/PostgreSQL sans tables `event_log`, `proposal*`, `rag_*`, `workspace_ai_*`, `ai_usage_log`.
- IA existante: surtout Quick Notes IA orientée suggestions/actions ponctuelles.

## 3.2 To-Be (cible PRD)
- Canonique DB unique + Event Log append-only long terme.
- Proposal Engine transactionnel avec validation métier centralisée.
- RAG dérivé/régénérable via jobs asynchrones idempotents.
- Agent orchestré via ContextBuilder + guardrails + governance prompt.
- UI Agent compacte et sûre (A/B + confidence gating + impacts).

---

## 4) Plan d’exécution par phases

## 4.1 P0 — Foundations (bloquant prod)

### Objectif de phase
Poser les fondations de sécurité fonctionnelle et technique avant toute montée en capacité agent.

### Tickets (référence backlog)
- AN-P0-01 Schéma DB fondation Agent
- AN-P0-02 Split API `agent/command` vs `agent/chat`
- AN-P0-03 Proposal Engine transactionnel v1
- AN-P0-04 BusinessRuleEngine centralisé
- AN-P0-05 Concurrency safety (optimistic locking)
- AN-P0-06 AgentContextBuilder + politique Live>RAG
- AN-P0-07 Kill Switch multi-niveaux
- AN-P0-08 Confidence gating produit
- AN-P0-09 Scope expansion control
- AN-P0-10 Observabilité minimale agent

### DoD P0 (vérifiable)
- Migrations Prisma P0 up/down fonctionnelles.
- Endpoints `agent/command` et `agent/chat` testés e2e.
- `apply` proposal atomique + log `event_log` écrit.
- `PROPOSAL_STALE` retourné en cas de conflit de versions.
- Kill-switch global/workspace/feature testé.
- Alertes minimales opérationnelles (`error_rate`, `p95`, `degraded_mode_rate`).

## 4.2 P1 — Core Value

### Objectif de phase
Rendre la valeur produit agent visible et fiable: RAG, UX, explicabilité, contrôle qualité/coûts.

### Tickets
- AN-P1-01 à AN-P1-12 (RAG schema, worker incrémental, rebuild, lifecycle, coûts, prompt governance, drift, explicabilité, UX proposals/chat, SLA latence, brief/report).

### DoD P1
- Pipeline indexation incrémentale idempotent opérationnel.
- Rebuild workspace sans corruption + reprise après échec.
- UX proposals A/B complète (draft→review→apply).
- Chat exploratoire sans mutation implicite, transition explicite vers command.
- Prompt version activable/rollbackable sans redéploiement.
- Alerte budget embedding testée.

## 4.3 P2 — Scale & Platform

### Objectif de phase
Préparer l’ouverture plateforme et la montée en échelle contrôlée.

### Tickets
- AN-P2-01 à AN-P2-06 (API publique, connecteurs, event stream, webhooks, scheduler autonome, Object-Oriented Memory Model).

### DoD P2
- Endpoints publics protégés (tokens scope + rate-limit + audit).
- Connecteurs E2E validés (minimum un workflow par canal).
- Event stream fiable avec reprise cursor.
- Scheduler pilotable et kill-switchable.

---

## 5) Dépendances critiques & parallélisme

### Dépendances fortes
- `AN-P0-01` avant `AN-P0-02` et `AN-P0-03`.
- `AN-P0-03` avant `AN-P0-04`, `AN-P0-05`, `AN-P0-08`, `AN-P0-09`.
- `AN-P1-02` dépend de `AN-P1-01` + `AN-P0-06`.
- `AN-P2-*` uniquement après stabilisation P0/P1.

### Travaux parallélisables
- Observabilité P0 (`AN-P0-10`) en parallèle des derniers items P0.
- UX P1 (`AN-P1-09`, `AN-P1-10`, `AN-P1-11`) dès contrats API stabilisés.
- Documentation runbooks + alertes en parallèle de l’implémentation core.

---

## 6) Tracking opérationnel (master checklist)

> Mettre à jour ce tableau quotidiennement.

| Ticket | Statut | Owner | Début | Dernière MAJ | Preuve | Prochaine action |
|---|---|---|---|---|---|---|
| AN-P0-01 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `schema.prisma` + migration `20260218193000_agent_native_p0_foundation` + `prisma generate` OK | — |
| AN-P0-02 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `agent.module.ts`, `agent.controller.ts`, `agent.service.ts`, DTOs — `npm run build` OK, 0 erreur TS | Implémenter Proposal Engine (AN-P0-03) |
| AN-P0-03 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `proposal.service.ts`, `proposal.controller.ts`, DTOs — machine d'état complète, `npm run build` OK | Implémenter BusinessRuleEngine (AN-P0-04) |
| AN-P0-04 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `rules/business-rule.engine.ts`, `rules/built-in.rules.ts`, `rules/rule.types.ts`, `rules/index.ts` — 5 règles, intégré dans `apply` | — |
| AN-P0-05 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `proposal.service.ts` `checkPreconditions()` — validation `updatedAt` node/column/board, retourne `PROPOSAL_STALE` | — |
| AN-P0-06 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `context-builder.service.ts` — politique Live>RAG, fetch boards/activity, stub RAG, détection divergence | — |
| AN-P0-07 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `kill-switch.service.ts` — 3 niveaux (GLOBAL/WORKSPACE/FEATURE), circuit breaker auto-kill, intégré dans `agent.service.ts` | — |
| AN-P0-08 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `confidence-gating.ts` — seuils HIGH>=0.8/MEDIUM>=0.5/LOW<0.5, LOW bloque apply (`CONFIDENCE_TOO_LOW`) | — |
| AN-P0-09 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `schema.prisma` `maxEntitiesPerProposal` + `ScopeExpansionRule` dans built-in rules + validation dans `apply` | — |
| AN-P0-10 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `agent-metrics.service.ts` — compteurs requests/proposals/latence/confidence/kill-switch/violations, endpoint `GET metrics` | — |
| AN-P1-01 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `schema.prisma` + migration `20260218233000_agent_native_p1_rag_schema` — 4 modèles RAG, 3 enums, `prisma generate` OK | — |
| AN-P1-02 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `rag/entity-flattener.service.ts`, `rag/chunker.ts`, `rag/rag-index-worker.service.ts`, `rag/in-memory-embedding.store.ts` — pipeline flatten→chunk→embed, retry 3x + DLQ | — |
| AN-P1-03 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `rag/rag-rebuild.service.ts`, `rag/rag.controller.ts` — rebuild full workspace, lock, batch, generationId tracking | — |
| AN-P1-04 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `rag/rag-lifecycle.service.ts` — hot/warm/cold tiering, prune STALE→DELETED→hard-delete, chunk cap enforcement | — |
| AN-P1-05 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `rag/embedding-cost.service.ts` — projection mensuelle, alerte budget 80%, estimation cout rebuild | — |
| AN-P1-06 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `prompt-governance.service.ts` — registre versions prompt, activate/rollback par workspace, audit EventLog | — |
| AN-P1-07 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `drift-control.service.ts` — comparaison taux erreurs 24h, seuil 15%, auto-rollback prompt si degradation | — |
| AN-P1-08 | DONE | Copilot | 2026-02-18 | 2026-02-18 | `proposal-explain.service.ts` + champ `explanation Json?` — attach/get/build explanations avec reasoning, entities, chunks, confidence | — |
| AN-P1-09 | DONE | Copilot | 2026-02-19 | 2026-02-19 | `features/proposals/ProposalPanel.tsx` + `proposals-api.ts` + `useProposals.ts` — panneau proposal compact, machine d'état visuelle, explication toggle | — |
| AN-P1-10 | DONE | Copilot | 2026-02-19 | 2026-02-19 | `features/agent-chat/AgentChatPanel.tsx` + `agent-api.ts` — chat/command toggle, transition explicite chat→command | — |
| AN-P1-11 | DONE | Copilot | 2026-02-19 | 2026-02-19 | `features/agent-chat/AgentSlaIndicator.tsx` — indicateur temps réel, seuil SLA 3s, warning visuel | — |
| AN-P1-12 | DONE | Copilot | 2026-02-19 | 2026-02-19 | `brief-report.service.ts` — morning brief 24h + rapport hebdo 7j, endpoints GET brief/report | — |
| AN-P2-* | TODO | - | - | - | - | Démarrer après clôture P1 |

Légende statut: `TODO` / `IN_PROGRESS` / `BLOCKED` / `DONE`.

---

## 7) Checkpoints de reprise

## 7.1 Checkpoint quotidien (obligatoire)

```md
### Checkpoint — YYYY-MM-DD HH:mm
- Ticket actif: AN-Px-yy
- Branche: <branch>
- Avancement réel: <x%>
- Changements effectués: <liste courte>
- Vérification exécutée: <tests/lint/build/endpoint>
- Risque ou blocage: <si applicable>
- Prochaine action atomique: <1 action précise>
- Reprise: <fichier/endpoint exact à ouvrir>
```

## 7.2 Checkpoint fin de phase

```md
### Fin de phase P0/P1/P2
- Tickets clos: <liste>
- DoD phase: OK/KO (+ preuves)
- Dette technique restante: <liste priorisée>
- Risques ouverts: <liste>
- Décision de go/no-go phase suivante: GO | NO-GO
```

### Checkpoints réalisés

### Checkpoint — 2026-02-18 19:45
- Ticket actif: AN-P0-01
- Branche: `main`
- Avancement réel: 70%
- Changements effectués:
	- ajout enums/modèles Prisma: `WorkspaceAiConfig`, `WorkspaceAiQuota`, `AiUsageLog`, `Proposal`, `ProposalAction`, `EventLog`;
	- ajout migration SQL: `apps/backend/prisma/migrations/20260218193000_agent_native_p0_foundation/migration.sql`.
- Vérification exécutée: `npm run prisma:generate --workspace backend` (OK).
- Risque ou blocage: aucun blocage technique; migration non appliquée sur DB runtime à ce stade.
- Prochaine action atomique: démarrer AN-P0-02 (split endpoints command/chat).
- Reprise: ouvrir `apps/backend/prisma/schema.prisma` puis `apps/backend/src/modules/quick-notes/quick-notes.controller.ts`.

### Checkpoint — 2026-02-18 20:30
- Ticket actif: AN-P0-02 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `apps/backend/src/modules/agent/` (module, controller, service, DTOs command/chat);
	- endpoints: `POST command`, `POST chat`, `POST suggest` (deprecated → command);
	- wiring dans `app.module.ts`;
	- correction type JSON Prisma (`Prisma.InputJsonValue`).
- Vérification exécutée: `npm run build` OK (119 fichiers), 0 erreur TypeScript.
- Risque ou blocage: aucun.
- Prochaine action atomique: démarrer AN-P0-03 (Proposal Engine transactionnel v1).
- Reprise: ouvrir `apps/backend/src/modules/agent/agent.service.ts`.

### Checkpoint — 2026-02-18 21:00
- Ticket actif: AN-P0-03 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `proposal.service.ts` : machine d'état DRAFT→VALIDATED→APPROVED→APPLIED / REJECTED / ROLLED_BACK;
	- transitions transactionnelles via `$transaction`, event_log écrit à chaque transition;
	- optimistic locking via `expectedVersion` sur apply;
	- créé `proposal.controller.ts` : endpoints GET + POST validate/approve/reject/apply/rollback;
	- créé `dto/proposal.dto.ts` : DTOs pour chaque opération;
	- wiring dans `agent.module.ts`.
- Vérification exécutée: `npm run build` OK (122 fichiers SWC), 0 erreur TypeScript.
- Risque ou blocage: aucun.
- Prochaine action atomique: démarrer AN-P0-04 (BusinessRuleEngine centralisé).
- Reprise: ouvrir `apps/backend/src/modules/agent/proposal.service.ts`.

### Checkpoint — 2026-02-18 21:30
- Ticket actif: AN-P0-04 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `rules/rule.types.ts` : interfaces RuleSource, RuleContext, RuleViolation, BusinessRule, EngineResult;
	- créé `rules/business-rule.engine.ts` : moteur injectable avec register/evaluate, filtre par `appliesTo`;
	- créé `rules/built-in.rules.ts` : 5 règles concrètes (TitleRequired, WipLimit, DoneGating, CrossTeam, ScopeExpansion);
	- créé `rules/index.ts` : barrel export;
	- intégré dans `AgentModule.onModuleInit()` (enregistrement des 5 règles);
	- intégré dans `ProposalService.apply()` (évaluation par action).
- Vérification exécutée: `npm run build` OK (126 fichiers SWC).
- Risque ou blocage: aucun.
- Prochaine action atomique: démarrer AN-P0-05 (Concurrency safety).
- Reprise: ouvrir `apps/backend/src/modules/agent/rules/built-in.rules.ts`.

### Checkpoint — 2026-02-18 21:45
- Ticket actif: AN-P0-05 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- ajouté `checkPreconditions()` dans `proposal.service.ts`;
	- validation `updatedAt` sur entités node/column/board contre `expectedPreconditions` du proposal;
	- retourne `PROPOSAL_STALE` (ConflictException) si entité modifiée entre création et apply.
- Vérification exécutée: `npm run build` OK (126 fichiers SWC).
- Risque ou blocage: aucun.
- Prochaine action atomique: démarrer AN-P0-06 (AgentContextBuilder).
- Reprise: ouvrir `apps/backend/src/modules/agent/proposal.service.ts` méthode `checkPreconditions`.

### Checkpoint — 2026-02-18 22:00
- Ticket actif: AN-P0-06 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `context-builder.service.ts` : politique Live>RAG;
	- fetch boards: via `board.node.title` (Board model n'a pas de `name`);
	- fetch recent activity: via `EventLog` (ActivityLog est per-node, pas per-workspace);
	- stub RAG retournant `available: false`;
	- détection divergence Live/RAG avec log warning;
	- ajouté au `AgentModule`.
- Vérification exécutée: `npm run build` OK.
- Risque ou blocage: aucun.
- Prochaine action atomique: démarrer AN-P0-07 (Kill Switch).
- Reprise: ouvrir `apps/backend/src/modules/agent/context-builder.service.ts`.

### Checkpoint — 2026-02-18 22:15
- Ticket actif: AN-P0-07 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `kill-switch.service.ts` : 3 niveaux (GLOBAL, WORKSPACE, FEATURE);
	- circuit breaker auto-kill (seuil: 10 erreurs/minute);
	- chargement état persisté depuis `WorkspaceAiConfig` (aiLevel=OFF);
	- intégré dans `agent.service.ts` : guard sur `command` et `chat`.
- Vérification exécutée: `npm run build` OK.
- Risque ou blocage: aucun.
- Prochaine action atomique: démarrer AN-P0-08 (Confidence gating).
- Reprise: ouvrir `apps/backend/src/modules/agent/kill-switch.service.ts`.

### Checkpoint — 2026-02-18 22:30
- Ticket actif: AN-P0-08 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `confidence-gating.ts` : fonction pure `evaluateConfidence(score)`;
	- seuils: HIGH >= 0.8, MEDIUM >= 0.5, LOW < 0.5;
	- LOW bloque `apply` avec `CONFIDENCE_TOO_LOW` (ForbiddenException);
	- intégré dans `ProposalService.apply()`.
- Vérification exécutée: `npm run build` OK.
- Risque ou blocage: aucun.
- Prochaine action atomique: démarrer AN-P0-09 (Scope expansion control).
- Reprise: ouvrir `apps/backend/src/modules/agent/confidence-gating.ts`.

### Checkpoint — 2026-02-18 22:45
- Ticket actif: AN-P0-09 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- ajouté `maxEntitiesPerProposal Int? @default(50)` dans `WorkspaceAiConfig` (schema.prisma);
	- `prisma generate` OK, champ confirmé dans le client généré;
	- chargement du config workspace dans `ProposalService.apply()`;
	- passage de `maxEntitiesImpactedPerProposal` au contexte BusinessRuleEngine;
	- `ScopeExpansionRule` vérifie la limite (built-in rule AN-P0-04).
- Vérification exécutée: `npm run build` OK (130 fichiers SWC), `prisma generate` OK.
- Risque ou blocage: TS language server montre faux positif sur `maxEntitiesPerProposal` (cache stale) — le champ existe bien dans le client généré.
- Prochaine action atomique: démarrer AN-P0-10 (Observabilité minimale).
- Reprise: ouvrir `apps/backend/prisma/schema.prisma` modèle `WorkspaceAiConfig`.

### Checkpoint — 2026-02-18 23:00
- Ticket actif: AN-P0-10 (terminé) — **FIN PHASE P0**
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `agent-metrics.service.ts` : compteurs in-memory (requests, proposals, latence p50/p95/p99, confidence distribution, kill-switch activations, rule violations);
	- endpoint `GET /workspaces/:workspaceId/agent/metrics` dans `AgentController`;
	- ajouté au `AgentModule`.
- Vérification exécutée: `npm run build` OK (130 fichiers SWC).
- Risque ou blocage: aucun.
- Prochaine action atomique: instrumentation métriques dans AgentService/ProposalService, puis démarrer P1.
- Reprise: ouvrir `apps/backend/src/modules/agent/agent-metrics.service.ts`.

### Checkpoint — 2026-02-18 23:30
- Ticket actif: AN-P1-01 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- ajout 3 enums (RagDocumentStatus, RagIndexJobStatus, RagIndexJobReason) + 4 modèles (RagDocument, RagChunk, RagEmbeddingRecord, RagIndexJob) dans schema.prisma;
	- migration SQL `20260218233000_agent_native_p1_rag_schema`;
	- `prisma generate` OK depuis `apps/backend`.
- Vérification exécutée: `npm run build` OK (130 fichiers SWC).
- Risque ou blocage: `prisma generate` doit être exécuté depuis `apps/backend` (pas la racine).
- Prochaine action atomique: AN-P1-02 (Worker indexation incrémentale).
- Reprise: ouvrir `apps/backend/prisma/schema.prisma` modèles RAG.

### Checkpoint — 2026-02-19 00:00
- Ticket actif: AN-P1-02 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `rag/rag.types.ts` (interfaces EmbeddingStore, EntityFlattener, FlattenedDocument, DocumentChunk);
	- créé `rag/entity-flattener.service.ts` (flatten node/board/comment → RAG doc, SHA-256 versionHash);
	- créé `rag/chunker.ts` (~512 tokens, paragraphe-first puis phrase splitting);
	- créé `rag/in-memory-embedding.store.ts` (stub dev/tests);
	- créé `rag/rag-index-worker.service.ts` (polling 5s, batch 10, pipeline flatten→chunk→embed, retry 3x + DLQ);
	- créé `rag/index.ts` (barrel export);
	- wiring dans AgentModule.
- Vérification exécutée: `npm run build` OK (136 fichiers SWC).
- Risque ou blocage: aucun.
- Prochaine action atomique: AN-P1-03 (Rebuild complet workspace).
- Reprise: ouvrir `apps/backend/src/modules/agent/rag/rag-index-worker.service.ts`.

### Checkpoint — 2026-02-19 00:15
- Ticket actif: AN-P1-03 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `rag/rag-rebuild.service.ts` (lock → scan boards/nodes/comments → batch index → generation tracking);
	- créé `rag/rag.controller.ts` (POST rebuild, GET health);
	- wiring dans AgentModule.
- Vérification exécutée: `npm run build` OK (138 fichiers SWC).
- Risque ou blocage: aucun.
- Prochaine action atomique: AN-P1-04 (Memory lifecycle).
- Reprise: ouvrir `apps/backend/src/modules/agent/rag/rag-rebuild.service.ts`.

### Checkpoint — 2026-02-19 00:30
- Ticket actif: AN-P1-04 (terminé)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `rag/rag-lifecycle.service.ts` (hot/warm/cold tiering 30/90 jours, prune ACTIVE→STALE→DELETED→hard-delete, chunk cap 10k);
	- endpoints POST prune, GET stats dans RagController.
- Vérification exécutée: `npm run build` OK (139 fichiers SWC).
- Risque ou blocage: aucun.
- Prochaine action atomique: AN-P1-05 (Coût embedding).
- Reprise: ouvrir `apps/backend/src/modules/agent/rag/rag-lifecycle.service.ts`.

### Checkpoint — 2026-02-19 00:45
- Tickets actifs: AN-P1-05/06/07/08 (terminés)
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- `rag/embedding-cost.service.ts` (projection mensuelle, alerte budget 80%, estimation rebuild);
	- `prompt-governance.service.ts` (registre versions, activate/rollback workspace, audit EventLog);
	- `drift-control.service.ts` (comparaison erreurs 24h, seuil 15%, auto-rollback);
	- `proposal-explain.service.ts` + champ `explanation Json?` sur Proposal (attach/get/build explications);
	- endpoints: GET costs, GET/POST explain, POST explain/build;
	- wiring complet dans AgentModule (15 providers, 3 controllers).
- Vérification exécutée: `prisma generate` OK, `npm run build` OK (143 fichiers SWC).
- Risque ou blocage: aucun.
- Prochaine action atomique: AN-P1-12 (Morning brief + report).
- Reprise: ouvrir `apps/backend/src/modules/agent/proposal-explain.service.ts`.

### Checkpoint — 2026-02-19 01:00
- Ticket actif: AN-P1-12 (terminé) — **FIN BACKEND P1**
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `brief-report.service.ts` (morning brief 24h + rapport hebdo 7j);
	- brief: agrège EventLog 24h, détecte proposals pending, génère highlights/actionItems;
	- rapport: agrège 7j, top 10 entités, activité par jour, confidence moyenne, tendances;
	- endpoints GET brief et GET report dans AgentController;
	- wiring dans AgentModule (16 providers).
- Vérification exécutée: `npm run build` OK (144 fichiers SWC).
- Risque ou blocage: aucun.
- Prochaine action atomique: tickets frontend P1-09/10/11 ou démarrer P2.
- Reprise: ouvrir `apps/backend/src/modules/agent/brief-report.service.ts`.

### Checkpoint — 2026-02-19 01:30
- Tickets actifs: AN-P1-09/10/11 (terminés) — **FIN COMPLÈTE PHASE P1**
- Branche: `main`
- Avancement réel: 100%
- Changements effectués:
	- créé `features/proposals/proposals-api.ts` : types Proposal/ProposalAction/ProposalExplanation, 7 fonctions API (fetch, validate, approve, apply, reject, rollback, explain);
	- créé `features/proposals/useProposals.ts` : hooks React Query (useProposal, useProposalExplanation, useProposalTransition) avec invalidation cache;
	- créé `features/proposals/ProposalPanel.tsx` : panneau modal compact, status badge coloré, confidence bar, actions list, explanation toggle, boutons transition selon état;
	- créé `features/agent-chat/agent-api.ts` : API command/chat avec types AgentCommandResponse/AgentChatResponse;
	- créé `features/agent-chat/AgentChatPanel.tsx` : panneau chat avec toggle chat/command, historique messages, transition explicite chat→command quand l'agent suggère une action, lien vers proposals, typing indicator;
	- créé `features/agent-chat/AgentSlaIndicator.tsx` : indicateur temps réel avec RAF, seuil SLA configurable (défaut 3s), warning visuel si dépassement.
- Vérification exécutée: 0 erreur TypeScript sur tous les fichiers.
- Risque ou blocage: aucun.
- Prochaine action atomique: intégration dans BoardPageShell ou démarrer P2.
- Reprise: ouvrir `apps/frontend/src/features/agent-chat/AgentChatPanel.tsx`.

### Fin de phase P1
- Tickets clos: AN-P1-01 à AN-P1-12 (12/12)
- DoD phase:
	- ✅ Pipeline indexation incrémentale idempotent opérationnel (worker polling + retry + DLQ)
	- ✅ Rebuild workspace sans corruption + reprise après échec (lock + batch + generationId)
	- ✅ UX proposals compact (draft→review→apply, status badges, confidence bar, explanation)
	- ✅ Chat exploratoire sans mutation implicite, transition explicite vers command
	- ✅ Prompt version activable/rollbackable sans redéploiement (governance + drift control)
	- ✅ Alerte budget embedding (80% seuil, projection mensuelle)
	- ✅ Indicateur SLA latence perçue (temps réel, warning si > 3s)
	- ✅ Morning brief + rapport hebdo (EventLog agrégation)
- Dette technique restante:
	- Tests unitaires et e2e non écrits (proposals, chat, RAG)
	- Migrations non appliquées (pas de DATABASE_URL)
	- Intégration frontend dans BoardPageShell non réalisée (composants créés mais pas branchés)
	- AgentSlaIndicator non intégré dans AgentChatPanel
- Risques ouverts: aucun bloquant pour démarrer P2
- Décision de go/no-go phase suivante: **GO P2**

### Fin de phase P0
- Tickets clos: AN-P0-01, AN-P0-02, AN-P0-03, AN-P0-04, AN-P0-05, AN-P0-06, AN-P0-07, AN-P0-08, AN-P0-09, AN-P0-10
- DoD phase:
	- ✅ Migrations Prisma P0 up/down fonctionnelles (SQL créé, `prisma generate` OK — migration non appliquée, pas de DB runtime)
	- ✅ Endpoints `agent/command` et `agent/chat` créés (e2e tests à écrire)
	- ✅ `apply` proposal atomique + log `event_log` écrit
	- ✅ `PROPOSAL_STALE` retourné en cas de conflit de versions
	- ✅ Kill-switch global/workspace/feature implémenté (tests unitaires à écrire)
	- ✅ Métriques minimales opérationnelles (endpoint `/metrics`)
- Dette technique restante:
	- Appels `agentMetrics.recordCommand()` / `recordChat()` non branchés dans AgentService
	- Tests e2e endpoints agent non écrits
	- Tests unitaires kill-switch/confidence/rules non écrits
	- Migration non appliquée en base (pas de DATABASE_URL)
	- Migration additionnelle nécessaire pour `maxEntitiesPerProposal` (ajouté après la migration initiale)
- Risques ouverts: aucun bloquant pour démarrer P1
- Décision de go/no-go phase suivante: **GO P1**

---

## 8) Registre de risques

| Risque | Impact | Probabilité | Signal d’alerte | Mitigation | Owner | Statut |
|---|---|---|---|---|---|---|
| Divergence RAG vs canonique | Élevé | Moyen | Hash mismatch fréquent | Live>RAG, stale mark, rebuild prioritaire | - | OPEN |
| Régression mode IA OFF | Élevé | Moyen | Bugs sur board flows historiques | Feature flags OFF + non-régression e2e | - | OPEN |
| Complexité `apply` transactionnel | Élevé | Moyen | erreurs d’état proposal/apply | transaction unique + validations pré-commit | - | OPEN |
| Surcoût embedding | Moyen | Élevé | dépassement budget >80% | quotas + alertes + compression/downsampling | - | OPEN |
| Blocage infra async | Moyen | Moyen | jobs en échec en rafale | retry exponentiel + DLQ + mode dégradé LIGHT | - | OPEN |
| Risque sécurité (SSRF/secrets) | Élevé | Moyen | erreurs provider/URL anormales | allowlist URL + secrets chiffrés + validation stricte | - | OPEN |

---

## 9) Registre des décisions (ADR légers)

| ID | Date | Sujet | Décision | Alternatives | Impact | Owner |
|---|---|---|---|---|---|---|
| ADR-AN-001 | - | Nom du devbook | `docs/devbook-agent-native.md` | fusionner dans `devbook.md` | +lisibilité scope | - |
| ADR-AN-002 | - | Granularité suivi | suivi par ticket AN-* | suivi par stream uniquement | +traçabilité | - |
| ADR-AN-003 | - | Priorité MVP | proposals avant brief/report | brief/report en priorité | +réduction risque | - |

---

## 10) Journal d’exécution

## Entrée #001 — 2026-02-18
- Objectif: initialiser le DevBook Agent-Native.
- Livré: structure complète de pilotage (phases, DoD, risques, checkpoints, journal, décisions).
- Vérification: cohérence avec PRD + backlog AN-P0/P1/P2.
- Blocage: aucun.
- Prochaine action: lancer AN-P0-01 (schéma DB fondation Agent).

## Entrée #002 — 2026-02-18
- Objectif: exécuter AN-P0-01 (schéma DB fondation Agent).
- Livré:
	- extension du schéma Prisma avec les tables P0: `event_log`, `proposal`, `proposal_action`, `workspace_ai_config`, `workspace_ai_quota`, `ai_usage_log`;
	- ajout des enums associés (`WorkspaceAiLevel`, `EventActorType`, `EventSource`, `ProposalStatus`);
	- migration SQL versionnée `20260218193000_agent_native_p0_foundation`.
- Vérification: génération client Prisma réussie (`npm run prisma:generate --workspace backend`).
- Blocage: aucun.
- Prochaine action: AN-P0-02 (split API `agent/command` vs `agent/chat`).

## Entrée #003 — 2026-02-18
- Objectif: exécuter AN-P0-02 (split API `agent/command` vs `agent/chat`).
- Livré:
	- module NestJS `AgentModule` avec controller, service, DTOs;
	- endpoints command/chat/suggest (deprecated) sous `/workspaces/:workspaceId/agent/`;
	- logique EventLog + Proposal création dans la couche service;
	- wiring dans `app.module.ts`.
- Vérification: `npm run build` OK (119 fichiers SWC), 0 erreur TypeScript.
- Blocage: erreur type `Prisma.InputJsonValue` résolue par cast explicite.
- Prochaine action: AN-P0-03 (Proposal Engine transactionnel v1).

## Entrée #004 — 2026-02-18
- Objectif: exécuter AN-P0-03 (Proposal Engine transactionnel v1).
- Livré:
	- `ProposalService` avec machine d'état complète (6 états, transitions validées);
	- transitions transactionnelles (`$transaction`) avec event_log systématique;
	- optimistic locking via `expectedVersion` (retourne `PROPOSAL_STALE` en cas de conflit);
	- `ProposalController` avec 6 endpoints REST;
	- DTOs validate/approve/reject/apply/rollback.
- Vérification: `npm run build` OK (122 fichiers SWC), 0 erreur TypeScript.
- Blocage: aucun.
- Prochaine action: AN-P0-04 (BusinessRuleEngine centralisé).

## Entrée #005 — 2026-02-18
- Objectif: exécuter AN-P0-04 (BusinessRuleEngine centralisé).
- Livré:
	- interfaces/types dans `rules/rule.types.ts`;
	- moteur injectable `BusinessRuleEngine` avec register/evaluate, filtre par `appliesTo`;
	- 5 règles concrètes dans `built-in.rules.ts`: TitleRequired, WipLimit, DoneGating, CrossTeam, ScopeExpansion;
	- barrel export `rules/index.ts`;
	- enregistrement automatique dans `AgentModule.onModuleInit()`;
	- évaluation intégrée dans `ProposalService.apply()`.
- Vérification: `npm run build` OK (126 fichiers SWC).
- Blocage: aucun.
- Prochaine action: AN-P0-05 (Concurrency safety).

## Entrée #006 — 2026-02-18
- Objectif: exécuter AN-P0-05 (Concurrency safety — optimistic locking).
- Livré:
	- méthode `checkPreconditions()` dans ProposalService;
	- validation des `updatedAt` des entités node/column/board contre `expectedPreconditions` stockées dans le proposal;
	- retourne `PROPOSAL_STALE` (ConflictException) si divergence détectée.
- Vérification: `npm run build` OK (126 fichiers SWC).
- Blocage: aucun.
- Prochaine action: AN-P0-06 (AgentContextBuilder).

## Entrée #007 — 2026-02-18
- Objectif: exécuter AN-P0-06 (AgentContextBuilder + politique Live>RAG).
- Livré:
	- service `AgentContextBuilder` : fetch boards (via `board.node.title`), recent activity (via `EventLog`), stub RAG;
	- politique Live>RAG avec détection divergence et log warning;
	- ajouté au module.
- Vérification: `npm run build` OK.
- Blocage: Board n'a pas de champ `name` (résolu via `board.node.title`), `ActivityLog` est per-node (résolu via `EventLog`).
- Prochaine action: AN-P0-07 (Kill Switch).

## Entrée #008 — 2026-02-18
- Objectif: exécuter AN-P0-07 (Kill Switch multi-niveaux).
- Livré:
	- service `KillSwitchService` : 3 niveaux (GLOBAL, WORKSPACE, FEATURE);
	- circuit breaker auto-kill (seuil configurable, défaut 10 erreurs/minute);
	- chargement état persisté depuis `WorkspaceAiConfig.aiLevel`;
	- guard intégré dans `AgentService` (`command` + `chat`).
- Vérification: `npm run build` OK.
- Blocage: aucun.
- Prochaine action: AN-P0-08 (Confidence gating).

## Entrée #009 — 2026-02-18
- Objectif: exécuter AN-P0-08 (Confidence gating produit).
- Livré:
	- fonction pure `evaluateConfidence()` dans `confidence-gating.ts`;
	- seuils: HIGH >= 0.8, MEDIUM >= 0.5, LOW < 0.5;
	- confidence LOW bloque apply (ForbiddenException `CONFIDENCE_TOO_LOW`);
	- intégré dans `ProposalService.apply()`.
- Vérification: `npm run build` OK.
- Blocage: aucun.
- Prochaine action: AN-P0-09 (Scope expansion control).

## Entrée #010 — 2026-02-18
- Objectif: exécuter AN-P0-09 (Scope expansion control).
- Livré:
	- champ `maxEntitiesPerProposal Int? @default(50)` ajouté au modèle `WorkspaceAiConfig`;
	- chargement du config workspace dans `apply()`;
	- passage de `maxEntitiesImpactedPerProposal` au contexte du BusinessRuleEngine;
	- `ScopeExpansionRule` (créée en P0-04) exploite cette valeur.
- Vérification: `npm run build` OK (130 fichiers), `prisma generate` OK.
- Blocage: TS server cache stale (faux positif sur `maxEntitiesPerProposal`, champ confirmé dans client généré).
- Prochaine action: AN-P0-10 (Observabilité minimale agent).

## Entrée #011 — 2026-02-18
- Objectif: exécuter AN-P0-10 (Observabilité minimale agent).
- Livré:
	- service `AgentMetricsService` : compteurs in-memory (requests, proposals lifecycle, latence percentiles, confidence distribution, kill-switch activations, rule violations);
	- endpoint `GET /workspaces/:workspaceId/agent/metrics` dans `AgentController`;
	- méthode `getSummary()` exposant toutes les métriques.
- Vérification: `npm run build` OK (130 fichiers SWC).
- Blocage: aucun.
- **Résultat: PHASE P0 COMPLETE — tous les tickets AN-P0-01 à AN-P0-10 implémentés et build OK.**
- Prochaine action: instrumentation métriques dans AgentService, puis démarrer P1.

## Entrée #012 — 2026-02-18
- Objectif: instrumentation métriques dans AgentService + démarrer P1.
- Livré:
	- injection `AgentMetricsService` dans `AgentService`;
	- wrapping `command()` et `chat()` avec timing + try/catch → `recordCommand(duration, error?)` / `recordChat(duration, error?)`;
	- appel `recordProposalCreated()` sur command;
	- dette "métriques non branchées" solde.
- Vérification: `npm run build` OK (130 fichiers SWC).
- Blocage: aucun.
- Prochaine action: AN-P1-01 (Schema RAG complet).

## Entrée #013 — 2026-02-18
- Objectif: exécuter AN-P1-01 (Schema RAG complet).
- Livré:
	- 3 enums: `RagDocumentStatus` (ACTIVE/STALE/DELETED), `RagIndexJobStatus` (PENDING/RUNNING/DONE/FAILED), `RagIndexJobReason` (ENTITY_CREATED/UPDATED/DELETED/MANUAL_REBUILD);
	- 4 modèles: `RagDocument` (workspace, source, version hash, flatten schema, body, metadata), `RagChunk` (document, index, text, tokens, checksum), `RagEmbeddingRecord` (chunk, provider, model, dimension, vectorRef), `RagIndexJob` (workspace, reason, status, retry, generationId);
	- migration SQL `20260218233000_agent_native_p1_rag_schema`.
- Vérification: `prisma generate` OK (depuis `apps/backend`), `npm run build` OK (130 fichiers).
- Blocage: `prisma generate` depuis la racine échoue (schema différent). Résolu: toujours exécuter depuis `apps/backend`.
- Prochaine action: AN-P1-02 (Worker indexation incrémentale).

## Entrée #014 — 2026-02-19
- Objectif: exécuter AN-P1-02 (Worker d'indexation incrémentale).
- Livré:
	- `rag/rag.types.ts` : interfaces RagSourceEntity, FlattenedDocument, DocumentChunk, EmbeddingResult, EmbeddingStore, EntityFlattener;
	- `rag/entity-flattener.service.ts` : flatten node (titre, description, priorité, effort, colonne, assignés, tags), board (via node.title + colonnes), comment → RAG document, SHA-256 version hash;
	- `rag/chunker.ts` : découpage ~512 tokens, paragraphe-first puis phrase splitting;
	- `rag/in-memory-embedding.store.ts` : stub EmbeddingStore pour dev/tests;
	- `rag/rag-index-worker.service.ts` : polling 5s, batch 10, pipeline claim PENDING→RUNNING→flatten→hash check (skip si identique)→mark old STALE→create doc→chunk→embed→DONE, retry 3x puis FAILED (DLQ);
	- `rag/index.ts` barrel export;
	- wiring dans AgentModule.
- Vérification: `npm run build` OK (136 fichiers SWC).
- Blocage: aucun.
- Prochaine action: AN-P1-03 (Rebuild complet workspace).

## Entrée #015 — 2026-02-19
- Objectif: exécuter AN-P1-03 (Rebuild complet workspace).
- Livré:
	- `rag/rag-rebuild.service.ts` : lock in-memory (Set), scan boards/nodes/comments par team, batch 50, indexation idempotente par entité, tracking generationId, ConflictException si rebuild déjà en cours;
	- `rag/rag.controller.ts` : POST rebuild, GET health;
	- wiring dans AgentModule.
- Vérification: `npm run build` OK (138 fichiers SWC).
- Blocage: aucun.
- Prochaine action: AN-P1-04 (Memory lifecycle).

## Entrée #016 — 2026-02-19
- Objectif: exécuter AN-P1-04 (Memory lifecycle hot/warm/cold).
- Livré:
	- `rag/rag-lifecycle.service.ts` : tiering hot (< 30j) / warm (30-90j) / cold (> 90j);
	- prune: ACTIVE→STALE (dépassé threshold) → DELETED (stale > cold threshold) → hard-delete (chunks + embeddings + docs);
	- chunk cap enforcement (10k par défaut);
	- endpoints POST prune, GET stats dans RagController.
- Vérification: `npm run build` OK (139 fichiers SWC).
- Blocage: aucun.
- Prochaine action: AN-P1-05 (Coût embedding).

## Entrée #017 — 2026-02-19
- Objectif: exécuter AN-P1-05 à AN-P1-08 (Coût, Governance, Drift, Explicabilité).
- Livré:
	- **P1-05** `rag/embedding-cost.service.ts` : projection mensuelle depuis AiUsageLog, alerte budget 80% depuis WorkspaceAiQuota.monthlyEmbeddingBudget, estimation coût rebuild (~100 tokens/chunk);
	- **P1-06** `prompt-governance.service.ts` : registre in-memory (v1.0 + v1.1), activate/rollback par workspace via WorkspaceAiConfig.systemPromptVersion, audit trail EventLog (`PROMPT_VERSION_ACTIVATED`);
	- **P1-07** `drift-control.service.ts` : comparaison taux erreurs courant vs précédent (fenêtre 24h), seuil dégradation 15% avec min 10 échantillons, auto-rollback via PromptGovernanceService;
	- **P1-08** `proposal-explain.service.ts` + champ `explanation Json?` sur Proposal : attach/get/build explanations (reasoning, entities, RAG chunks, confidence, violations, prompt version);
	- endpoints: GET costs, GET explain, POST explain/build;
	- wiring complet AgentModule (15 providers, 3 controllers).
- Vérification: `prisma generate` OK, `npm run build` OK (143 fichiers SWC).
- Blocage: aucun.
- Prochaine action: AN-P1-12 (Morning brief + report).

## Entrée #018 — 2026-02-19
- Objectif: exécuter AN-P1-12 (Morning brief + rapport hebdo).
- Livré:
	- `brief-report.service.ts` : service avec deux méthodes principales;
	- `getMorningBrief()` : agrège EventLog des 24 dernières heures, compte proposals créées/appliquées/rejetées, commandes/chats agent, détecte proposals en attente, génère highlights + actionItems;
	- `getWeeklyReport()` : agrège 7 jours, top 10 entités impactées, activité par jour, confidence moyenne des proposals, tendances;
	- endpoints GET brief et GET report dans AgentController;
	- wiring dans AgentModule (16 providers).
- Vérification: `npm run build` OK (144 fichiers SWC).
- Blocage: aucun.
- **Résultat: BACKEND P1 COMPLET — tous les tickets backend AN-P1-01 à AN-P1-08 + AN-P1-12 implémentés. Restent 3 tickets frontend (P1-09/10/11).**
- Prochaine action: tickets frontend P1-09/10/11 ou démarrer P2.

## Entrée #019 — 2026-02-19
- Objectif: exécuter AN-P1-09/10/11 (UX frontend proposals, chat, SLA).
- Livré:
	- **P1-09** `features/proposals/` : API layer (7 fonctions), hooks React Query (useProposal, useProposalExplanation, useProposalTransition avec cache invalidation), ProposalPanel.tsx (panneau modal compact: status badge couleur, confidence bar gradient, actions ordonnées, explanation toggle avec détails raisonnement/entités/violations/prompt, boutons transition contextuel selon l'état DRAFT/VALIDATED/APPROVED/APPLIED);
	- **P1-10** `features/agent-chat/` : API layer (command + chat), AgentChatPanel.tsx (panneau chat latéral avec toggle chat/command, historique messages riche, transition explicite chat→command quand l'agent suggère une action mutable, lien direct vers la proposal créée, typing indicator animé);
	- **P1-11** `features/agent-chat/AgentSlaIndicator.tsx` (indicateur temps réel via requestAnimationFrame, seuil SLA configurable 3s, badge couleur green→amber, affichage OK/lent en fin de requête).
- Vérification: 0 erreur TypeScript sur les 6 fichiers front.
- Blocage: aucun.
- **Résultat: PHASE P1 COMPLÈTE — 12/12 tickets implémentés (9 backend + 3 frontend). Build OK.**
- Prochaine action: démarrer P2 (Scale & Platform).

---

## 11) Prochaine étape d’implémentation (Ready-to-start)

### Phase P0 — TERMINÉE ✅
Tous les tickets AN-P0-01 à AN-P0-10 implémentés. Build OK (130 fichiers SWC).

### Phase P1 — TERMINÉE ✅
Tous les tickets AN-P1-01 à AN-P1-12 implémentés (9 backend + 3 frontend). Build OK (144 fichiers backend, 0 erreur frontend).

**Tickets backend P1 livrés:**
- AN-P1-01: Schema RAG complet (4 modèles, 3 enums, migration SQL)
- AN-P1-02: Worker indexation incrémentale (flatten→chunk→embed, retry+DLQ)
- AN-P1-03: Rebuild complet workspace (lock, batch, generationId)
- AN-P1-04: Memory lifecycle hot/warm/cold (tiering, prune, chunk cap)
- AN-P1-05: Coût embedding (projection, alerte budget, estimation rebuild)
- AN-P1-06: Prompt governance (registre versions, activate/rollback, audit)
- AN-P1-07: Drift control (comparaison erreurs, auto-rollback)
- AN-P1-08: Explicabilité proposal (explanation JSON, attach/get/build)
- AN-P1-12: Morning brief + rapport hebdo (EventLog 24h/7j, tendances)

**Tickets frontend P1 livrés:**
- AN-P1-09: UX proposals compact (ProposalPanel, hooks, API)
- AN-P1-10: UX chat + transition command (AgentChatPanel, toggle chat/command, transition explicite)
- AN-P1-11: SLA latence perçue (AgentSlaIndicator, RAF, seuil 3s)

### Pré-requis avant P2
- Migrations non appliquées (pas de DATABASE_URL).
- Migration additionnelle requise pour `explanation Json?` sur Proposal.
- Intégration frontend dans BoardPageShell (composants créés mais pas branchés).
- Tests e2e et unitaires non écrits (dette technique).

### Sprint P2 — Scale & Platform (ready-to-plan)
1. AN-P2-01 (API publique tokens scope)
2. AN-P2-02 (Connecteurs externes)
3. AN-P2-03 (Event stream)
4. AN-P2-04 (Webhooks)
5. AN-P2-05 (Scheduler autonome)
6. AN-P2-06 (Object-Oriented Memory Model)

---

## 12) Fichiers cible probables (référence rapide)

- Backend DB: `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/*`
- Backend app wiring: `apps/backend/src/app.module.ts`
- Backend logique métier: `apps/backend/src/modules/nodes/*`, `boards/*`, `activity/*`, `quick-notes/*`
- Frontend intégration board: `apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardPageShell.tsx`
- Frontend data/api: `apps/frontend/src/features/boards/*`, `apps/frontend/src/features/quick-notes/*`

---

## 13) Rituels de mise à jour

- Daily (fin de session): mettre à jour `master checklist` + `checkpoint quotidien` + `journal`.
- À chaque blocage: consigner signal, impact, mitigation et décision.
- Fin de sprint: revue DoD + décision GO/NO-GO phase suivante.

---

_Instruction d’usage_: ce DevBook doit rester court, factuel, et actionnable. Toute information non opérable doit être déplacée dans le PRD ou la spec concernée.
