# PRD - Mode Rapport et Journal d'Activite Complet

Date: 2026-03-17

## 1. Objectif

Concevoir des le depart une solution ambitieuse pour:

- ajouter un nouveau mode de vision `rapport`
- permettre un filtrage temporel riche avec presets et plage personnalisee
- afficher un retour lisible et complet de l'activite sur une periode
- disposer d'un journal d'evenements fiable, exhaustif et durable pour toutes les modifications de cartes

Le but n'est pas seulement d'avoir une timeline d'activite pratique. Le but est d'avoir une source de verite exploitable pour:

- un usage personnel: "qu'est-ce que j'ai fait cette semaine ?"
- un usage equipe: "qu'est-ce qui a bouge sur ce projet ?"
- un usage manager: "quel a ete le travail reel realise sur la periode ?"
- un usage historique: comprendre les decisions, changements et commentaires dans le temps

## 2. Constat sur l'existant

Le systeme actuel d'activite est utile, mais insuffisant comme base de rapport complet.

Points constates dans le codebase:

- [apps/backend/prisma/schema.prisma](apps/backend/prisma/schema.prisma): `ActivityLog` existe, avec `ActivityType` et `metadata`
- [apps/backend/src/modules/activity/activity.service.ts](apps/backend/src/modules/activity/activity.service.ts): le service applique une retention courte via `MAX_ACTIVITY_LOGS_PER_NODE`
- [apps/backend/src/modules/nodes/nodes.service.ts](apps/backend/src/modules/nodes/nodes.service.ts): plusieurs changements sont deja journalises, mais pas tous
- [docs/devbook-activity-log.md](docs/devbook-activity-log.md): la doc confirme une logique bornee, destructive et orientee timeline courte
- [docs/PRD_AGENT_NATIVE.md](docs/PRD_AGENT_NATIVE.md): une direction existe deja vers un `event_log` append-only, plus adapte au reporting durable

Limites actuelles:

- le journal d'activite est borne par tache
- les anciennes entrees sont supprimees
- la suppression d'une tache entraine la suppression de ses logs
- certains champs modifiables ne sont pas journalises
- les commentaires ne sont pas historises de facon complete
- le systeme actuel est adapte a une sidebar d'activite, pas a un vrai rapport de periode

Conclusion:

Le mode rapport ne doit pas etre bati sur `ActivityLog` comme source principale. Il faut introduire un journal d'evenements durable, append-only, puis construire la vue rapport dessus.

## 3. Vision produit

Le mode `rapport` doit permettre de repondre rapidement a trois questions:

1. Qu'est-ce qui a ete fait pendant la periode ?
2. Sur quels projets et quelles cartes cela s'est-il passe ?
3. Quelles actions concretes ont ete menees, y compris les commentaires et les changements de contenu ?

### 3.1 Experience cible

Par defaut, l'utilisateur arrive sur:

- mode `rapport`
- plage `7 derniers jours`
- regroupement `Projet puis chronologie`

En haut, il voit:

- un selecteur de periode avec presets rapides
- un calendrier unique permettant de choisir date de debut puis date de fin
- quelques metriques de synthese sur la periode
- des filtres complementaires: acteur, type d'action, projet, carte, texte

Ensuite, il lit une liste structuree ainsi:

- Projet A
- Lundi 17 mars
- 09:12 Alice a cree la carte "Preparer devis"
- 09:18 Alice a deplace la carte de `Backlog` vers `En cours`
- 09:24 Alice a modifie l'echeance de `2026-03-20` vers `2026-03-22`
- 09:41 Alice a ajoute un commentaire avec son contenu lisible

### 3.2 Public vise

Le mode rapport doit fonctionner pour tout le monde:

- usage perso
- usage collaboratif
- usage manager

La meme base de donnees doit permettre plusieurs niveaux de lecture sans dupliquer le systeme.

## 4. Decisions produit recommandees

### 4.1 Periode

Valeur par defaut:

- `7 derniers jours`

Presets recommandes:

- `24h`
- `Aujourd'hui`
- `Hier`
- `Semaine en cours`
- `Semaine passee`
- `7 jours`
- `14 jours`
- `21 jours`
- `28 jours`
- `Mois en cours`
- `Mois passe`
- `Personnalise`

### 4.2 Groupement d'affichage

Mode par defaut:

- `Projet puis chronologie`

Modes secondaires:

- `Chronologie globale`
- `Type d'action puis chronologie`

Raison:

- `Projet puis chronologie` est le plus naturel pour faire un retour humain sur une periode
- `Chronologie globale` est utile pour relire une journee ou une sequence d'execution
- `Type d'action` est utile pour les audits ciblant une famille d'evenements

