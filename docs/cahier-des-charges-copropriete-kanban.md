# Cahier des charges — Copropriété des kanbans partagés
Version 1 — Modèle simple, orienté collaboration

---

## 1) Philosophie produit

Objectif : supprimer la complexité de gestion des droits et privilégier un modèle humain, simple et collaboratif.
Une fois partagé, un kanban n’appartient plus à une seule personne : tout invité devient propriétaire.
Le système repose sur la responsabilité, la traçabilité et l’explicabilité des actions.

Principes clés :
- Simplicité : pas de sous‑droits, pas de “sous‑partage” compliqué.
- Cohérence : éviter les doubles partages parent/enfant.
- Prévisibilité UX : aucune action ne doit surprendre ou faire “disparaître” un kanban sans explication.
- Traçabilité : tout événement important est journalisé. 

---

## 2) Définitions

- Kanban partagé : un kanban dont l’accès est donné à d’autres utilisateurs.
- Propriétaire : toute personne qui a accès via un partage.
- Lien de partage : la présence d’un kanban partagé dans l’espace de quelqu’un.
- Couper le lien : retirer un kanban partagé de son espace sans impacter les autres.
- Dernier propriétaire : dernier utilisateur ayant encore un lien actif.

---

## 3) Règles fonctionnelles

### 3.1 Copropriété
- Toute personne invitée devient propriétaire.
- Tous les propriétaires ont les mêmes droits : créer, modifier, archiver, déplacer.

### 3.2 Suppression / restauration
- La suppression est un soft‑delete restaurable.
- Toute suppression/restauration est loguée.

### 3.3 Déplacement hors périmètre partagé
- Autorisé, même si cela fait disparaître le kanban pour certains.
- Obligation de log pour tracer l’action.

### 3.4 Partage hérité
- Si un kanban privé est déplacé dans un kanban partagé, il devient partagé.

### 3.5 Supprimer un kanban partagé
- Un propriétaire ne supprime pas le kanban pour les autres, il supprime son lien.
- L’action affichée doit être “Supprimer le lien” (et non “Supprimer”).

### 3.6 Dernier propriétaire
- Si tous les autres coupent le lien, le dernier propriétaire retrouve un kanban “normal”.
- Si ce dernier supprime son compte, le kanban est supprimé comme ses autres kanbans.

### 3.7 Aucun retrait de droits
- Aucun propriétaire ne peut retirer un autre propriétaire.
- On ne peut que couper son propre lien.

### 3.8 Archivage
- Archivage global pour tous, au moins pour la phase actuelle.

---

## 4) Cas limites décidés

### 4.1 Auto‑désinvitation
- Autorisée sauf si on est le dernier propriétaire.

### 4.2 Conflits d’édition
- Résolution simple : ordre d’arrivée (last write wins).

### 4.3 Parent + enfant partagé
- Interdiction d’être invité sur un parent et un sous‑kanban en parallèle.
- On coupe le lien au niveau qui fait doublon.

### 4.4 Invitations multiples / ré‑invitation
- Inviter plusieurs personnes : autorisé.
- Ré‑inviter après refus/expiration : autorisé.

### 4.5 Invitation avant création de compte
- Autorisé : l’invité récupère l’accès après inscription.

### 4.6 Privé ↔ partagé
- Déplacer un partagé sous un privé le fait disparaître pour les non‑propriétaires.
- Déplacer un privé sous un partagé le rend partagé.

### 4.7 Historique
- Tout reste : commentaires, actions, logs.
- Même si l’auteur coupe son lien.

---

## 5) Scénario critique : B déplacé dans A

### Situation
- A partagé avec {X, Y, Z}
- B partagé avec {X, Y, Z, M, N}
- B déplacé sous A

### Problème
- Double partage parent/enfant interdit.
- Déplacement provoquerait perte d’accès silencieuse pour M/N ou double exposition.

### Décision : refus du déplacement
- Le déplacement est refusé tant que les groupes de partage ne sont pas identiques.

Message UX :
“Impossible de déplacer ce kanban : ses partages ne sont pas compatibles avec le parent.
Supprimez d’abord le lien pour les personnes en trop ou alignez les partages.”

Avantages :
- Pas de disparition silencieuse
- UX claire
- Pas de complexité de synchronisation de positions

---

## 6) Signalétique UI (obligatoire)

- Indiquer visuellement qu’un kanban est partagé (couleur ou forme dédiée).
- Dans l’arborescence : badge “Partagé”.
- Dans le header : mention claire.
- Action “Supprimer” → “Supprimer le lien”.

---

## 7) Journalisation (log obligatoire)

Tous ces événements doivent être logués :
- Partage initié
- Invitation acceptée/refusée
- Déplacement d’un kanban partagé
- Déplacement refusé (cause incompatible)
- Suppression / restauration
- Coupure de lien

Les logs doivent être visibles en haut de l’écran.

---

## 8) Implications & risques

### Risques UX
- Disparition de kanbans si déplacés hors périmètre partagé.
- Confusion si pas de signalétique claire.

