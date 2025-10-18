# Auto-Refresh Optimisé du Kanban

## 🎯 Objectif

Synchroniser automatiquement les boards entre utilisateurs sans WebSocket, en utilisant un polling intelligent et optimisé.

## 📊 Architecture

### Composants

1. **Hook Frontend** : `useAutoRefreshBoard.ts`
2. **API Client** : `boards-api.ts` (support ETag)
3. **Backend Controller** : `boards.controller.ts` (génération ETag)
4. **Provider** : `board-data-provider.tsx` (gestion cache)

### Flux de Données

```
[BoardPageShell] 
    ↓ (toutes les 15 sec si onglet visible)
[useAutoRefreshBoard Hook]
    ↓ appelle
[refreshActiveBoard()]
    ↓ appelle
[fetchBoardDetail(boardId, accessToken)]
    ↓ envoie requête avec ETag
[GET /boards/:id/detail]
    ↓ Headers: If-None-Match: "abc123"
[BoardsController]
    ↓ génère hash MD5 du board
    ↓ compare avec ETag client
    ↓ SI identique → 304 Not Modified (~100 bytes)
    ↓ SI différent → 200 OK + données + nouvel ETag
[fetchBoardDetail()]
    ↓ SI 304 → retourne null (pas de màj)
    ↓ SI 200 → retourne Board
[loadBoardBundle()]
    ↓ SI null → ne rien faire (optimisation)
    ↓ SI Board → mettre à jour state
```

## ✅ Optimisations Implémentées

### 1. **Détection de Visibilité de l'Onglet**

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Onglet actif → démarrer polling
    // Si >15 sec depuis dernier refresh → refresh immédiat
  } else {
    // Onglet inactif → ARRÊTER polling (économie ressources)
  }
});
```

**Gains :**
- ✅ Pas de requêtes si l'utilisateur est sur un autre onglet
- ✅ Économie CPU, batterie, bande passante
- ✅ Refresh discret au retour sur l'onglet

### 2. **ETag / If-None-Match (HTTP 304)**

```typescript
// Client envoie
Headers: { 'If-None-Match': '"abc123"' }

// Serveur répond
304 Not Modified (si inchangé) → ~100 bytes, pas de body
200 OK + ETag: "xyz789" (si changé) → données complètes
```

**Gains :**
- ✅ 99% du temps : 304 Not Modified (100 bytes vs 50 KB)
- ✅ Bande passante réduite de ~500x
- ✅ Parsing JSON évité côté client

### 3. **Cache Local avec Map**

```typescript
const etagCache = new Map<string, string>();
// Stocke l'ETag par boardId pour réutilisation
```

**Gains :**
- ✅ ETag persisté entre requêtes
- ✅ Pas besoin de recalculer côté client

### 4. **Protection Anti-Concurrence**

```typescript
const isRefreshingRef = useRef<boolean>(false);

if (isRefreshingRef.current) return; // Éviter 2 refresh simultanés
```

**Gains :**
- ✅ Pas de requêtes dupliquées si timer déclenche pendant un refresh en cours

## 📈 Performance Estimée

### Sans Optimisations (Polling Naïf)
- **Requêtes** : Toutes les 15 sec, même si onglet inactif
- **Données** : ~50 KB par requête (JSON complet)
- **Par heure** : 240 requêtes × 50 KB = **12 MB/h**
- **CPU** : Parsing JSON constant

### Avec Optimisations (Implémentation Actuelle)
- **Requêtes** : Seulement si onglet visible
- **Données** : 99% du temps = 304 (100 bytes)
- **Par heure** : 240 requêtes × 0.1 KB = **24 KB/h** (si pas de changement)
- **CPU** : Parsing JSON seulement si changement réel

**Gain : ~500x moins de bande passante**

## 🛠️ Configuration

### Interval de Polling

```typescript
useAutoRefreshBoard({
  intervalMs: 15000, // 15 secondes (configurable)
  onRefresh: refreshActiveBoard,
  enabled: true,
  boardId: activeBoardId,
});
```

**Recommandation** : 15 secondes est optimal pour un kanban collaboratif.
- Trop court (< 5 sec) : surcharge serveur
- Trop long (> 30 sec) : expérience dégradée

### Désactivation

```typescript
useAutoRefreshBoard({
  enabled: false, // Désactive complètement le polling
  // ...
});
```

## 🧪 Tests

### Scénarios à Valider

1. ✅ **Alice déplace une tâche** → Bob voit le changement en <15 sec
2. ✅ **Bob change d'onglet** → Polling s'arrête
3. ✅ **Bob revient après 30 sec** → Refresh immédiat et discret
4. ✅ **Aucun changement pendant 5 min** → Toutes les requêtes sont 304
5. ✅ **Alice crée une tâche** → Bob reçoit 200 OK avec nouvelle tâche
6. ✅ **Réseau lent/erreur** → Pas de crash, erreur silencieuse

### Métriques à Monitorer

- **Taux de 304 vs 200** : devrait être >95% de 304 en production
- **Bande passante moyenne par utilisateur** : <1 MB/h attendu
- **Latence de synchronisation** : <15 sec garanti, <5 sec en moyenne

## 🚀 Évolution Future : WebSocket

Si le polling devient limitant (collaboration intensive, >10 users simultanés par board) :

### Migration Progressive

1. **Garder le polling comme fallback**
2. **Ajouter Socket.IO** pour events temps réel
3. **Détection automatique** : WebSocket si disponible, sinon polling

### Avantages WebSocket

- ⚡ Latence < 100ms (vs 15 sec polling)
- 🎯 Push seulement si changement (vs requêtes périodiques)
- 🔔 Notifications live, curseurs, présence utilisateurs

### Coût WebSocket

- 🔧 Complexité backend (+3 jours dev)
- 🏗️ Infrastructure (Redis pour multi-instance)
- 🐛 Debugging plus difficile

**Décision** : Rester sur polling tant que <10 users simultanés par board.

## 📝 Notes Techniques

### Pourquoi MD5 pour ETag ?

MD5 est suffisant pour un ETag (pas de besoin cryptographique). Alternatives :
- SHA-256 : plus sûr mais overkill
- Timestamp : moins fiable (même timestamp ≠ même contenu)

### Cache-Control: no-cache

Force le navigateur à toujours valider avec le serveur (ETag check). Sans ça, le navigateur pourrait servir une version obsolète du cache.

### AbortController (Future)

Pour annuler les requêtes en vol si l'utilisateur change de board rapidement :

```typescript
const controller = new AbortController();
fetch(url, { signal: controller.signal });
// ...
controller.abort(); // Annule la requête
```

## 🔍 Debugging

### Vérifier ETag dans Network Tab

1. Ouvrir DevTools → Network
2. Chercher `/boards/:id/detail`
3. Vérifier headers :
   - Request : `If-None-Match: "abc123"`
   - Response : `ETag: "xyz789"` ou `304 Not Modified`

### Logs Console

```typescript
// Activer les logs debug
console.debug('Auto-refresh board error:', error);
```

### Désactiver temporairement

```typescript
// Dans BoardPageShell.tsx
useAutoRefreshBoard({
  enabled: false, // <-- Mettre à false
  // ...
});
```

## 📚 Références

- [HTTP ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
- [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [HTTP 304 Not Modified](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/304)