### 4.3 Commentaires

Le rapport doit afficher le contenu des commentaires.

Recommandation d'UX:

- afficher un extrait lisible par defaut si le commentaire est long
- permettre l'expansion inline
- eviter de reposer uniquement sur un tooltip
- autoriser un scroll interne leger si le contenu est vraiment volumineux

### 4.4 Nature du journal

Le journal source doit etre:

- append-only
- durable
- non destructif a la suppression d'une carte
- horodate precisement
- structure pour l'audit et la lecture humaine

## 5. Architecture cible

La solution repose sur deux couches distinctes.

### 5.1 Couche 1 - Journal canonique d'evenements

Introduire une table de type `event_log` ou equivalent, distincte de `ActivityLog`.

Cette table devient la source de verite pour:

- le mode rapport
- les rapports periodiques futurs
- les exports eventuels
- les analyses d'activite longues

`ActivityLog` peut continuer d'alimenter la sidebar actuelle pendant une phase transitoire.

### 5.2 Couche 2 - Vues de lecture

Construire ensuite dessus:

- une vue `rapport` dans le board
- une API de lecture par plage temporelle et filtres
- a terme, des exports CSV/JSON/PDF si necessaire

## 6. Contrat de donnees du journal canonique

Chaque evenement doit contenir au minimum:

- `id`
- `occurredAt`
- `workspaceId`
- `teamId`
- `boardId`
- `nodeId`
- `parentNodeId`
- `actorType` (`USER`, `AGENT`, `SYSTEM`)
- `actorId`
- `source` (`API`, `AGENT`, `SCHEDULER`)
- `eventType`
- `fieldKey` si applicable
- `summary` texte court lisible
- `payload` structure detaillee
- `correlationId` pour relier plusieurs evenements issus d'une seule action utilisateur
- `requestId` si disponible
- `visibilityScope` si un filtrage de confidentialite doit exister

### 6.1 Payload recommande

Le `payload` doit permettre deux usages en meme temps:

- lecture humaine
- audit technique

Structure recommandee:

```json
{
  "oldValue": "Backlog",
  "newValue": "En cours",
  "oldDisplay": "Backlog",
  "newDisplay": "En cours",
  "context": {
    "fromColumnId": "col_1",
    "toColumnId": "col_2",
    "fromParentId": "node_a",
    "toParentId": "node_b"
  },
  "comment": {
    "commentId": "com_1",
    "body": "Texte du commentaire",
    "bodyPreview": "Texte du commentaire"
  }
}
```

## 7. Taxonomie d'evenements a couvrir

La regle est simple: chaque action modifiable depuis la fiche ou l'ecran de board doit produire un evenement.

### 7.1 Creation et cycle de vie

- `NODE_CREATED`
- `NODE_ARCHIVED`
- `NODE_RESTORED`
- `NODE_DELETED_SOFT`
- `NODE_DELETED_HARD` si un hard delete existe encore

### 7.2 Contenu de la carte

- `TITLE_UPDATED`
- `DESCRIPTION_UPDATED`
- `PRIORITY_UPDATED`
- `EFFORT_UPDATED`
- `PROGRESS_UPDATED`
- `TAGS_UPDATED`
- `BLOCKED_STATUS_CHANGED`

### 7.3 Dates et planification

- `DUE_DATE_UPDATED`
- `PLANNED_START_DATE_UPDATED`
- `PLANNED_END_DATE_UPDATED`
- `ACTUAL_END_DATE_UPDATED`
- `SCHEDULE_MODE_CHANGED`
- `SCHEDULE_DEPENDENCIES_UPDATED`
- `BACKLOG_HIDDEN_UNTIL_UPDATED`

### 7.4 Affectations et responsabilites

- `ASSIGNEES_UPDATED`
- `RACI_UPDATED`
- `COLLABORATOR_ADDED`
- `COLLABORATOR_REMOVED`

### 7.5 Mouvements structurels

- `COLUMN_MOVED`
- `PARENT_CHANGED`
- `MOVED_TO_BOARD`
- `POSITION_REORDERED` si l'ordre dans une colonne doit etre historise

### 7.6 Commentaires

- `COMMENT_ADDED`
- `COMMENT_EDITED`
- `COMMENT_DELETED`

Pour les commentaires, il faut conserver:

- l'auteur
- le contenu
- la version precedente en cas d'edition
- le contexte de suppression si suppression

### 7.7 Champs budget / temps si deja editables

Si ces champs sont exposes dans la fiche, ils doivent etre traces egalement:

- `ESTIMATED_TIME_UPDATED`
- `ACTUAL_OPEX_UPDATED`
- `ACTUAL_CAPEX_UPDATED`
- `BILLING_STATUS_UPDATED`
- `HOURLY_RATE_UPDATED`
- `PLANNED_BUDGET_UPDATED`
- `CONSUMED_BUDGET_UPDATED`

## 8. Points d'instrumentation backend

Points de code a instrumenter ou etendre:

- [apps/backend/src/modules/nodes/nodes.service.ts](apps/backend/src/modules/nodes/nodes.service.ts): coeur des mises a jour de carte
- [apps/backend/src/modules/activity/activity.service.ts](apps/backend/src/modules/activity/activity.service.ts): utile comme reference, mais pas comme base du journal durable
- service des commentaires: creation, edition, suppression, lecture eventuelle si necessaire plus tard
- services de mouvement kanban et changement de parent
- services de partage/collaboration si ces evenements doivent apparaitre dans le rapport

### 8.1 Principe d'instrumentation

Ne pas se contenter de logger au niveau controller.

Le bon niveau est le service metier, pour garantir que:

- toutes les mutations passent par le journal
- les evenements restent coherents meme si plusieurs interfaces ecrivent sur le meme objet
- les changements groupables dans une meme operation partagent un `correlationId`

### 8.2 Recommandation de migration

Phase transitoire recommandee:

- dual-write pendant un temps
- `ActivityLog` continue d'alimenter la sidebar existante
- `event_log` devient la source du mode `rapport`
- une fois stabilise, decider si `ActivityLog` reste une vue courte derivee ou s'il peut etre simplifie

## 9. API du mode rapport

Prevoir une API dediee, plutot qu'un simple recyclage des endpoints d'activite actuels.

### 9.1 Endpoint principal

Exemple de direction:

```text
GET /reports/activity
```

Filtres recommandes:

- `from`
- `to`
- `teamId`
- `boardId`
- `actorId`
- `eventTypes[]`
- `nodeId`
- `query`
- `groupBy=project|timeline|type`
- `page`
- `pageSize`

### 9.2 Reponse attendue

La reponse doit inclure:

- les groupes preconstruits si `groupBy` est demande
- les metriques d'en-tete de periode
- les evenements pagines
- les informations minimales de navigation: board, carte, parent, auteur

### 9.3 Performance

Le volume peut monter vite. Il faut penser des le debut a:

- indexes temporels
- indexes par board / actor / eventType
- pagination
- limites de plage si necessaire pour certains affichages

## 10. UX du mode rapport

Points d'accroche front deja identifies:

- [apps/frontend/src/features/boards/board-ui-settings.tsx](apps/frontend/src/features/boards/board-ui-settings.tsx): ajouter `rapport` au `BoardViewMode`
- [apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardPageShell.tsx](apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardPageShell.tsx): ajouter le bouton de vue et le branchement du composant
- [apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardListView.tsx](apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardListView.tsx): pattern utile pour filtres, liste et persistance locale
- [apps/frontend/src/features/activity/ActivityPanel.tsx](apps/frontend/src/features/activity/ActivityPanel.tsx): pattern utile pour groupement chronologique et messages lisibles

### 10.1 Composition recommandee de l'ecran

#### Barre haute

- selecteur de plage temporelle
- presets rapides
- calendrier debut/fin dans la meme interaction
- bouton reset
- bouton sauvegarder un preset si on veut aller plus loin ensuite

#### Bandeau de synthese

- cartes creees
- cartes deplacees
- cartes cloturees
- commentaires ajoutes
- descriptions modifiees
- echeances modifiees
- progression modifiee

#### Liste principale

Affichage par defaut:

- groupe par projet
- sous-groupe par jour
- evenements tries par heure descendante ou ascendante selon preference

#### Ligne d'evenement

Chaque ligne doit montrer clairement:

- heure
- auteur
- verbe d'action
- titre de la carte
- contexte du projet / colonne / parent si utile
- `avant -> apres` si pertinent
- commentaire lisible si applicable

### 10.2 Vues secondaires

Ajouter un petit switch local:

- `Projet`
- `Chronologie`
- `Type d'action`

La vue par projet reste le defaut.

## 11. Confidentialite et controle d'acces

Le rapport ne doit jamais exposer des evenements hors perimetre d'acces reel.

Contraintes:

- verifier les permissions de lecture des cartes et boards
- ne retourner que les evenements visibles par l'utilisateur
- prevoir un mecanisme de redaction si certains contenus doivent etre masques

Commentaires:

- le besoin produit est d'afficher le contenu
- il faut donc verifier si certains commentaires peuvent etre sensibles
- si oui, definir une strategie de masquage ou de niveau de visibilite

