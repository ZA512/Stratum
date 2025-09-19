# Cahier des charges détaillé – Logiciel Kanban Fractal

## 1. Objectif général

Créer un outil de gestion de projet basé sur le principe du **Kanban fractal** :

* Toute entité (projet, tâche, sous-tâche) est un **nœud** pouvant se transformer en kanban.
* Offrir une solution **scalable** : adaptée aux petits projets personnels comme aux projets d’équipe complexes.
* Fournir une expérience **originale et disruptive**, tout en intégrant les meilleures pratiques de gestion de projet.

---

## 2. Gestion des utilisateurs et des équipes

### 2.1 Création d’utilisateur

* Identifiant unique, email, mot de passe (ou connexion via SSO).
* Profil utilisateur avec avatar, bio optionnelle, et champs personnalisés.

### 2.2 Équipes

* Une équipe peut être créée par n’importe quel utilisateur.
* Pas de notion de propriétaire unique → **gouvernance partagée**.
* Possibilité d’inviter des membres via email ou lien d’invitation sécurisé.

### 2.3 Rôles et titres

* Chaque utilisateur a un **titre global** (choisi librement basé sur un modèle RACI : Responsable, Approbateur, Consulté, Informé).
* Pour un projet/tâche donné :

  * Possibilité de redéfinir un rôle spécifique.
  * **Héritage des titres** : les rôles définis à un niveau supérieur s’appliquent par défaut aux sous-niveaux.
  * Option *ne pas hériter* pour casser la propagation.

---

## 3. Structure Kanban fractale

### 3.1 Définition des entités

* **Nœud** = unité de base (peut être une tâche simple,  une tâche moyenne, ou Tâche complexe).
* Un projet est donc une tâche de niveau supérieur qui peut être dépliée en kanban. donc l'ensemble des projets sont de base placé dans un kanban par défaut un kanban apparait avec Backlog, En cours, Bloqué, Terminé.
mais c'est modifiable dans les paramétres, c'est juste l'état de base à la création d'un kanban.

### 3.2 Types de tâches

* **Tâche simple** : nom, description, assignation, dates, commentaires.
* **Tâche moyenne** : tâche avec la possibilité de gérer dans la tache une todo list toute simple, si on prend une tache simple et que l'on rajoute une todo ça devient une tache moyenne. dans sa forme tache dans le kanban on peut voir (1/5) en bas à droite, ce qui indique qu'il y a 1 tâche faite sur 5.
* **Tâche complexe** : tâche transformée en sous-kanban complet. si on prend une tache simple et que dedans on choisit de la transformer en tache complexe ça devient un sous-kanban complet. dans sa forme tache dans le kanban on verra s'il y a 4 colonnes [1|0|2|5] ce qui indique 1 tache en colonne 1, 2 en colonne 3 et 5 en colonne 4. visuellement on voit le type de tache que l'on peut avoir.

il est possible de lié des tâches entre elle, c'est pour faire du gantt donc on indique lorsqu'une tache dépend de la fin d'une autre.




### 3.3 Affichage dans un kanban

* Tâche simple → carte simple.
* Tâche moyenne → carte avec indicateur de progression (ex. 1/5 sous-tâches faites).
* Tâche complexe → carte avec indicateur de progression [1|0|2|5] en cliquant dessus (permet de zoomer dedans).

### 3.4 Déplacement entre kanbans

* Une tâche peut être déplacée d’un kanban à un autre. il faut donc un module pour le déplacement
* Interdiction de déplacer une tâche dans son propre sous-kanban (prévention de boucle).

---

## 4. Colonnes et comportements

### 4.1 Création de colonnes

* Nom libre il est possible à tout moment de changer les noms.
* Association à un **type de comportement** (Backlog, En cours, Bloqué, Terminé). on peut donc avoir deux colonnes backlog style "log Métier" et "log Technique", tous les deux ont le status backlog et hériterons du comportement backlog comme expliqué plus bas, je n'ai pas encore tous les comportements, mais tu peux en proposer.
* Chaque comportement pourra avoir des actions prédéfinies (ex. rappel auto pour *Bloqué*).

### 4.2 Gestion du backlog

