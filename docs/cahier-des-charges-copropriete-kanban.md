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
- il n'est donc pas possible de virer une personne d'un kanban, il faut lui demander de supprimer le lien

### 3.6 Dernier propriétaire
- Si tous les autres coupent le lien, le dernier propriétaire retrouve un kanban “normal”.
- Si ce dernier supprime son compte, le kanban est supprimé comme ses autres kanbans. la on parle de vrai suppression (sauf pour les kanbans qui serait partagé avec d'autre ne sera supprimer que ce qui est en nom propre)

### 3.7 Aucun retrait de droits
- Aucun propriétaire ne peut retirer un autre propriétaire.
- On ne peut que couper son propre lien.

### 3.8 Archivage
- Archivage global pour tous, au moins pour la phase actuelle.
- si dans un kanban partagé quelqu'un archive alors ça archive pour tous.
- il y a juste une exception le kanban racine celui qui est partagé lui va être traité de manière local, à savoir il y a 2 propriétaires, si l'un le met en archive c'est juste pour lui, l'autre le verra. et ça se comprend très bien car un kanban partagé peut être déplacé comme bon lui semble par l'un des propriétaires. exemple je risque de créer un kanban "partagé" dans le quel je vais suivre la vie des kanbans partagés et si j'ai fini je peux le mettre comme terminé car ça sera pour moi terminé, mais un autre peut très bien continuer à bosser dessus.

---

## 4) Cas limites décidés

### 4.1 Auto‑désinvitation
- Autorisée sauf si on est le dernier propriétaire. il faut entendre suppression du lien.

### 4.2 Conflits d’édition
- Résolution simple : ordre d’arrivée (last write wins).

### 4.3 Parent + enfant partagé
- si une invitation d'un autre est fait sur un kanban qui est déjà partagé sur un parent, donc on se retrouver avec un partage parent et plus loin dans les sous kanbans on se fait inviter, on va informer le partageur que cette personne a déjà accès à ce kanban mais on le laisse faire.
- l'invité recoit l'invitation indiquant "non nécessaire vous avez accès sur un des kanbans parent" mais on permet l'acceptation.
- sur acceptation il ne se passera rien de spécial, le kanban partagé ne va pas pop dans la kanban principal (oui les kanbans partagés apparaissent toujours dans kanban partagé, ou dans le kanban désigné, dans paramétrage il faudra mettre une option "choix du kanban qui reçoit les partages" moi je risque de me faire un kanban reception mais par défaut c'est le kanban racine qui recoit les nouveaux kanbans). Donc dans le cadre d'un partage que l'on posséde déjà par un partage parent rien ne se passe.


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
- A partagé avec {X, Y, Z, O}
- B partagé avec {X, Y, Z, M, N}
- les deux sont distincts et ne sont hiérarchiquement non lié


### Manière de faire si
- B est déplacé sous A alors (lors du déplacement on avertis l'utilisateur qui fait l'opération que certaine personne on pour partage B et tous les sous kanbans de A dont B va maintenant faire partie, on alerte mais on ne bloque pas)
	- les personnes X, Y et Z, qui avait deux entrée partagé A et B ,ils ont sans doute laissé dans le kanban de reception qu'ils ont choisit. B va donc se retrouvé dans un des sous kanban de A. il faut donc que le partage de B pour tous les participants deviennent Grisé avec l'indication que B a été déplacé sous A, on peut tout de meme cliquer dessus pour s'y rendre mais le point d'entrée B qui est partagé n'est plus déplaçable (on verra si on le fait disparaite après) pourquoi il faut griser? pour éviter qu'une personne redéplace à nouveau B dans un autre endroit de A. un point de partage est un point de partage il est géré par chacun des propriétaires, donc potentiellement on pourrait le déplace plein de fois et généré des problèmes.
	- les personnes M et N, pour eux rien ne change B reste toujours un point d'entrée du partage.
	- la personne O ne verra pas de changement non plus il y a aura juste tout B est sa hiérachie qui apparaitra dans A, mais rien d'étrange la dedans

- A est déplacé sous B alors (bon meme alerte mais on ne bloque pas)
	- X, Y et Z là on va griser A car ils ont déjà B et B contient maintenant A
	- M et N là rien pour eux ils verront apparaitre A est sa hierarchie
	- O il ne verra aussi aucun changement et tant que personne ne changera A ça sera encore moins visible

si maintenant on fait le chemin arrière (on s'est trompé ou on change d'avis?) pour le coup on retrouve la situation initiale, ce qui est grisé ne l'est plus. comment faire pour sortir un sous partage d'un partage, il suffit qu'une personne déplace en dehors du parage pour lui il sera à l'endroit ou il l'a posé (donc kanban en gardant l'icone de partage, mais il ne sera plus dans le kanban de reception, le grisé disparait et se retrouve à l'endroit ou l'on sépare les deux hiérarchis) pour les autres utilisateurs le kanban qui a été grisé redevient normal.

mais que ce passe t il si le sous partage n'est pas déplacé directement mais (imaginons A qui contient C et qui contient B) si on déplace B en dehors de A alors on vient déjà d'indiquer ce que l'on fait, mais si une personne déplace C en dehors de A il va emporter B avec lui. dans ce cas là à partir du moment ou un partage n'est plus dans un partage il n'est plus grisé pour celui qui déplace B est dans C en dehors de A, et pour les autres leur B était grisé, hop il devient normal.

donc pour faire simple si un partage est dans un partage sont point de partage initiale se grise jusqu'à ce qu'il n'y ait plus de partage au dessus de lui, donc la hiérachie définit le comportement.

donc si on A pui B, si on décide de supprimer le lien A alors l'entrée B devient normal.

---

## 6) Signalétique UI (obligatoire)

- Indiquer visuellement qu’un kanban est partagé (icone).
- Dans l’arborescence : badge “Partagé”.
- Dans le header : mention claire.
- Action “Supprimer” n'existe par, mais “Supprimer le lien” oui.


---

## 7) Journalisation (log obligatoire)

Tous ces événements doivent être logués :
- Partage initié
- Invitation acceptée/refusée
- Déplacement d’un kanban partagé
- Suppression / restauration
- Coupure de lien

Les logs doivent être visibles en haut de l’écran comme aujourd'hui

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

---

## 9) Synthèse

- Partage simple
- Copropriété totale
- Pas de droits multiples
- Soft‑delete restaurable
- Logs exhaustifs


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
- explication supplémentaire : si un kanban est partagé à deux personnes, que l'une des deux supprime le lien, alors le kanban partagé est defacto un kanban privée car il n'y a plus qu'une personne, le kanban perd l'étiquette de partage et il n'est plus possible de supprimer le lien mais il est possible de supprimer comme tout kanban privé.

6) Déplacer un kanban privé dans un partagé
- Résultat : le kanban devient partagé.
- Log : “kanban devenu partagé par héritage”.

7) Déplacer un kanban partagé hors du parent partagé
- Résultat : il disparaît pour ceux qui n’ont pas accès au nouveau parent.
- Log : “kanban déplacé hors périmètre partagé”.

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