## 12. Strategie de mise en oeuvre

### Phase 0 - Cadrage

- valider la taxonomie d'evenements
- valider le contrat `event_log`
- arbitrer les cas de confidentialite

### Phase 1 - Fondation backend

- ajouter le journal append-only dans Prisma
- generer migration et client Prisma
- implementer un service de journal canonique
- ajouter les indexes necessaires

### Phase 2 - Instrumentation metier

- brancher toutes les mutations de cartes
- brancher les commentaires creation / edition / suppression
- brancher les changements de parent et de board
- ajouter `correlationId` pour les actions composites

### Phase 3 - Lecture rapport cote API

- creer un endpoint dedie au rapport
- implementer les filtres de periode
- implementer `groupBy`
- exposer les compteurs de synthese

### Phase 4 - Frontend mode `rapport`

- ajouter `rapport` au view mode
- creer `BoardReportView`
- gerer les presets temporels
- gerer la plage personnalisee
- afficher la liste groupee par projet puis chronologie

### Phase 5 - Stabilisation

- valider performance
- valider permissions
- valider coherence du journal
- decider du futur de `ActivityLog`

## 13. Definition of done

Le chantier peut etre considere comme reussi quand:

- chaque modification editable de la fiche produit un evenement durable
- la suppression d'une carte ne detruit plus l'historique necessaire au rapport
- le mode `rapport` existe dans l'UI board
- la vue par defaut est `7 jours` + `Projet puis chronologie`
- les presets temporels principaux fonctionnent
- les commentaires sont lisibles dans le rapport
- les filtres de plage personnalisee fonctionnent avec date de debut et date de fin
- les permissions sont respectees
- les performances restent correctes sur des periodes longues avec pagination

## 14. Hors perimetre initial

Ces sujets sont utiles, mais ne doivent pas bloquer la V1:

- export PDF
- export CSV avance
- synthese IA automatique
- notifications email / Slack basees sur le rapport
- dashboard portefeuille multi-workspace

## 15. Questions ouvertes a arbitrer plus tard

- faut-il historiser les lectures de commentaire ou seulement les ecritures ?
- faut-il historiser chaque reordonnancement fin dans une colonne, ou seulement les changements structurels visibles ?
- faut-il conserver le contenu complet de certains commentaires en clair, ou rediger certains cas ?
- faut-il permettre l'export des rapports des la V1 ou plus tard ?

## 16. Recommandation finale

La bonne ambition des le depart est la suivante:

- ne pas bricoler un rapport sur l'ActivityLog actuel
- poser un vrai journal append-only complet
- livrer une lecture simple, humaine et immediatement utile en `Projet puis chronologie`

Autrement dit:

- la source doit etre rigoureuse
- l'affichage doit etre naturel
- la V1 doit etre deja exploitable autant en perso qu'en equipe

## 17. Prompt de reprise pour un autre chat

Si ce sujet doit etre repris dans un autre chat, utiliser ce cadrage:

```text
Contexte: on veut ajouter un mode de vue "rapport" dans Stratum et le faire reposer sur un vrai journal d'evenements append-only, pas sur l'ActivityLog borne actuel.

Objectif produit:
- mode rapport visible dans le board
- plage par defaut = 7 jours
- presets = 24h, aujourd'hui, hier, semaine en cours, semaine passee, 7/14/21/28 jours, mois en cours, mois passe, personnalise
- affichage par defaut = projet puis chronologie
- commentaires visibles dans le rapport

Objectif technique:
- creer un journal canonique durable type event_log
- journaliser toutes les mutations editables de carte: titre, description, progression, commentaires, echeance, priorite, effort, parent, colonne, board, etc.
- conserver l'historique meme si la carte ou le commentaire est supprime
- exposer une API de lecture rapport avec filtres et groupBy
- ajouter le mode rapport dans le frontend

Fichiers a inspecter en premier:
- apps/backend/prisma/schema.prisma
- apps/backend/src/modules/nodes/nodes.service.ts
- apps/backend/src/modules/activity/activity.service.ts
- apps/frontend/src/features/boards/board-ui-settings.tsx
- apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardPageShell.tsx
- apps/frontend/src/app/boards/[teamId]/[[...board]]/components/BoardListView.tsx
- apps/frontend/src/features/activity/ActivityPanel.tsx
- docs/devbook-activity-log.md
- docs/PRD_AGENT_NATIVE.md
- docs/PRD_REPORT_MODE_ACTIVITY_LOG.md

Commencer par proposer le schema du journal canonique, la taxonomie d'evenements et le plan de migration dual-write.
```