### Risques organisationnels
- Aucun mécanisme de révocation forcée : nécessite un comportement adulte.
- Le dernier propriétaire devient responsable unique (comme un kanban privé).

### Risques techniques
- Conflits d’édition non détectés (résolus par ordre d’arrivée).
- Nécessité de garantir l’héritage correct de partage.

### Mitigation
- Logs visibles.
- UI de partage explicite.
- Refus des déplacements incompatibles.

---

## 9) Synthèse

- Partage simple
- Copropriété totale
- Pas de droits multiples
- Soft‑delete restaurable
- Logs exhaustifs
- Refus des déplacements incompatibles

---

## 10) Matrice “scénario → résultat attendu” (testable)

1) Inviter une personne sur un kanban
- Résultat : la personne devient propriétaire du kanban et de tous les sous‑kanbans.
- Log : “partage initié” + “invitation créée”.

2) Invitation acceptée
- Résultat : lien actif dans l’espace de l’invité, accès complet.
- Log : “invitation acceptée”.

3) Invitation refusée ou expirée
- Résultat : aucun lien créé. Ré‑invitation possible.
- Log : “invitation refusée/expirée”.

4) Couper le lien (non dernier propriétaire)
- Résultat : le kanban disparaît de l’espace du demandeur, reste pour les autres.
- Log : “lien supprimé”.

5) Couper le lien (dernier propriétaire)
- Résultat : le kanban devient un kanban privé classique du dernier.
- Log : “lien supprimé (dernier propriétaire)”.

6) Suppression d’un kanban partagé
- Résultat : soft‑delete global, restaurable par n’importe quel propriétaire.
- Log : “kanban supprimé (soft)”.

7) Restauration d’un kanban partagé
- Résultat : restauré pour tous.
- Log : “kanban restauré”.

8) Déplacer un kanban privé dans un partagé
- Résultat : le kanban devient partagé.
- Log : “kanban devenu partagé par héritage”.

9) Déplacer un kanban partagé hors du parent partagé
- Résultat : il disparaît pour ceux qui n’ont pas accès au nouveau parent.
- Log : “kanban déplacé hors périmètre partagé”.

10) Déplacer un kanban B sous un parent A avec partage incompatible
- Résultat : déplacement refusé.
- Log : “déplacement refusé — partage incompatible”.

11) Suppression de compte d’un propriétaire non dernier
- Résultat : ses liens et kanbans privés sont supprimés, kanbans partagés restent.
- Log : “compte supprimé — liens retirés”.

12) Suppression de compte du dernier propriétaire
- Résultat : kanban supprimé comme kanban privé.
- Log : “compte supprimé — kanban supprimé”.

---

## 11) Spécification des logs (événements + payload minimal)

Chaque log doit contenir :
- type (enum)
- actorId
- kanbanId (nœud concerné)
- timestamp
- metadata (objet JSON libre)

Types obligatoires :
- SHARE_INVITE_CREATED
- SHARE_INVITE_ACCEPTED
- SHARE_INVITE_DECLINED
- SHARE_INVITE_EXPIRED
- SHARE_LINK_REMOVED
- KANBAN_SOFT_DELETED
- KANBAN_RESTORED
- KANBAN_MOVED
- KANBAN_MOVE_REFUSED
- KANBAN_BECAME_SHARED

Metadata recommandée :
- targetUserId (si invitation)
- fromParentId / toParentId (si déplacement)
- reason (si refus)
- isLastOwner (si lien supprimé)

---

## 12) Règles UI détaillées

Signalétique “partagé” :
- Badge “Partagé” dans l’arborescence.
- Marque visuelle persistante dans le header du kanban.
- Colorimétrie unique et cohérente (ex: bordure + icône).

Libellés exacts :
- “Supprimer le lien” (si partagé)
- “Supprimer” (si privé)

Zone d’activité :
- En‑tête du kanban avec flux des derniers événements.
- Afficher : type d’action, acteur, date relative.

---

## 13) Logique de refus des déplacements (pseudo‑règle)

Un déplacement d’un kanban X sous un parent Y est refusé si :
- X est partagé ET Y est partagé
- ET le set des propriétaires de X ≠ set des propriétaires de Y

Message UX (obligatoire) :
“Impossible de déplacer ce kanban : ses partages ne sont pas compatibles avec le parent. Supprimez d’abord le lien pour les personnes en trop ou alignez les partages.”

---

## 14) Migration des données existantes

Objectif : aligner l’existant sur la copropriété simple.

Actions à prévoir :
1) Identifier tous les kanbans partagés et leur liste de propriétaires.
2) S’assurer que chaque propriétaire est “owner” (pas de distinction).
3) Supprimer les anciennes notions de “invité limité” si elles existent.
4) Normaliser les partages parent/enfant :
	- si un utilisateur est partagé sur parent + enfant, conserver le parent, couper l’enfant.
5) Générer un log “migration” pour audit.

---

## 15) Notes d’implémentation (non‑bloquantes)

- L’état “archivé” reste global pour tous.
- Les conflits sont résolus par ordre d’arrivée (last write wins).
- Les commentaires et historiques ne sont jamais supprimés.
