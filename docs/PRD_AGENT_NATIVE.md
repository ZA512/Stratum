# PRD — Transformation de Stratum en système Agent-Native (avec mode 100% sans IA)

Version: 1.0  
Date: 2026-02-18  
Scope: `apps/backend`, `apps/frontend`, `apps/backend/prisma/schema.prisma`

---

## 0) Analyse de l’existant (basée sur le code réel)

## 0.1 Architecture actuelle

- Backend: NestJS, API REST sous `/api/v1` (`apps/backend/src/main.ts`), modules métier (`auth`, `boards`, `nodes`, `teams`, `users`, `activity`, `dashboards`, `quick-notes`, `workflow-automation`).
- Frontend: Next.js App Router + React client, vues board Kanban/Liste/Gantt via `BoardPageShell`.
- DB: PostgreSQL + Prisma (`apps/backend/prisma/schema.prisma`) dans le schema `stratum`.
- Auth: JWT access + refresh token, reset password, invitations équipe.
- Partage: collaboration au niveau nœud via invitations (`NodeShareInvitation`) + placements personnalisés (`SharedNodePlacement`).

### 0.1.1 Diagramme actuel (logique)

```text
[Frontend Next.js]
     |
     | HTTPS REST (/api/v1)
     v
[Backend NestJS]
  |- AuthModule
  |- TeamsModule
  |- BoardsModule
  |- NodesModule
  |- DashboardsModule
  |- ActivityModule
  |- QuickNotesModule (+ QuickNotesAiService)
  |- UsersModule (incl. AI user settings)
     |
     v
[PostgreSQL / Prisma]
```

## 0.2 Modèle de données actuel (entités & relations clés)

### 0.2.1 Entités majeures existantes

- `User`, `Team`, `Membership`
- `Node` (entité centrale hiérarchique)
- `Board` (1-1 avec un `Node` racine de board)
- `Column`, `ColumnBehavior`
- `NodeAssignment`, `Dependency`, `Comment`, `Attachment`
- `Invitation` (équipe), `NodeShareInvitation` (partage nœud)
- `SharedNodePlacement` (placement personnalisé par utilisateur)
- `ActivityLog` (événements fonctionnels, mais avec retention bornée)
- `QuickNote` (+ IA quick notes)
- `BoardDailySnapshot`

### 0.2.2 Relations actuelles simplifiées

```text
User 1---* Membership *---1 Team
Team 1---* Node
Node 1---0..1 Board
Board 1---* Column
Column *---1 ColumnBehavior
Node 1---* NodeAssignment *---1 User
Node 1---* Comment *---1 User
Node *---* Node (parent/children)
Node 1---* Dependency (as dependent/dependency)
Node 1---* NodeShareInvitation
Node 1---* SharedNodePlacement *---1 User
Node 1---* ActivityLog *---1 User
User 1---* QuickNote *---0..1 Board
Board 1---* BoardDailySnapshot
```

### 0.2.3 Remarques structurelles importantes

- `Node.workspaceId` existe déjà et cohabite avec un fallback legacy team dans des contrôles d’accès (cf. `ensureUserCanWrite` dans `nodes.service.ts`).
- Les écritures métier sont majoritairement dans `NodesService` (fichier très volumineux), incluant workflow backlog/done, planning Gantt, partage et automation.
- `ActivityLog` est **non append-only historique** à long terme: la logique actuelle supprime les anciens logs au-delà d’un seuil configurable par tâche (`MAX_ACTIVITY_LOGS_PER_NODE`, défaut 20).

## 0.3 Permissions et partage actuels

- Contrôle d’accès write via ownership board personnel ou membership active team (fallback transitoire).
- Dashboards limités au propriétaire du board (`ownerUserId === userId`).
- Partage nœud via invitation accept/decline + auto-expire.
- Suppression protégée pour tâches partagées (suppression refusée, archivage recommandé).

## 0.4 UX actuelle Kanban / Liste / Timeline-Gantt

- `BoardPageShell` offre 3 modes: `kanban`, `list`, `gantt` avec persistance locale par team.
- Drag-and-drop colonnes/cartes, filtres avancés, archivées/snoozées, activity panel, invitations panel.
- Gantt: dépendances, planning (`plannedStartDate`, `plannedEndDate`, `scheduleMode`, `hardConstraint`) via patch node.

## 0.5 IA déjà présente (important pour la migration)

- IA “Quick Notes” existante: suggestions + exécution d’actions structurées (`MOVE_NODE_TO_COLUMN`, `UPDATE_NODE_FIELDS`, etc.).
- Providers supportés côté backend: `heuristic`, `openai`, `anthropic`, `mistral`, `gemini`, `ollama`, `custom`.
- Paramètres IA stockés dans préférences utilisateur (avec chiffrement AES-GCM pour API key si clé d’encryption fournie).
- Pas de RAG canonique séparé, pas de système proposals global transactionnel cross-domain, pas d’event log append-only général.

---

## 1) Vision cible Agent-Native

Stratum devient un système à 4 plans strictement séparés:

1. **Canonique SGBDR** (source de vérité unique)  
2. **Projection RAG dérivée/régénérable**  
3. **Agent IA** (lecture RAG + écriture API structurée uniquement)  
4. **UI adaptative** (fonctionne intégralement avec ou sans IA)

### 1.1 Invariants produit

- Toute mutation business passe par l’API backend et transaction DB.
- L’agent ne modifie jamais la DB directement.
- Toute action IA est formulée en **Proposal** validée explicitement (humain-in-the-loop).
- Si IA désactivée: comportement fonctionnel identique à l’existant.

---

## 2) Architecture cible détaillée

## 2.1 Diagramme cible

```text
                      +----------------------+
                      |      Frontend UI     |
                      | (Kanban/List/Gantt + |
                      |  Agent Panels/Brief) |
                      +----------+-----------+
                                 |
                                 | REST/WS (authz)
                                 v
+-----------------+    +---------+---------+    +-------------------------+
| Proposal Engine |<---| Backend API Core  |--->| Canonical PostgreSQL DB |
| (validate/apply)|    | (Nest modules)    |    | (truth)                 |
+--------+--------+    +---------+---------+    +------------+------------+
         ^                         |                           |
         |                         | outbox/events             |
         |                         v                           |
         |                +--------+---------+                 |
         |                | Event Log Append |<----------------+
         |                | Only             |
         |                +--------+---------+
         |                         |
         |                         | async indexing jobs
         |                         v
         |                +--------+---------+
         +----------------| RAG Projection   |
                          | flatten+chunks   |
                          | embeddings       |
                          +--------+---------+
                                   |
                                   v
                          +--------+---------+
                          | Vector Store      |
                          | (pgvector/qdrant/ |
                          |  weaviate/...)    |
                          +-------------------+

Agent runtime:
- lit RAG + contexte API read-only
- propose JSON Proposal
- n’écrit que via /proposals/.../apply
```

## 2.2 Flux de données

### 2.2.0 Séparation stricte Commandes vs Dialogue

L’agent opère dans 2 modes distincts, non ambigus:

- **Command mode**: intention structurée orientée action, sortie obligatoire = proposal JSON.
- **Chat mode**: dialogue exploratoire, sortie = texte + suggestions optionnelles, sans mutation directe.

