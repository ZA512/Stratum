# DevBook – Vue Gantt

## Objet
Préparer l’itération de refonte de la vue Gantt pour le board Stratum, en combinant vision UX/UI et cadrage technique (frontend + backend) tout en préservant la montée en puissance vers une V2 multi-niveaux.

## Hypothèses validées avec le produit
- Le Gantt reste une surcouche légère au Kanban : les tâches et métadonnées continuent de vivre dans les API existantes.
- Les dépendances et dates doivent persister côté backend pour survivre aux rafraîchissements et synchroniser plusieurs clients.
- Identification de colonne via un liseré coloré sur la barre (haut ou bas) ; pas besoin du nom de colonne en permanence.
- Menu contextuel V1 centré sur la planification (dates, durée, dépendances, réalignement). Les autres actions pourront arriver plus tard.
- V2 envisagée : prise en charge de sous-kanbans (tasks possédant un board enfant) et enrichissement du zoom/détails.

## Risques et mesures
- **Incohérences de persistance** : si la sauvegarde temps réel échoue, les utilisateurs perdent leur travail. → Propager les erreurs toast + maintenir undo/redo local.
- **Boucles de dépendances** : peuvent bloquer le recalcul ASAP. → Détection front (topological sort) et message explicite, validation côté backend à ajouter.
- **Performances** : placement dynamique des tâches sur plusieurs lignes peut coûter cher. → Profiling sur datasets >200 tâches, mémoïsation et algorithme `interval scheduling` simple.
- **Accessibilité** : couleur seule insuffisante. → Couplage avec tooltip + pattern dashed pour liens FREE.

## Découpage de l’itération
1. **Infrastructure & persistance**
   - Étendre `BoardDataProvider` pour consommer `board.dependencies` depuis l’API.
   - Enrichir `updateNode` afin d’envoyer `scheduleMode`, `hardConstraint`, `scheduleDependencies`.
   - Mettre à jour l’API backend (DTO + service) pour accepter ces champs et renvoyer la liste de dépendances.

2. **Refonte layout et lanes**
   - Calcul des rangées par chevauchement temporel (algorithme sweep line).
   - Ajout du liseré de couleur et fallback tooltip colonne.
   - Gestion dynamique du nombre de lignes (auto, plus/minus).

3. **Interactions tâches**
   - Poignées dédiées au drag et resize, largeur minimale lisible pour un jour.
   - Hover tooltip avec dates, durée, progression.
   - Menu contextuel (planification uniquement) + raccourcis clavier.

4. **Dépendances**
   - Poignées circulaires en extrémité de barre pour créer un lien.
   - UI de la flèche avec badge type (FS/SS/FF/SF) + mode (ASAP ⚡ / FREE ◦).
   - Alignement ASAP avec topological sort, propagation descendants.

5. **Zoom & visibilité**
   - Zoom jour/semaine/mois (étendre à trimestre si faisable) avec densité d’icônes dépendant de la largeur disponible.
   - Mode 1 jour rendu lisible (label compact, halo).

6. **Tests & observabilité**
   - Tests unitaires front sur algorithme de placement et ASAP.
   - Tests e2e ciblés pour création dépendance + rechargement.
   - Instrumentation logs front (console.debug conditionnelle) à retirer en prod.

## Checklist sécurité / qualité
- Pas de stockage de secrets dans le frontend : dépendances et flags via API.
- Validation forte côté backend des dépendances reçues (IDs existants, absence de cycles si possible).
- Inputs durées/lag bornés (±365 jours) pour éviter overflow.
- Undo/redo conservé en mémoire avec limite raisonnable.
- Respect des instructions OWASP (sérialisation JSON safe, pas d’`innerHTML`).

## Suivi
- Responsable : GitHub Copilot (GPT-5-Codex Preview).
- Date de début : 20/10/2025.
- Dernière mise à jour : 20/10/2025.
