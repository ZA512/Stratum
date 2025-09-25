# Optimistic Mini-Kanban (Phase B)

## Contexte
Le drawer de détail d'un node affiche maintenant un mini-kanban fractal de ses sous‑tâches (children). On veut une sensation "instantanée" pour les opérations CRUD + mouvement visuel sans attendre la latence réseau.

## Objectifs
- Latence perçue quasi nulle pour: création, édition de titre, toggle done, reorder intra‑colonne, déplacement inter‑colonnes.
- Cohérence visuelle même en cas d'échec (rollback propre et explicite).
- Réduction drastique des re-fetch (éviter `refresh()` après chaque succès).
- Base extensible vers batching, drift detection, offline queue.

## Modèle d'état
```
optimisticChildren: Child[]          // source de vérité UI locale
snapshotStackRef: Child[][]          // pile (<=5) pour rollback multi-step
pendingRef: number                   // compteur d'actions réseau en vol
isDirty: boolean                     // indique divergence temporaire avec detail.children initial
columnOrders: Record<columnId,string[]> // ordres par colonne pour reorder granular
localCounts: { backlog,inProgress,blocked,done } // dérivé de optimisticChildren
```

### Règles
1. Avant chaque mutation locale: `pushSnapshot()` + `setIsDirty(true)`.
2. Empêcher actions concurrentes si `hasPending()` (guard simple).
3. Appliquer mutation localement (children + columnOrders + counts recalculés).
4. Lancer requête API correspondante.
5. Succès: `setIsDirty(false)` si l'état n'a pas changé de base (ou conserver dirty si d'autres mutations en file, futur batching).
6. Échec: `rollback()` + toast d'erreur.

## Actions couvertes
| Action | Mutation locale | API | Refresh global ? | Remarques |
|--------|------------------|-----|------------------|-----------|
| Create | Placeholder (id tmp) append colonne backlog | POST /children | Non (fusion réponse) | Remplace liste locale par `response.children` |
| Edit titre | Changer `title` direct | PATCH child | Non | Rollback sur erreur |
| Toggle done | Retirer de colonne A, append colonne cible (DONE ou BACKLOG) + maj behaviorKey | POST toggle-done | Non | Counts mis à jour via deriveCounts |
| Reorder intra | Réordonne ordre local + réinjection sélective dans optimisticChildren | POST /reorder | Non (debounce) | Debounce 350ms |
| Move inter | Retirer de A, append B (ordre fin) | POST /move | Non | Position append, pourrait devenir drop target index |

## deriveCounts
Parcours linéaire de `optimisticChildren` (O(n) faible). Pas de structure secondaire pour l'instant (simplicité > micro-optimisation).

## Rollback
- `snapshotStackRef.pop()` restaure l'état exact (children + orders implicites car reconstruits à partir de children lors des effets, ou conservés si nécessaire avant).
- Limite de pile 5 pour éviter accumulation mémoire.

## Concurrence
`pendingRef` incrémenté au départ d'une requête, décrémenté en `finally`. `hasPending()` bloque de nouvelles actions mutatives afin d'éviter l'entrelacement difficile à résoudre (pas encore de merge algorithmique multi-step).

## UI Feedback
- Badge "Sync…" tant que `hasPending()`.
- Toast d'erreur repliable en bas à droite sur rollback.

## Décisions importantes
- Pas de re-fetch systématique: on fait confiance à l'état local.
- Create fusionne le retour serveur (garantit ID réel et cohérence si le backend injecte d'autres champs).
- Reorder side-effect local + envoi différé (debounce) pour réduire trafic.

## Limites actuelles
- Pas de drift detection (autres clients peuvent modifier en parallèle sans auto-sync immédiat).
- Pas de batching multi-actions (deux toggles rapides -> deux requêtes). 
- Undo utilisateur explicite absent (rollback seulement sur erreur).
- Drag inter-colonnes toujours append en bas (pas d'insertion sur position exacte via hover dynamique).
- Accessibilité clavier pour DnD non implémentée.

## Roadmap Phase C
1. Batching Reorder & Mutations: regrouper plusieurs intentions sur fenêtre (ex 500ms) avant envoi.
2. Drift Detection: endpoint version/hash; si divergence, micro-sync partielle.
3. Undo explicite: pile d'actions success (en plus des snapshots) + bouton annuler.
4. WIP Limits: ajouter champ `limit` aux colonnes + refus visuel (shake + toast) si plein.
5. Offline / Retry Queue: sérialiser mutations dans localStorage si `fetch` réseau échoue (mode offline).
6. Drop Position Inter-Colonne précis: calcul index destination (ex insertion entre items selon Y offset).
7. A11y: mode reorder clavier (Entrée pour saisir, flèches pour déplacer, Entrée pour confirmer).
8. Tests E2E: scénarios toggle success/échec, reorder rollback, create placeholder, move cross-colonnes.

## Extensions Techniques Futures
- Optimistic conflict resolution: CRDT simplifié (liste ordonnée par paires (id, logicalClock)).
- Sécurité: inclure et vérifier une `etag` (ou version) lors des patchs pour rejeter updates sur version obsolète (optimistic concurrency backend).
- Télémetrie UX: mesurer temps moyen entre action et ack pour calibrer animations.

## Bonnes pratiques adoptées
- Isolation logique (toutes les mutations passent par un chemin unifié: snapshot -> mutate -> API -> settle).
- Limitation effets réseau (debounce + suppression refresh).
- Simplicité première (pas de sur‑ingénierie CRDT tant que besoin concurrency faible).

## Points de vigilance
- Si la pile snapshots se vide (5 actions rapides sans ack) et qu'une action échoue, on ne rollback pas une cascade antérieure. Batching réduira ce risque.
- Si une mutation serveur applique une règle business supplémentaire (ex: auto-move sur statut), l'état local peut diverger. Nécessitera une micro-sync sélective ou un diff patché dans la réponse.

---
**Statut Phase B**: TERMINÉ (MVP stable). 
Prochaine étape recommandée: choisir 2 items Roadmap (ex: position drop inter-colonne + drift detection simple) pour Phase C.