Contrat produit:

- `command` ne renvoie jamais de texte libre sans proposal.
- `chat` ne déclenche jamais de mutation canonique; il peut seulement proposer un passage vers `command`.

### 2.2.1 Lecture agent

1. Agent reçoit intention utilisateur
2. Agent query RAG (documents flatten + métadonnées permissionnées)
3. Agent construit alternatives de proposal
4. UI affiche format compact, user choisit

### 2.2.2 Écriture agent

1. `POST /agent/proposals` (draft)
2. Backend valide schema + permissions + invariants
3. `POST /proposals/{id}/apply`
4. Transaction atomique sur tables canoniques
5. Écriture append-only `event_log`
6. Publication tâche async de réindexation RAG

### 2.2.3 Flux Chat exploratoire

1. `POST /agent/chat`
2. Backend construit le contexte (permissions + live snapshot + RAG)
3. LLM génère une réponse textuelle explicative
4. Backend peut renvoyer `suggestedCommandPayload` optionnel
5. User choisit explicitement de transformer en `command`

## 2.3 Stratégie async

- Outbox transactionnelle (`event_log` + `index_job`) dans la même transaction que la mutation business.
- Worker idempotent pour projection RAG.
- Retry exponentiel + DLQ logical (`index_job.status=FAILED` + `retry_count`).

## 2.4 Stratégie d’indexation

- Indexation incrémentale par `entity_type/entity_id/version_hash`.
- Full rebuild possible par workspace sans downtime logique.
- Lecture RAG sur dernière version `ACTIVE` uniquement.

## 2.5 AgentContextBuilder (couche obligatoire)

Le pipeline cible devient:

```text
Intent utilisateur
  -> AgentContextBuilder
  -> LLM
  -> Proposal JSON
```

Rôle du `AgentContextBuilder` avant tout appel LLM:

- filtrer strictement le contexte par permissions effectives utilisateur/workspace
- fusionner projection RAG + snapshot live DB (état instantané)
- injecter règles métier structurées (WIP, types autorisés, contraintes calendrier, partage)
- injecter guardrails formels (schéma proposal, actions autorisées, limites destructive)
- injecter résumé workspace (politiques, conventions, feature flags)

Contrat de service cible:

```ts
interface AgentContextBuilder {
  getWorkspaceConfig(input: { workspaceId: string }): Promise<WorkspaceConfigSnapshot>;
  getPermissionScope(input: { workspaceId: string; userId: string }): Promise<PermissionScope>;
  getRelevantRagDocuments(input: { workspaceId: string; query: string; topK: number }): Promise<RagHit[]>;
  getLiveStateSnapshot(input: { workspaceId: string; focusNodeId?: string }): Promise<LiveStateSnapshot>;
  buildSystemPrompt(input: {
    workspace: WorkspaceConfigSnapshot;
    permissions: PermissionScope;
    rag: RagHit[];
    live: LiveStateSnapshot;
    guardrails: GuardrailsSpec;
  }): Promise<{ systemPrompt: string; compactContext: Record<string, unknown> }>;
}
```

Invariants:

- le LLM ne reçoit jamais de contexte non autorisé
- les règles métier sont injectées sous forme de contraintes explicites (pas uniquement du texte libre)
- le `buildSystemPrompt` est versionné (cf. Prompt Governance)

### 2.5.1 Politique de consistance RAG vs Live Snapshot

Règle de consistance canonique:

- **Live state prevails over RAG if conflict detected**.

Politique opérationnelle:

```text
if rag_version_hash != live_version_hash:
  prefer live state
  mark rag doc stale
  trigger async rebuild
```

Comportement attendu:

- les propositions sont toujours calculées sur l’état live en cas de divergence.
- la divergence est loggée (`event_type=RAG_LIVE_CONFLICT_DETECTED`).
- le document RAG concerné est immédiatement marqué `STALE`.
- un job de reconstruction asynchrone est émis avec priorité élevée.

Conséquence produit:

- aucune proposal ne peut être validée uniquement sur un fragment RAG obsolète.

## 2.6 Agent comme orchestrateur (et non simple couche)

Pour passer de « Agent ajouté » à « Agent orchestrateur », la logique métier doit être explicitée:

- moteur de règles déclaratives (`Rule DSL`) pour validations transverses
- moteur d’invariants centralisés (réutilisé par API manuelle et proposals)
- state machine explicite pour `Node` (éviter la logique dispersée dans services)

Exemple de DSL minimal:

```json
{
  "ruleId": "node.wip.enforced",
  "when": { "actionType": "MOVE_NODE", "targetColumnBehavior": "IN_PROGRESS" },
  "assert": [
    { "type": "wip_limit_not_exceeded", "columnId": "$targetColumnId" },
    { "type": "user_has_write_permission", "workspaceId": "$workspaceId" }
  ],
  "onFail": { "code": "WIP_LIMIT_REACHED", "message": "Limite WIP atteinte" }
}
```

---

## 3) Base de données — évolution du schéma

## 3.1 Nouvelles tables proposées

### 3.1.1 `workspace_ai_config`

Configuration IA par workspace (et non seulement utilisateur).

