# Backlog d’implémentation — Stratum Agent-Native

Version: 1.0  
Date: 2026-02-18  
Source: [docs/PRD_AGENT_NATIVE.md](docs/PRD_AGENT_NATIVE.md)

## Cadre d’exécution

- Priorités: `P0` (fondations critiques), `P1` (valeur produit majeure), `P2` (scaling/plateforme).
- Streams: `DB`, `API`, `Agent`, `RAG`, `Worker`, `Frontend`, `Observability`, `Security`.
- Convention ticket: `AN-<prio>-<num>`.

---

## P0 — Foundations (bloquant prod)

### AN-P0-01 — Schéma DB fondation Agent
- **Stream:** DB
- **Objectif:** Créer tables `event_log`, `proposal`, `proposal_action`, `workspace_ai_config`, `workspace_ai_quota`, `ai_usage_log`.
- **Livrables:** migrations Prisma + index + contraintes.
- **Dépendances:** aucune.
- **DoD:** migration up/down OK; contraintes d’intégrité validées; doc migration ajoutée.

### AN-P0-02 — Split API `agent/command` vs `agent/chat`
- **Stream:** API
- **Objectif:** Séparer strictement commandes structurées et dialogue exploratoire.
- **Livrables:**
  - `POST /workspaces/:workspaceId/agent/command`
  - `POST /workspaces/:workspaceId/agent/chat`
  - compatibilité temporaire `agent/suggest` (deprecated -> command)
- **Dépendances:** AN-P0-01.
- **DoD:** contrats OpenAPI publiés; tests e2e des 2 flux; logs distincts.

### AN-P0-03 — Proposal Engine transactionnel v1
- **Stream:** API
- **Objectif:** Implémenter `draft/validate/approve/reject/apply/rollback`.
- **Livrables:** endpoints proposals + apply atomique.
- **Dépendances:** AN-P0-01.
- **DoD:** apply transactionnel; `event_log` écrit; rollback logique via compensation.

### AN-P0-04 — BusinessRuleEngine centralisé
- **Stream:** API/Security
- **Objectif:** Appliquer les mêmes règles pour manuel/proposal/agent/scheduler.
- **Livrables:** moteur + hook d’exécution + erreurs normalisées.
- **Dépendances:** AN-P0-03.
- **DoD:** une règle unique validée sur 4 sources; refus cohérent inter-canaux.

### AN-P0-05 — Concurrency safety (optimistic locking)
- **Stream:** API/DB
- **Objectif:** Bloquer apply sur état stale.
- **Livrables:** `expected_preconditions` versionnées (`expectedVersion`/`expectedUpdatedAt`) + revalidation pré-commit.
- **Dépendances:** AN-P0-03.
- **DoD:** scénario conflit A/B reproduit; retour `PROPOSAL_STALE`.

### AN-P0-06 — AgentContextBuilder + politique Live>RAG
- **Stream:** Agent/RAG
- **Objectif:** Construire contexte sûr et déterministe.
- **Livrables:** composant `AgentContextBuilder` + règle de consistance Live prevails.
- **Dépendances:** AN-P0-02.
- **DoD:** divergence hash détectée -> live prioritaire + doc stale + job rebuild émis.

### AN-P0-07 — Kill Switch multi-niveaux
- **Stream:** Security/Observability
- **Objectif:** Arrêt sûr global/workspace/feature + auto-kill circuit breaker.
- **Livrables:** flags runtime + policy auto-kill + runbook.
- **Dépendances:** AN-P0-02.
- **DoD:** tests chaos: kill global, kill workspace, kill feature, auto-kill sur seuil erreur.

### AN-P0-08 — Confidence gating produit
- **Stream:** Frontend/API
- **Objectif:** Rendre `confidence_score` opérant.
- **Livrables:** seuils haute/moyenne/basse + UX/validation renforcée.
- **Dépendances:** AN-P0-03.
- **DoD:** low confidence empêche one-click apply; warning UX en medium.

### AN-P0-09 — Scope expansion control
- **Stream:** API/Product Safety
- **Objectif:** Limiter impacts massifs (`max_entities_impacted_per_proposal`).
- **Livrables:** config workspace + split/refus automatique.
- **Dépendances:** AN-P0-03.
- **DoD:** proposal > limite refusée ou batchée automatiquement.

### AN-P0-10 — Observabilité minimale agent
- **Stream:** Observability
- **Objectif:** métriques d’exécution, latence, erreurs, coûts.
- **Livrables:** dashboards + alertes (`error_rate`, `p95`, `degraded_mode_rate`).
- **Dépendances:** AN-P0-02, AN-P0-03.
- **DoD:** alertes actives + tableau de bord opérationnel.

---

## P1 — Core value (RAG + UX + qualité)

### AN-P1-01 — Schéma RAG complet
- **Stream:** DB
- **Objectif:** créer `rag_document`, `rag_chunk`, `rag_embedding_record`, `rag_index_job`.
- **Dépendances:** AN-P0-01.
- **DoD:** migrations stables + index validés.

### AN-P1-02 — Worker d’indexation incrémentale
- **Stream:** Worker/RAG
- **Objectif:** pipeline async idempotent depuis `event_log`.
- **Dépendances:** AN-P1-01, AN-P0-06.
- **DoD:** create/update/delete entity -> index job -> projection à jour.