* Tâches en backlog expirent après X jours (paramétrable).
* Mécanisme de revalidation : l’utilisateur peut cliquer “Toujours d’actualité”. si pas de validation avant les X jours alors ça part en archive, ça force à faire du tri dans le temps.
* Code couleur pour anticiper l’expiration :

  * Orange = 7 jours avant archive.
  * Rouge = dernier jour ouvré avant archive.
* Tâches archivées récupérables dans une vue dédiée.

### 4.3 Statut Bloqué

* Comportement spécial : rappel automatique après X jours (paramétrable globalement et par tâche).
* Indication de la **cause du blocage** (Attente métier, Attente technique, Attente décision, etc.).
* choix de qui rappeller sans rien c'est le proprio, sinon il est possible de mettre le responsable métier qui bloque ça évite de gére la relance soit meme.

### 4.4 Dépendances

* Une tâche peut dépendre d’une ou plusieurs autres.
* Auto-vérification : impossible de passer une tâche en “Terminé” si ses prérequis ne le sont pas (toutes les checkbox todo non coché, tout le sous kanban pas dans une colonne au comportement Terminé ou si cette tâche dépend d'une tache qui doit être faite avant mais qui n'est pas indiqué comme terminé).
* Indicateur visuel (icône + survol = highlight des dépendances amont/aval). les taches en amont on un liseret d'une couleur et celle en aval une autre, ça permet de voir ce qui bloque et que l'on bloque.

---

## 5. Gestion des tâches

### 5.1 Informations de base

* Nom.
* Description.
* Assignés (1 ou plusieurs utilisateurs).
* Dates (début, fin, échéance).
* Priorité (optionnelle).
* Tags libres.

### 5.2 Commentaires

* Fil de discussion avec :

  * Nom de l’auteur, date, heure.
  * Texte enrichi (markdown basique).
  * Mentions @utilisateur.
  * Upload de fichiers/images.
  * Checklist inline.
  * dans paramétrage on indique si chaque commentaire envoie un mail au personne lié à la tache, mais si on cite un nom @Matthieu et bien un mail sera envoyé à minima à cette personne, mais il doit être possible d'idiquer @AllProject limité au kanban ou @All envoyer à tous les personnes de l'équipe

### 5.3 Templates de tâches

* Module dédié à la gestion des templates.
* Possibilité de créer, modifier, supprimer.
* Reset vers templates de base (ex. “Bug”, “Tâche simple”, “Feature”).

---

## 6. Navigation et vues

### 6.1 Breadcrumbs

* Affichage du chemin hiérarchique (projet > sous-tâche > sous-sous-tâche). voir explication plus bas
* Navigation fluide entre niveaux.

### 6.2 Modes de vue

* Kanban.
* Liste.
* Calendrier.
* Gantt / timeline avec dépendances visibles.

### 6.3 Filtres et recherche

* Filtrage par : personne, tag, échéance, statut.
* Recherche dynamique (affiche les tâches correspondantes au fur et à mesure de la saisie).
* Mode focus personnel : afficher uniquement ses propres tâches.

---

## 7. Automatisation

### 7.1 Règles de base

* Si une tâche passe en *Terminé* → notifier l’équipe.
* Si une tâche reste > X jours en *Bloqué* → relancer responsable.
* Si deadline atteinte → bascule automatique de statut.
* on propose des règles de base mais on laisse la possibilité de les désactiver ou de modifier les paramètres ou d'ajouter des règles.

### 7.2 Portée des règles

* Les règles s’appliquent au **projet maître**.


### 7.3 Paramétrage

* Module centralisé de configuration des règles.
* Interface simple (si condition X alors action Y).

---

## 8. Alertes et focus

* Bouton d’alerte pour visualiser uniquement les **tâches orphelines** (non assignées). visible uniquement s'il y a des orphelines sinon non visible
* Indicateurs de charge : surbrillance des tâches proches de la deadline.
* Possibilité de trier automatiquement par urgence.

---

## 9. Suivi & analytique

* **Tableau de bord** global :

  * Burndown chart.
  * Nombre de tâches par statut.
  * Temps moyen en Bloqué.
* **Filtres croisés** : par utilisateur, par équipe, par tag.
* **Vue consolidée multi-projets** (vision portefeuille).

---

## 10. Fonctionnalités classiques Kanban (à ne pas oublier)

* Drag & drop des tâches entre colonnes.
* Historique des actions (qui a déplacé quoi, quand). visible depuis la tache ou depuis le kanban qu'importe le niveau.
* Notifications (email, push, in-app).
* Export / import (CSV, JSON, PDF).
* API pour intégration tierce (Slack, Teams, etc.).