```sql
workspace_ai_config (
  id uuid pk,
  workspace_id text not null unique,
  ai_enabled boolean not null default false,
  ai_level text not null check (ai_level in ('OFF','LIGHT','EMBEDDING','HEAVY')),
  llm_provider text null,
  llm_model text null,
  llm_base_url text null,
  embedding_provider text null,
  embedding_model text null,
  temperature numeric(3,2) null,
  top_p numeric(3,2) null,
  max_tokens int null,
  system_prompt_version text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### 3.1.2 `workspace_ai_quota`

```sql
workspace_ai_quota (
  id uuid pk,
  workspace_id text not null unique,
  monthly_token_budget bigint null,
  monthly_embedding_budget bigint null,
  max_requests_per_minute int not null default 60,
  hard_stop_on_budget boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### 3.1.3 `ai_usage_log`

```sql
ai_usage_log (
  id uuid pk,
  workspace_id text not null,
  user_id text not null,
  provider text not null,
  model text not null,
  feature text not null, -- proposal_generation, brief, rag_query, etc.
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  embedding_tokens int not null default 0,
  estimated_cost_usd numeric(12,6) null,
  created_at timestamptz not null default now()
)
create index on (workspace_id, created_at desc);
```

### 3.1.4 `event_log` (append-only)

```sql
event_log (
  id uuid pk,
  workspace_id text not null,
  actor_type text not null check (actor_type in ('USER','AGENT','SYSTEM')),
  actor_id text null,
  source text not null, -- API, AGENT, SCHEDULER
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  correlation_id text null,
  proposal_id uuid null,
  payload jsonb not null,
  created_at timestamptz not null default now()
)
create index on (workspace_id, created_at desc);
create index on (proposal_id);
create index on (entity_type, entity_id, created_at desc);
```

### 3.1.5 `proposal` + `proposal_action`

```sql
proposal (
  id uuid pk,
  workspace_id text not null,
  requested_by_user_id text not null,
  generated_by text not null check (generated_by in ('USER','AGENT','SYSTEM')),
  status text not null check (status in ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','APPLIED','FAILED','CANCELLED')),
  ai_level text not null,
  rationale text null,
  alternatives_count int not null default 1,
  selected_alternative int null,
  dry_run_report jsonb null,
  validation_report jsonb null,
  apply_report jsonb null,
  idempotency_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by_user_id text null,
  reviewed_at timestamptz null,
  applied_at timestamptz null
)
create unique index on (workspace_id, idempotency_key) where idempotency_key is not null;

proposal_action (
  id uuid pk,
  proposal_id uuid not null references proposal(id) on delete cascade,
  alternative_no int not null default 1,
  action_order int not null,
  action_type text not null,
  target_entity_type text not null,
  target_entity_id text null,
  payload jsonb not null,
  expected_preconditions jsonb null,
  inverse_payload jsonb null, -- rollback logique
  created_at timestamptz not null default now(),
  unique (proposal_id, alternative_no, action_order)
)
```

### 3.1.6 Projection RAG

```sql
rag_document (
  id uuid pk,
  workspace_id text not null,
  source_entity_type text not null,
  source_entity_id text not null,
  source_version_hash text not null,
  flatten_schema_version text not null,
  title text not null,
  body text not null,
  metadata jsonb not null,
  status text not null check (status in ('ACTIVE','STALE','DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_entity_type, source_entity_id, source_version_hash)
);
create index on (workspace_id, source_entity_type, source_entity_id);

rag_chunk (
  id uuid pk,
  document_id uuid not null references rag_document(id) on delete cascade,
  chunk_index int not null,
  text text not null,
  token_count int not null,
  checksum text not null,
  metadata jsonb not null,
  unique (document_id, chunk_index)
);

rag_embedding_record (
  id uuid pk,
  chunk_id uuid not null references rag_chunk(id) on delete cascade,
  provider text not null,
  model text not null,
  dimension int not null,
  vector_ref text not null, -- id externe si store distant
  checksum text not null,
  created_at timestamptz not null default now(),
  unique (chunk_id, provider, model)
);

rag_index_job (
  id uuid pk,
  workspace_id text not null,
  reason text not null, -- EVENT, REBUILD, REPAIR
  source_event_id uuid null,
  source_entity_type text null,
  source_entity_id text null,
  status text not null check (status in ('PENDING','RUNNING','DONE','FAILED')),
  retry_count int not null default 0,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 3.1.7 Gouvernance prompts, feedback et conversation

```sql
ai_prompt_version (
  id uuid pk,
  workspace_id text not null,
  prompt_type text not null check (prompt_type in ('PROPOSAL','BRIEF','REFACTOR','CHAT_SUMMARY')),
  version int not null,
  content text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz null,
  unique (workspace_id, prompt_type, version)
);
create index on ai_prompt_version (workspace_id, prompt_type, is_active);

proposal_feedback (
  id uuid pk,
  proposal_id uuid not null references proposal(id) on delete cascade,
  workspace_id text not null,
  user_id text not null,
  accepted boolean not null,
  modified_after_apply boolean not null default false,
  user_rating smallint null check (user_rating between 1 and 5),
  rejection_reason text null,
  created_at timestamptz not null default now(),
  unique (proposal_id, user_id)
);
create index on proposal_feedback (workspace_id, created_at desc);

agent_conversation_session (
  id uuid pk,
  workspace_id text not null,
  user_id text not null,
  board_id text null,
  focus_node_id text null,
  status text not null check (status in ('ACTIVE','ARCHIVED','RESET')),
  token_budget int not null default 12000,
  auto_summarize_threshold int not null default 8000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on agent_conversation_session (workspace_id, user_id, updated_at desc);

conversation_summary (
  id uuid pk,
  session_id uuid not null references agent_conversation_session(id) on delete cascade,
  summary_version int not null,
  summary_text text not null,
  covered_message_count int not null,
  prompt_version_id uuid null references ai_prompt_version(id),
  created_at timestamptz not null default now(),
  unique (session_id, summary_version)
);
```

### 3.1.8 Versionning règles métier et exécution

```sql
business_rule_version (
  id uuid pk,
  workspace_id text not null,
  rule_set_name text not null, -- core-node-lifecycle, proposal-safety, etc.
  version int not null,
  rules_json jsonb not null,
  is_active boolean not null default false,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz null,
  unique (workspace_id, rule_set_name, version)
);
create index on business_rule_version (workspace_id, rule_set_name, is_active);

business_rule_execution_log (
  id uuid pk,
  workspace_id text not null,
  rule_version_id uuid not null references business_rule_version(id),
  source text not null check (source in ('MANUAL_API','PROPOSAL_APPLY','AGENT_PRECHECK','SCHEDULER')),
  correlation_id text null,
  entity_type text null,
  entity_id text null,
  action_type text null,
  result text not null check (result in ('PASS','FAIL','ERROR')),
  violations jsonb null,
  duration_ms int null,
  created_at timestamptz not null default now()
);
create index on business_rule_execution_log (workspace_id, created_at desc);
create index on business_rule_execution_log (correlation_id);
```

### 3.1.9 Explicabilité des proposals

```sql
proposal_explanation (
  id uuid pk,
  proposal_id uuid not null unique references proposal(id) on delete cascade,
  reasoning_summary text not null,
  referenced_entities jsonb not null default '[]'::jsonb,
  rag_doc_ids_used jsonb not null default '[]'::jsonb,
  confidence_score numeric(4,3) null,
  created_at timestamptz not null default now()
);
create index on proposal_explanation (proposal_id);
```

## 3.2 Extension des types d’items

### 3.2.1 Cible fonctionnelle

Ajouter les types:
- `project`
- `next_action`
- `waiting_for`
- `note`
- `reference`
- `milestone`
- `decision`
- `risk`
- `blocker`

### 3.2.2 Proposition d’implémentation minimale compatible existant

- Introduire `NodeKind` enum Prisma.
- Ajouter `node.kind NodeKind @default(next_action)`.
- Mapper rétrocompat:
  - anciens items sans type explicite => `next_action`
  - nœuds avec board enfant => `project` (migration progressive assistée)

## 3.3 Contraintes et migrations

- Migration 1: tables techniques (`event_log`, `proposal*`, `rag_*`, `workspace_ai_*`, `ai_usage_log`).
- Migration 2: `Node.kind` + index `(workspaceId, kind, archivedAt)`.
- Migration 3: backfill `Node.kind` en mode idempotent.
- Migration 4: instrumentation écriture `event_log` depuis services critiques (`nodes`, `boards`, `quick-notes ai execute`).

---

## 4) Projection RAG

## 4.1 Documents flatten

### 4.1.1 Sources canoniques

- `Node` + parent chain + board/column + tags + priority + effort + due + assignees
- `Comment`
- `ActivityLog` (partie récente)
- `QuickNote` (optionnel workspace-local)
- snapshots synthétiques (WIP, stagnation)

### 4.1.2 Format flatten cible

```json
{
  "documentType": "node",
  "workspaceId": "board_xxx",
  "source": { "entityType": "node", "entityId": "node_xxx", "versionHash": "sha256:..." },
  "title": "[NEXT_ACTION] Relancer prestataire façade",
  "body": "... texte canonique fusionné ...",
  "metadata": {
    "kind": "next_action",
    "path": "/root/...",
    "columnBehavior": "BLOCKED",
    "priority": "HIGH",
    "dueAt": "2026-02-20T00:00:00Z",
    "assignees": ["user_1"],
    "visibility": { "teamId": "team_x", "shared": true }
  }
}
```

## 4.2 Hash / invalidation

- `source_version_hash = sha256(canonical_json_normalized)`.
- Si hash inchangé: skip ré-embedding.
- Si hash change: marquer doc précédent `STALE`, générer nouveau doc/chunks.

## 4.3 Abstraction multi-vector-store

### 4.3.1 Contrat

```ts
interface EmbeddingStore {
  upsert(vectors: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }>): Promise<void>;
  delete(ids: string[]): Promise<void>;
  query(input: { workspaceId: string; vector: number[]; topK: number; filter?: Record<string, unknown> }): Promise<Array<{ id: string; score: number }>>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
```

### 4.3.2 Implémentations

- `PgVectorStoreAdapter`
- `QdrantStoreAdapter`
- `WeaviateStoreAdapter` (option)
- `InMemoryStoreAdapter` (tests)

## 4.4 Régénération complète

- Endpoint admin/workspace: `POST /rag/rebuild`.
- Process:
  1. lock logique workspace
  2. scanner entités source
  3. rebuild en batch
  4. switch index generation atomique (`generation_id`)
  5. unlock

## 4.5 Memory lifecycle (mémoire longue)

Objectif: garder un RAG performant et soutenable à grande échelle (jusqu’à 200k+ nodes).

### 4.5.1 Tiering

- **Hot**: documents actifs récents (priorité retrieval maximale)
- **Warm**: historiques pertinents (retrieval pondéré)
- **Cold**: archive consultable à la demande (hors topK par défaut)

### 4.5.2 Politique de priorité embedding

Ordre par défaut:

1. `project`, `next_action`, `risk`, `blocker`
2. `milestone`, `decision`, `waiting_for`
3. `note`, `reference`
4. commentaires anciens / événements anciens

### 4.5.3 Pruning et rotation

- pruning par score utilité (`retrieval_count`, récence, type)
- downsampling des commentaires très anciens
- rotation vers cold storage des chunks non consultés > N jours
- conservation d’un résumé compressé pour cold documents

### 4.5.4 Règle anti-explosion

- hard cap chunks actifs par workspace
- si cap atteint: compression/summarization avant nouvel embedding
- full rebuild conserve la tiering policy

---

## 5) Multi-IA & paramétrage

## 5.1 Configuration par workspace

```json
{
  "aiEnabled": true,
  "aiLevel": "HEAVY",
  "llm": {
    "provider": "openai",
    "model": "gpt-4.1",
    "baseUrl": null,
    "temperature": 0.2,
    "topP": 0.9,
    "maxTokens": 2500
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-large"
  },
  "limits": {
    "monthlyTokenBudget": 3000000,
    "maxRequestsPerMinute": 60,
    "hardStopOnBudget": true
  }
}
```

## 5.2 Niveaux IA

- **OFF**: aucun appel LLM/embedding.
- **LIGHT**: classification/tri/extraction (sans RAG obligatoire).
- **EMBEDDING**: recherche sémantique + suggestions assistées.
- **HEAVY**: raisonnement, synthèse, planification multi-étapes.

## 5.3 Providers abstraits

### 5.3.1 LLM

```ts
interface LlmProvider {
  generate(input: {
    model: string;
    messages: Array<{ role: 'system'|'user'|'assistant'; content: string }>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    responseFormat?: 'json'|'text';
  }): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }>;
}
```

### 5.3.2 Embedding

```ts
interface EmbeddingProvider {
  embed(input: { model: string; texts: string[] }): Promise<{ vectors: number[][]; usage?: { embeddingTokens: number } }>;
}
```

## 5.4 Modèles locaux

- Support natif via provider `ollama`/`custom` avec `baseUrl` workspace.
- Guardrails sécurité:
  - allowlist hosts internes
  - timeout strict
  - validation URL (anti-SSRF)

## 5.5 Coûts / quotas

- Log de consommation dans `ai_usage_log`.
- Contrôle pré-appel:
  - budget restant
  - rate limit workspace
  - fail-soft (message UI + fallback heuristique)

## 5.6 Prompt Governance

Objectif: stabiliser et auditer le comportement agent dans le temps.

- versionning explicite des prompts (`ai_prompt_version`)
- activation contrôlée (1 version active par `workspace + prompt_type`)
- audit complet (qui a créé/activé, quand)
- rollback prompt instantané (switch active version)
- A/B testing prompt possible par workspace segment

Flux d’activation:

1. création nouvelle version prompt (`is_active=false`)
2. validation interne
3. activation contrôlée
4. suivi métriques (`proposal_feedback`, acceptance rate)
5. rollback si régression

## 5.7 Stabilité déterministe des proposals

Objectif: minimiser la variabilité à contexte équivalent.

Règles par défaut sur endpoint `command`:

- `temperature` basse (`0.0` à `0.2`) pour génération de proposal.
- `seed` déterministe lorsque le provider le supporte.
- normalisation post-LLM (tri clés JSON, ordering actions, canonicalization).
- re-ranking interne des alternatives selon heuristiques métier (cohérence contraintes, impact limité, sécurité).

En cas de non-déterminisme résiduel:

- conserver trace hash prompt+context et hash sortie
- retourner `determinism_score` (faible/moyen/élevé)

## 5.8 Gestion de l’agent drift (boucle contrôlée)

Objectif: éviter la dégradation silencieuse de qualité dans le temps.

Mécanisme de contrôle:

- définir un seuil minimal d’acceptation (`min_acceptance_rate`, ex: 40%)
- comparer systématiquement version prompt `N` vs `N-1`
- déclencher alerte si drift négatif > `X%` (ex: 10%)
- rollback automatique vers `N-1` si dégradation significative persistante

Pseudo-politique:

```text
if acceptance_rate(N) < min_acceptance_rate
  or (acceptance_rate(N-1) - acceptance_rate(N)) > drift_threshold:
    alert("AGENT_DRIFT_DETECTED")
    rollback_prompt_to(N-1)
```

Fenêtres d’évaluation:

- short window: 24h (détection rapide)
- long window: 7 jours (validation stabilité)

---

## 6) Mode 100% sans IA

## 6.1 Garantie de continuité

- Tous workflows existants (kanban/list/gantt, partage, dashboards, quick notes non IA) restent actifs.
- Les endpoints IA répondent `403 FEATURE_DISABLED` ou `409 AI_NOT_CONFIGURED` selon contexte.

## 6.2 Feature flags

- `feature.ai.enabled`
- `feature.ai.level.light`
- `feature.ai.level.embedding`
- `feature.ai.level.heavy`
- `feature.ai.brief`
- `feature.ai.refactor`

Activation par workspace + override admin global.

## 6.3 Adaptation UI dynamique

- Si IA OFF:
  - masquer panneaux agent
  - masquer CTA suggestion
  - conserver tous composants existants de production
- Si IA ON:
  - ajouter section “Propositions IA” contextuelle
  - jamais remplacer les commandes manuelles existantes

---

## 7) Système de Proposals

## 7.1 JSON strict

```json
{
  "workspaceId": "board_123",
  "title": "Réorganiser le sprint façade",
  "rationale": "Regrouper blocages et clarifier priorités",
  "alternatives": [
    {
      "label": "Option A",
      "actions": [
        {
          "actionType": "CREATE_NODE",
          "targetEntityType": "node",
          "payload": {
            "kind": "next_action",
            "parentId": "node_root",
            "title": "Relancer syndic",
            "dueAt": "2026-02-20T09:00:00Z"
          },
          "expectedPreconditions": {
            "parentExists": true,
            "userCanWrite": true
          }
        }
      ]
    },
    {
      "label": "Option B",
      "actions": []
    }
  ]
}
```

## 7.2 Validation backend

- JSON schema + validation métier:
  - permissions
  - existence entités
  - limites WIP
  - cohérence dates
  - interdiction destructive implicite

### 7.2.1 Validation graphe dépendances (DAG) et `temp_ids`

Pour supporter des proposals multi-actions complexes:

- support `temp_id` sur actions de création (`temp:A`, `temp:B`)
- résolution en 2 passes:
  1. pass création -> map `temp_id -> real_id`
  2. pass liens/dépendances -> remplacement des références

Règles obligatoires:

- graphe de dépendances final acyclique
- rejet si cycle détecté
- rejet si référence orpheline après résolution

Pseudo-code validation:

```ts
function validateDependencyGraph(actions: ProposalAction[]) {
  const resolved = resolveTempIds(actions);
  const edges = extractDependencyEdges(resolved);
  if (hasCycle(edges)) {
    throw new DomainError('DEPENDENCY_CYCLE_DETECTED');
  }
}
```

### 7.2.2 Moteur centralisé d’évaluation des règles

Le même moteur doit être exécuté pour:

- actions manuelles API
- proposals apply
- pré-check agent
- jobs scheduler

Contrat:

```ts
interface BusinessRuleEngine {
  evaluate(input: {
    workspaceId: string;
    source: 'MANUAL_API'|'PROPOSAL_APPLY'|'AGENT_PRECHECK'|'SCHEDULER';
    action: Record<string, unknown>;
    stateSnapshot: Record<string, unknown>;
  }): Promise<{ pass: boolean; violations: Array<{ code: string; message: string }> }>;
}
```

Chaque exécution écrit dans `business_rule_execution_log`.

### 7.2.3 Conflits de concurrence et revalidation

Cas cible: la proposal est approuvée, mais l’état a changé avant apply.

Mesures:

- optimistic locking sur entités critiques (`version` ou `updatedAt` attendu)
- `expected_preconditions` enrichies avec version attendue
- revalidation complète juste avant commit
- rejet `PROPOSAL_STALE` si mismatch

Exemple précondition:

```json
{
  "targetEntityId": "node_123",
  "expectedVersion": 42,
  "expectedUpdatedAt": "2026-02-18T10:11:12.000Z"
}
```

### 7.2.4 Scope expansion control (limite d’impact)

Pour éviter les proposals massives non maîtrisées:

- `max_entities_impacted_per_proposal` (configurable par workspace)
- si dépassement:
  - split automatique en batch de proposals, ou
  - refus explicite avec demande de périmètre plus ciblé

Exemple:

```text
if impacted_entities_count > max_entities_impacted_per_proposal:
  reject_or_split_proposal()
```

Default recommandé: 25 à 50 entités par proposal selon taille workspace.

## 7.3 Application atomique

- `POST /proposals/{id}/apply`:
  - lock proposal row
  - transaction DB unique
  - apply actions ordonnées
  - write `event_log` append-only
  - commit

## 7.4 Rollback logique

- Pas de rollback SQL après commit.
- Compensation via `inverse_payload` action par action.
- Endpoint: `POST /proposals/{id}/rollback` (crée une proposal inverse, soumise validation).

## 7.6 Contrôle anti-sur-intelligence (garde-fous produit)

L’agent ne doit pas dépasser une capacité de transformation acceptable sans consentement renforcé.

Règles minimales:

- interdiction de modification de la racine workspace sans double validation
- avertissement fort pour déplacement cross-project
- refactor massif (`> X items`, configurable) => double validation obligatoire
- opérations hiérarchiques profondes (`depth <= criticalDepth`) => niveau de confirmation renforcé

Double validation = 2 confirmations explicites UI + résumé d’impacts détaillé.

## 7.7 Confidence gating (règle produit)

Le `confidence_score` devient prescriptif, non décoratif.

- **Haute confiance** (`>= 0.70`): flow normal
- **Confiance moyenne** (`0.40 - 0.69`): avertissement UX explicite
- **Basse confiance** (`< 0.40`): confirmation renforcée obligatoire

Comportement UI:

- badge confiance visible sur chaque alternative
- texte explicatif standardisé (“fiabilité limitée, vérifiez les impacts”)
- impossibilité d’apply one-click sous seuil bas

## 7.5 Pseudo-code backend

```ts
async function applyProposal(proposalId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findUnique({ where: { id: proposalId }, include: { actions: true } });
    assertCanReviewAndApply(proposal, userId);
    assertStatus(proposal, 'APPROVED');

    for (const action of sortByOrder(proposal.actions)) {
      validatePreconditions(action, tx);
      await dispatchAction(action, tx);
      await tx.eventLog.create({ data: buildEvent(action, proposal, userId) });
    }

    await tx.proposal.update({
      where: { id: proposalId },
      data: { status: 'APPLIED', appliedAt: new Date(), applyReport: { ok: true } }
    });

    await tx.ragIndexJob.createMany({ data: impactedEntitiesToJobs(proposal.actions) });
  });
}
```

---

## 8) UX proposals IA (compacte, lisible)

## 8.1 Syntaxe visuelle compacte

Format obligatoire par action:

```text
CREATION CARTE → DANS PRA → TYPE next_action → ECHEANCE 20/02
DEPLACEMENT CARTE #481 → VERS BLOCKED → RAISON attente syndic
LIEN DEPENDANCE → #481 BLOQUE #433
```

## 8.2 Mots-clés système

- `CREATION`
- `DEPLACEMENT`
- `MISE_A_JOUR`
- `LIEN`
- `ECHEANCE`
- `ASSIGNATION`
- `ARCHIVAGE`
- `SCISSION`
- `REGROUPEMENT`

## 8.3 Couleurs (design system minimal)

Sans introduire de nouveaux tokens hors système existant:

- Action système: accent principal (`bg-accent/10`, texte accent)
- Projet: surface secondaire
- Type: badge neutre
- Date: ambre/rouge selon urgence
- Relation: violet/indigo existant

## 8.4 Alternatives IA

- Jusqu’à 2 alternatives max visibles simultanément pour décision rapide.
- UX sélection: radio cards (A/B) + bouton `Appliquer`.

## 8.5 Structure UI minimale

- Header: résumé de l’intention.
- Bloc A/B compact.
- Liste action par action (1 ligne/action).
- Panneau “Impacts” (nb cartes créées/modifiées/déplacées).
- Footer: `Refuser`, `Appliquer A`, `Appliquer B`.

---

## 9) Morning Brief & Reporting

## 9.1 Morning Brief quotidien

Source: `event_log` + état courant board/node.

Contenu:
- Top 5 items critiques (risk/blocker/overdue)
- WIP actuel vs limites
- Nouveaux blocages (<24h)
- Attentes `waiting_for` sans update > N jours
- Propositions de focus journée

## 9.2 Rapport 7 jours

- throughput par type (`next_action`, `project`, `risk`, etc.)
- créations vs clôtures
- progression des milestones
- charge WIP moyenne/jour
- temps moyen en `BLOCKED`

## 9.3 Détections automatiques

- **Stagnation**: aucune évolution significative sur item > X jours.
- **Surcharge WIP**: in-progress > wipLimit + marge.
- **Blocage**: item en blocked + pas d’activité > Y jours.

Algorithme exemple:

```text
if column=BLOCKED and now-last_event_at > 72h => blocker_alert
if in_progress_count > wip_limit for 2 days => wip_overload_alert
if no progress change and no activity > 7 days => stagnation_alert
```

---

## 10) Refactorisation intelligente (toujours via proposal)

## 10.1 Capacités

- Découper projet trop gros (`project` -> sous-projets + next_actions)
- Regrouper items similaires (déduplication titres/tags/contenu)
- Nettoyer racine (réassigner items orphelins, fermer obsolete)

## 10.2 Règles de sécurité

- Aucune exécution automatique destructive.
- Toujours preview d’impacts + validation humaine.
- Toute action loggée dans `event_log`.

---

## 11) Sécurité & conformité

## 11.1 Isolation workspace

- Requêtes agent toujours filtrées par `workspaceId` + permission user.
- Interdiction cross-workspace implicite.

## 11.2 Respect permissions partage

- Reprise des gardes existants (`membership active`, ownership board, share invitations).
- Toute action proposal revalide droits au moment apply (TOCTOU mitigation).

## 11.3 Hallucinations structurelles

- JSON schema strict
- IDs obligatoirement existants et autorisés
- `targetEntityId` non trouvé => rejet proposal
- fallback: demander clarification utilisateur

## 11.4 Logging complet des actions IA

- prompt hash + provider/model + usage tokens + proposal_id + résultat.
- pas de stockage de secret brut.

## 11.5 Secrets

- Réutiliser chiffrement AES-GCM déjà en place pour API keys (extensible au scope workspace).
- Jamais exposer clé en API read.

## 11.6 Degradation mode (obligatoire)

Cas couverts:

- vector store indisponible
- timeout LLM
- budget dépassé
- provider embedding en erreur

Comportement cible:

1. fallback automatique vers mode `LIGHT` heuristique
2. UI explicite: « mode dégradé actif » + cause
3. queue retry asynchrone pour tâches non critiques
4. lecture simple DB/RAG partiel quand possible
5. aucune interruption des workflows non IA

Matrice simplifiée:

```text
LLM down            -> suggestions heuristiques + proposals manuelles
Vector store down   -> recherche textuelle canonique + cache chaud
Budget exceeded     -> blocage HEAVY/EMBEDDING, LIGHT autorisé
Embedding failure   -> marquage stale + retry job, pas de blocage UI
```

## 11.7 Kill Switch multi-niveaux

Niveaux de coupure:

- global runtime (`AGENT_RUNTIME_DISABLED=true`)
- par workspace (`workspace_ai_config.ai_enabled=false`)
- par feature (`proposal`, `brief`, `refactor`, `chat`)
- auto-kill sur seuil d’erreur dépassé (circuit breaker)

Politique auto-kill exemple:

```text
if error_rate_5min > 15% OR p95_latency > threshold_hard then
  disable feature=agent.command for 10 min
  keep agent.chat in degraded mode