### AN-P1-03 — Rebuild complet workspace
- **Stream:** RAG/Worker
- **Objectif:** `POST /rag/rebuild` avec switch atomique de génération.
- **Dépendances:** AN-P1-02.
- **DoD:** rebuild complet sans corruption; reprise après échec.

### AN-P1-04 — Memory lifecycle (hot/warm/cold)
- **Stream:** RAG/Cost
- **Objectif:** tiering + pruning + rotation.
- **Dépendances:** AN-P1-02.
- **DoD:** cap chunks actifs respecté; cold storage opérationnel.

### AN-P1-05 — Coût embedding long terme
- **Stream:** Cost/Observability
- **Objectif:** projection coûts rebuild/mensuel + alerte 80% budget.
- **Dépendances:** AN-P1-02.
- **DoD:** estimation affichée avant rebuild; alerte budget testée.

### AN-P1-06 — Prompt governance runtime
- **Stream:** Agent/API
- **Objectif:** utiliser `ai_prompt_version` (activation, rollback, audit).
- **Dépendances:** AN-P0-01.
- **DoD:** switch prompt sans redéploiement; audit trail complet.

### AN-P1-07 — Drift control automatique
- **Stream:** Agent/Observability
- **Objectif:** comparer N vs N-1 et rollback auto si dégradation.
- **Dépendances:** AN-P1-06.
- **DoD:** dégradation simulée -> alerte + rollback effectif.

### AN-P1-08 — Explicabilité proposal
- **Stream:** Agent/API
- **Objectif:** stocker `proposal_explanation` (reasoning summary, entities, rag ids, confidence).
- **Dépendances:** AN-P0-03.
- **DoD:** chaque proposal possède explication consultable.

### AN-P1-09 — UX panneau proposals compact A/B
- **Stream:** Frontend
- **Objectif:** rendu compact mots-clés + sélection A/B + impacts + confidence gating.
- **Dépendances:** AN-P0-08.
- **DoD:** parcours complet draft->review->apply depuis UI.

### AN-P1-10 — UX chat + transition command
- **Stream:** Frontend
- **Objectif:** chat exploratoire + CTA “Créer une proposition”.
- **Dépendances:** AN-P0-02.
- **DoD:** flux chat->command sans mutation implicite.

### AN-P1-11 — SLA latence perçue
- **Stream:** Frontend/Agent
- **Objectif:**
  - >800ms: “analyse en cours”
  - >2s: partial LIGHT
  - >4s: annulation + fallback
- **Dépendances:** AN-P0-02.
- **DoD:** comportement validé e2e sur throttling réseau.

### AN-P1-12 — Morning brief + reporting 7j
- **Stream:** Agent/API
- **Objectif:** endpoints brief/report basés `event_log`.
- **Dépendances:** AN-P0-03, AN-P1-02.
- **DoD:** brief quotidien et rapport hebdo cohérents sur données réelles.

---

## P2 — Scale & Platform

### AN-P2-01 — Public Agent API (phase contrôlée)
- **Stream:** Platform/API/Security
- **Objectif:** ouvrir `/public/agent/command` et `/public/agent/chat`.
- **Dépendances:** P0/P1 stabilisés.
- **DoD:** auth scoped tokens + rate limit + audit.

### AN-P2-02 — Connecteurs externes
- **Stream:** Integrations
- **Objectif:** Slack/Email/CLI adapters vers command/chat.
- **Dépendances:** AN-P2-01.
- **DoD:** 1 workflow bout-en-bout par connecteur.

### AN-P2-03 — Event stream public
- **Stream:** Platform
- **Objectif:** `GET /public/workspaces/:id/events/stream`.
- **Dépendances:** AN-P2-01.
- **DoD:** stream fiable, backpressure et reprise curseur.

### AN-P2-04 — Webhooks sortants agent
- **Stream:** Platform/Security
- **Objectif:** `POST /public/workspaces/:id/webhooks` + retries signés.
- **Dépendances:** AN-P2-03.
- **DoD:** signature HMAC + retry policy + dead-letter.

### AN-P2-05 — Scheduler autonome orienté objectifs
- **Stream:** Agent/Worker
- **Objectif:** exécuter revues périodiques et proposals proactives.
- **Dépendances:** AN-P1-12.
- **DoD:** schedule configurable + kill switch feature.

### AN-P2-06 — Object-Oriented Memory Model
- **Stream:** DB/Agent/Product
- **Objectif:** introduire `goal` + alignement proposals/objectifs.
- **Dépendances:** AN-P1-02.
- **DoD:** proposal score inclut alignement goal; endpoints CRUD `goal`.

---

## Plan de séquencement recommandé (8 sprints)

- **Sprint 1-2:** AN-P0-01 à AN-P0-05
- **Sprint 3-4:** AN-P0-06 à AN-P0-10
- **Sprint 5-6:** AN-P1-01 à AN-P1-07
- **Sprint 7:** AN-P1-08 à AN-P1-12
- **Sprint 8+:** P2 (platformisation progressive)

---

## Risks de delivery (à suivre chaque sprint)

- Divergence règles manuelles vs proposals
- Retards sur stabilité RAG (jobs/rebuild)
- Coût embedding supérieur à budget
- Régression UX due au split command/chat

Mitigation: feature flags progressifs, dark launch par workspace pilote, critères de go/no-go par sprint.