---

## 11. Paramétrages globaux

* Durée avant archive (backlog).
* Durée avant rappel (bloqué).
* Couleurs par comportement de colonne.
* Droits d’accès (lecture seule, édition, admin).

---




## Principe du breadcrumb hiérarchique visuel (voir l'image kanban.drawio.png, l'image est juste une représentation de la partie breadcrumb)

Le système de navigation doit permettre de toujours savoir **où l’on se situe** dans la hiérarchie fractale des projets/tâches, même si plusieurs entités portent le même nom.

### Fonctionnement

1. **Affichage en couches imbriquées**
    
    - Chaque fois qu’on entre dans un sous-kanban (tâche transformée en projet), une nouvelle “couche” est ajoutée visuellement au breadcrumb.
        
    - Les couches sont représentées sous forme de **bandes colorées fines**, empilées dans le coin supérieur gauche de l’écran.
        
    - La bande la plus extérieure correspond au niveau racine (projet principal), et chaque niveau d’imbrication ajoute une nouvelle bande vers l’intérieur.
        
2. **Indication de contexte**
    
    - Chaque bande affiche le **nom de l’élément** (Projet ou Tâche) correspondant.
        
    - Cela permet de distinguer deux tâches qui ont le même nom, car elles seront associées à des chemins différents (ex. _Projet B > Tâche 1 > Tâche 2_).
        
3. **Navigation**
    
    - Cliquer sur une bande permet de **remonter directement** au niveau correspondant.
        
    - Exemple : si on est dans _Projet B > Tâche 1 > Tâche 2_, cliquer sur _Projet B_ ramène directement au kanban de Projet B.
        
4. **Lisibilité et finesse**
    
    - L’effet doit être **discret et fin** (pas de grandes zones comme dans le schéma d’illustration).
        
    - Le but est d’indiquer la profondeur et le chemin, sans prendre trop d’espace à l’écran.
        
5. **Cas pratiques**
    
    - **Tâches homonymes** : si deux tâches portent le même nom (_Tâche 1_), on évite la confusion grâce au breadcrumb qui indique le chemin complet (_Projet B > Tâche 1_ vs _Projet C > Tâche 1_).
        
    - **Navigation fluide** : l’utilisateur comprend visuellement qu’il “s’enfonce” dans les sous-niveaux et peut revenir à tout moment à un niveau supérieur.
        

---

👉 En résumé : le breadcrumb n’est pas une simple suite de textes horizontaux, mais une **piste visuelle en couches imbriquées** qui donne un repère spatial et hiérarchique, permettant de s’orienter facilement dans un système fractal de projets/tâches imbriqués.




**information complémentaire sur le projet**

- **Mode API-first** :
    
    - Backend = NestJS (TypeScript) avec PostgreSQL + Prisma, Redis + BullMQ pour jobs, Socket.IO pour temps réel.
        
    - Frontend (Next.js/React) consomme uniquement l’API → même modèle valable pour une future app mobile.
        
- **Kanban fractal** :
    
    - Tout est un nœud (tâche/projet) qui peut devenir un sous-kanban.
        
    - Navigation par breadcrumb en couches, effet visuel clair pour montrer la descente/remontée dans les niveaux.
        
- **Effets visuels & UX** :
    
    - Transitions descendantes/remontantes fluides (Framer Motion).
        
    - Drag & drop élégant (dnd-kit).
        
    - Beaucoup d’AJAX / WebSockets → éviter boutons de validation inutiles (mutations optimistes).
        
- **Thèmes personnalisables** :
    
    - Mode clair/sombre natif.
        
    - Thèmes import/export via fichier JSON (palette couleurs, variables CSS).
        
    - Live preview et persistance par utilisateur ou équipe.
        
- **Automatisation simple** :
    
    - Règles sur les nœuds (ex : si “Bloqué” > X jours → relancer responsable).
        
    - Module générique pour ajouter d’autres règles plus tard.
        
- **Exports** : CSV/JSON pour tâches, templates, thèmes.
    
- **Sécurité** : JWT (via Passport/OIDC), RBAC par héritage de rôle/titre.
    
- **Infra** : Docker + Caddy + GitHub Actions, Sentry pour logs.