```

---

## 12) Plan de déploiement progressif

## Phase 1 — Foundations

- DB: `event_log`, `proposal`, `workspace_ai_config`, `ai_usage_log`.
- API proposals + dry-run validate.
- Feature flags IA OFF par défaut.
- Instrumentation minimale nodes/boards writes -> `event_log`.

## Phase 2 — RAG

- `rag_document/chunk/embedding/index_job`.
- Worker indexing incrémental.
- Adapter vector store (`pgvector` d’abord).
- Endpoint rebuild complet par workspace.

## Phase 3 — Chat agent

- `AgentService` + `LlmProvider` abstrait.
- Génération proposals (A/B) en lecture RAG.
- UI propositions compactes + apply/reject.

## Phase 4 — Intelligence avancée

- Morning brief + rapport 7j.
- Refactor intelligent (scission/regroupement/nettoyage).
- quotas/coûts + alerting budget.

## 12.1 Migration progressive

- Écriture duale temporaire: `ActivityLog` existant + `event_log` nouveau.
- Pas de rupture API frontend existant.
- Activation workspace par workspace.

---

## 13) API cible (nouveaux endpoints)

## 13.1 Config IA workspace

- `GET /workspaces/:workspaceId/ai-config`
- `PATCH /workspaces/:workspaceId/ai-config`
- `GET /workspaces/:workspaceId/ai-usage?from=&to=`

## 13.2 Proposals

- `POST /workspaces/:workspaceId/proposals/draft`
- `POST /workspaces/:workspaceId/proposals/validate`
- `POST /workspaces/:workspaceId/proposals/:proposalId/approve`
- `POST /workspaces/:workspaceId/proposals/:proposalId/reject`
- `POST /workspaces/:workspaceId/proposals/:proposalId/apply`
- `POST /workspaces/:workspaceId/proposals/:proposalId/rollback`
- `GET /workspaces/:workspaceId/proposals?status=`

## 13.3 Agent

- `POST /workspaces/:workspaceId/agent/command` (sortie proposal JSON obligatoire)
- `POST /workspaces/:workspaceId/agent/chat` (sortie texte + suggestions éventuelles)
- `POST /workspaces/:workspaceId/agent/brief/morning`
- `POST /workspaces/:workspaceId/agent/report/weekly`
- `POST /workspaces/:workspaceId/agent/refactor/suggest`

Compatibilité:

- `POST /workspaces/:workspaceId/agent/suggest` reste temporairement supporté (deprecated), mappé vers `agent/command`.

## 13.4 RAG

- `POST /workspaces/:workspaceId/rag/rebuild`
- `GET /workspaces/:workspaceId/rag/status`
- `POST /workspaces/:workspaceId/rag/query`

## 13.5 Conversation agent

- `POST /workspaces/:workspaceId/agent/conversations`
- `POST /workspaces/:workspaceId/agent/conversations/:sessionId/messages`
- `POST /workspaces/:workspaceId/agent/conversations/:sessionId/reset`
- `GET /workspaces/:workspaceId/agent/conversations/:sessionId`
- `POST /workspaces/:workspaceId/agent/conversations/:sessionId/summarize`

---

## 14) Diagrammes de séquence

## 14.1 Suggestion -> Proposal -> Apply

```text
User -> UI: "organise ma semaine"
UI -> AgentAPI: suggest(intent)
AgentAPI -> RAG: semantic query
RAG -> AgentAPI: contexts
AgentAPI -> LLM: generate proposals JSON (A/B)
LLM -> AgentAPI: proposals JSON
AgentAPI -> Backend: POST proposals/draft
Backend -> UI: proposalId + alternatives
User -> UI: select alternative A + approve
UI -> Backend: POST proposals/{id}/apply
Backend -> DB: transaction mutations
Backend -> DB: append event_log
Backend -> Queue: rag_index_job
Backend -> UI: applied summary
```

## 14.3 Chat exploratoire -> Commande

```text
User -> UI: "je ne sais pas quoi prioriser"
UI -> AgentAPI: POST /agent/chat
AgentAPI -> ContextBuilder: build contextual snapshot
AgentAPI -> LLM: generate textual guidance
LLM -> AgentAPI: answer + suggestedCommandPayload(optional)
AgentAPI -> UI: response text + CTA "Créer une proposition"
User -> UI: confirme CTA
UI -> AgentAPI: POST /agent/command
AgentAPI -> Backend: draft proposal
```

## 14.2 Rebuild RAG complet

```text
Admin -> Backend: POST /rag/rebuild
Backend -> DB: create rebuild job
Worker -> DB: fetch entities batch
Worker -> EmbeddingProvider: embed chunks
Worker -> VectorStore: upsert vectors
Worker -> DB: mark generation active
Worker -> DB: close rebuild job DONE
```

---

## 15) Risques & mitigations

- **Risque:** Surcoût IA  
  **Mitigation:** quotas workspace + hard stop + métriques coût.

- **Risque:** Hallucination action destructive  
  **Mitigation:** proposals obligatoires, validation stricte, dry-run.

- **Risque:** Incohérence RAG/canonique  
  **Mitigation:** hash version, jobs idempotents, rebuild complet.

- **Risque:** Régression UX sans IA  
  **Mitigation:** feature flags OFF par défaut, non-régression des écrans existants.

- **Risque:** Fuite inter-workspace  
  **Mitigation:** filtrage workspace en profondeur + tests sécurité ACL.

---

## 16) Métriques de succès

## 16.1 Produit

- Taux d’acceptation proposals IA > 45%
- Temps moyen de qualification d’une quick input -30%
- Réduction items stagnant > 7j de 25%
- Réduction surcharge WIP de 20%

## 16.2 Technique

- p95 `/agent/suggest` < 2.5s (hors modèle distant lent)
- Taux échec apply proposal < 1%
- Taux désynchronisation RAG détectée < 0.5%
- Rebuild complet workspace < 30 min pour 100k chunks

## 16.3 Sécurité

- 0 écriture IA hors API proposals
- 100% actions IA loggées dans `event_log`
- 0 incident cross-workspace confirmé

## 16.4 Évaluation automatique agent

- taux `accepted / rejected / modified_after_apply`
- taux de proposals inutiles (rejetées sans modification)
- drift qualité par version de prompt
- taux fallback dégradé

KPI additionnels:

- `proposal_acceptance_rate`
- `proposal_manual_adjustment_rate`
- `proposal_rejection_rate`
- `agent_degraded_mode_rate`
- `avg_user_rating`

KPI drift additionnels:

- `prompt_version_acceptance_delta` (N vs N-1)
- `auto_rollback_count`
- `drift_alert_count`

---

## 17) Spécification de payloads clés

## 17.1 `POST /agent/suggest` request

```json
{
  "intent": "Prépare un plan d'action pour débloquer le lot façade",
  "context": {
    "boardId": "board_123",
    "focusNodeId": "node_abc",
    "maxAlternatives": 2
  }
}
```

## 17.1.b `POST /agent/command` request

```json
{
  "intent": "Réorganise le lot façade en minimisant les risques",
  "context": {
    "boardId": "board_123",
    "focusNodeId": "node_abc",
    "maxAlternatives": 2
  },
  "determinism": {
    "temperature": 0.1,
    "seed": 424242,
    "strictJsonCanonicalization": true
  }
}
```

## 17.1.c `POST /agent/chat` request

```json
{
  "message": "Aide-moi à clarifier les priorités de cette semaine",
  "context": {
    "boardId": "board_123",
    "focusNodeId": "node_abc"
  }
}
```

## 17.2.b `POST /agent/chat` response

```json
{
  "answer": "Voici 3 pistes de priorisation...",
  "suggestedCommandPayload": {
    "intent": "Propose 2 alternatives de plan d'action priorisé",
    "context": { "boardId": "board_123", "focusNodeId": "node_abc", "maxAlternatives": 2 }
  }
}
```

## 17.2 `POST /agent/suggest` response

```json
{
  "proposalId": "8e76d7a9-...",
  "alternatives": [
    {
      "alternativeNo": 1,
      "summary": "Option A - Prioriser levée des blockers",
      "compactActions": [
        "CREATION CARTE → DANS PRA → TYPE next_action → ECHEANCE 20/02",
        "DEPLACEMENT CARTE #481 → VERS BLOCKED"
      ],
      "actions": []
    },
    {
      "alternativeNo": 2,
      "summary": "Option B - Découpage projet",
      "compactActions": [
        "SCISSION PROJET #32 → 3 sous-projets"
      ],
      "actions": []
    }
  ]
}
```

## 17.3 Erreurs standard

```json
{
  "error": {
    "code": "FEATURE_DISABLED",
    "message": "AI is disabled for this workspace",
    "details": { "workspaceId": "board_123" }
  }
}
```

---

## 18) Plan technique d’implémentation (ordre conseillé)

1. Créer tables `workspace_ai_config`, `proposal*`, `event_log`, `ai_usage_log`.
2. Instrumenter écritures existantes critiques vers `event_log`.
3. Créer module `ProposalsModule` (draft/validate/apply).
4. Introduire `Node.kind` + migration data.
5. Créer `RagModule` + workers + abstraction vector store.
6. Ajouter `AgentModule` (suggestions -> proposals).
7. Frontend: panneau proposals compact A/B.
8. Frontend: brief quotidien + rapport hebdo.
9. Ajouter quotas/coûts + observabilité.
10. Déploiement progressif workspace par workspace.

11. Split endpoint `agent/command` vs `agent/chat` + migration compat `agent/suggest`.
12. Déployer `BusinessRuleEngine` centralisé + logs d’exécution.
13. Activer optimistic locking + preconditions versionnées.
14. Activer kill switches + circuit breaker auto.

---

## 19) Compatibilité et non-régression

- Les endpoints existants (`boards`, `nodes`, `auth`, `teams`, `dashboards`, `quick-notes`) restent contractuellement stables.
- Les écrans Kanban/Liste/Gantt restent inchangés en mode IA OFF.
- Les quick-notes IA existantes peuvent être migrées progressivement vers le moteur proposal générique (bridge layer).

---

## 20) Décisions d’architecture (ADR condensés)

- ADR-001: Canonique DB unique, RAG dérivé jetable.
- ADR-002: Agent read via RAG, write via proposals API seulement.
- ADR-003: Event log append-only dédié (distinct d’`ActivityLog` borné).
- ADR-004: Multi-provider LLM/Embedding via interfaces abstraites.
- ADR-005: Mode sans IA first-class, flags granulaire workspace.
- ADR-006: AgentContextBuilder obligatoire avant tout appel LLM.
- ADR-007: Règles/invariants métier externalisés (DSL) et réutilisés par API + agent.
- ADR-008: State machine explicite de `Node` pour réduire la logique implicite dispersée.

---

## 21) Critères d’acceptation

- [ ] Mode IA OFF: aucune régression fonctionnelle sur flux actuels.
- [ ] Proposal apply est atomique et journalisé dans `event_log`.
- [ ] RAG rebuild complet disponible et idempotent.
- [ ] 3 niveaux IA activables par workspace.
- [ ] UI affiche alternatives A/B au format compact demandé.
- [ ] Morning brief + rapport 7 jours basés sur `event_log`.
- [ ] Contrôles permissions partagées respectés à l’apply.
- [ ] Séparation fonctionnelle claire `agent/command` vs `agent/chat`.
- [ ] Règles métier appliquées de manière uniforme (manuel/proposal/agent).
- [ ] Revalidation de concurrence bloque les proposals stale.
- [ ] Kill switch global/workspace/feature testé en environnement de prod.
- [ ] Conflit RAG/live résolu en faveur du live state et rebuild déclenché.
- [ ] Confidence gating actif (haute/moyenne/basse) avec UX différenciée.
- [ ] Limite `max_entities_impacted_per_proposal` appliquée et testée.
- [ ] Drift control (alerte + rollback auto) validé sur prompts N/N-1.

---

## 22) Notes de transition depuis l’existant

1. `ActivityLog` actuel conserve son usage UI court terme; ne pas le casser.  
2. `event_log` devient la source analytique long terme pour brief/reporting.  
3. `QuickNotesAiService` existant sert de point d’entrée pilote pour brancher Proposal Engine.  
4. Le fallback heuristique actuel reste disponible en niveau LIGHT.

---

## 23) Performance engineering (obligatoire)

### 23.1 Retrieval et ranking

- pagination retrieval (`cursor + topK`)
- retrieval en 2 étapes: ANN topK large -> re-ranking cross-encoder topN
- index partiel par type (`project`, `next_action`, `risk` prioritaires)

### 23.2 Embeddings

- batching embeddings (taille batch configurable)
- backpressure worker
- coalescing des jobs même entité

### 23.3 Réponses agent

- streaming de sortie LLM (SSE/chunked)
- timeout budgetisé par étape (context build, retrieval, generation)
- cache chaud de contexte board (`hot context cache`)

### 23.4 Objectifs perf

- p95 context build < 300ms
- p95 retrieval + re-ranking < 450ms
- time-to-first-token < 900ms (stream)

### 23.5 SLA UX latence perçue

Règle UX orientée perception:

- `> 800ms`: afficher “analyse en cours”
- `> 2s`: afficher résultat partiel LIGHT (si disponible) + poursuite HEAVY en arrière-plan
- `> 4s`: proposer annulation + fallback explicite

Objectif: éviter perception “agent lent = agent faible”.

### 23.6 Latence et fallback orchestration

- budget temps par étape (`context`, `retrieval`, `generation`, `post-processing`)
- si dépassement budget global: fallback contrôlé vers `LIGHT`
- journaliser `timeout_stage` pour tuning opérationnel

### 23.7 Estimation coût embedding long terme

Ajouter des projections budgétaires continues:

- coût estimé rebuild complet workspace
- coût mensuel embedding auto (incrémental)
- alerte si projection dépasse 80% budget

Formule simplifiée:

```text
estimated_embedding_cost = (estimated_tokens / 1_000) * provider_price_per_1k
```

Politique:

- blocage des rebuild non critiques si budget prévisionnel dépasse hard limit
- proposer mode compression/downsampling avant embedding complet

---

## 24) Stratégie UX Chat agent

### 24.1 État conversationnel

- session persistante par workspace/utilisateur (`agent_conversation_session`)
- board focus + node focus injectés systématiquement
- reset conversation explicite côté UI

### 24.2 Résumé automatique thread

- seuil `auto_summarize_threshold`
- génération `conversation_summary` quand budget token approche limite
- réinjection du résumé au lieu de l’historique complet

### 24.3 Cohérence conversationnelle

- budget token contrôlé par session
- indicateur UI « contexte résumé »
- commande utilisateur: `Repartir à zéro`

---

## 25) State machine Node (première version)

États logiques minimaux:

- `BACKLOG`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`
- `ARCHIVED`

Transitions encadrées:

```text
BACKLOG -> IN_PROGRESS
IN_PROGRESS -> BLOCKED
BLOCKED -> IN_PROGRESS
IN_PROGRESS -> DONE
DONE -> ARCHIVED
ARCHIVED -> BACKLOG (restore)
```

Invariants:

- transition interdite si permissions insuffisantes
- transition `IN_PROGRESS -> DONE` peut exiger préconditions (ex: dépendances satisfaites)
- `ARCHIVED` non modifiable hors restore explicite

---

## 26) Vision stratégique produit: in-app vs plateforme agent

Question stratégique:

- **Option A — Agent en feature premium in-app**
  - focus UX Stratum uniquement
  - intégration limitée aux écrans internes
  - complexité d’écosystème réduite

- **Option B — Agent comme cœur produit à moyen terme**
  - API agent publique
  - connecteurs externes (Slack, email, CLI)
  - webhooks events vers runtimes agents externes
  - scheduler autonome orienté objectifs

Recommandation trajectoire (pragmatique):

1. court terme: livrer architecture robuste in-app (phases 1-4)
2. moyen terme: ouvrir `Agent Public API` en lecture puis en command contrôlée
3. long terme: Stratum comme moteur de mémoire structurée augmentée, interopérable

### 26.1 Extension d’architecture cible (option B)

```text
External Channels (Slack/Email/CLI)
  |
  v
Agent Gateway API (public, scoped tokens)
  |
  v
Command/Chat Router -> ContextBuilder -> Proposal Engine
  |
  v
Canonical DB + Event Log + RAG
```

### 26.2 Endpoints plateforme (phase ultérieure)

- `POST /public/agent/command`
- `POST /public/agent/chat`
- `GET /public/workspaces/:id/events/stream`
- `POST /public/workspaces/:id/webhooks`

---

## 27) Object-Oriented Memory Model (évolution stratégique)

Objectif: faire évoluer Stratum de gestionnaire de tâches vers moteur de mémoire structurée augmentée.

Le modèle agent doit intégrer des objets de pilotage au-delà des nodes:

- objectifs (`goal`)
- contraintes (`constraint`)
- priorités (`priority_policy`)
- capacité humaine (`capacity_profile`)
- historique décisionnel (`decision_log`)

### 27.1 Entité `goal` (proposition minimale)

```sql
goal (
  id uuid pk,
  workspace_id text not null,
  description text not null,
  horizon text not null check (horizon in ('WEEK','QUARTER','YEAR')),
  linked_nodes jsonb not null default '[]'::jsonb,
  success_metric jsonb not null,
  confidence_level numeric(4,3) null,
  status text not null check (status in ('ACTIVE','PAUSED','DONE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on goal (workspace_id, status, horizon);
```

### 27.2 Usage par l’agent

- prioriser les proposals en fonction des `goal` actifs
- détecter conflits entre actions proposées et contraintes/capacité
- produire des suggestions alignées objectifs (pas uniquement tâches locales)

### 27.3 Impact produit

- passage d’un agent “task-centric” à un agent “strategy-centric”
- amélioration cohérence long terme des proposals et rapports
