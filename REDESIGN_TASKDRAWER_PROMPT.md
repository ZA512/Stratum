# PROMPT POUR REDESIGN TASKDRAWER

## CONTEXTE DU PROJET

Je travaille sur une application Kanban (NestJS backend + Next.js frontend). J'ai demandé un redesign complet du composant `TaskDrawer.tsx` pour améliorer la lisibilité avec des sections visuellement encadrées, des icônes émojis, et une meilleure hiérarchie de l'information.

## CE QUI A ÉTÉ FAIT

### 1. ✅ Backend complet
Migration Prisma ajoutée avec 3 nouveaux champs pour le système de blocage amélioré :
- `blockedReason` (Text nullable) : Description de ce qui est attendu pour débloquer
- `blockedSince` (DateTime nullable) : Date d'entrée en blocage
- `isBlockResolved` (Boolean default false) : Flag pour arrêter les relances automatiques

### 2. ✅ Backend DTOs et validation
- `UpdateNodeDto` et `NodeDto` mis à jour avec les 3 nouveaux champs
- Validation complète dans `nodes.service.ts`
- Migration appliquée avec succès

### 3. ✅ Champs existants déjà présents dans la DB
- `blockedReminderEmails` (String[])
- `blockedReminderIntervalDays` (Int nullable)
- `blockedExpectedUnblockAt` (DateTime nullable)

## CE QUI RESTE À FAIRE

Le fichier `TaskDrawer.tsx` (1346 lignes) doit être redesigné avec **5 onglets** au lieu de 3.

### Structure actuelle (3 onglets)
- Détails (tout mélangé)
- Collaborateurs
- Temps & coût (expert mode)

### Structure cible (5 onglets avec hiérarchie visuelle claire)

#### 1. 📋 Détails
- **Section Description (📝)** : textarea encadré
- **Section Sous-tâches (🎯)** : `<ChildTasksSection />` existant
- **Section Progression (📊)** : range slider + number input

#### 2. 📅 Planning
- **Section Planification (📅)** : 3 colonnes (Échéance 📆, Priorité ⚡, Effort ⏱️)
- **Section Tags (🏷️)** : chips + input
- **Section Blocage (🚫)** : NOUVEAU DESIGN avec :
  - Textarea "Qu'est-ce qui est attendu ?" (📝) → `blockedReason`
  - Chips emails (📧) → array `blockedEmails` (nouveau state local)
  - Input email avec validation + Enter pour ajouter
  - Select relance (⏰) : Jamais/1j/2j/3j/5j/7j/14j → `blockedInterval`
  - Input date estimée (📅) → `blockedEta`
  - Display readonly "Bloqué depuis" si `blockedSince` existe
  - Checkbox "Blocage résolu" (✅) → `isBlockResolved` (nouveau state local)
  - **⚠️ CONDITIONNEL** : Afficher seulement si `currentCol.behaviorKey === 'BLOCKED'`

#### 3. 👥 RACI (nouveau, séparé de Détails)
4 sections encadrées individuellement avec couleurs différentes :
- **Responsable 👤** (bleu) : `rResponsible`
- **Approbateur 🎯** (vert) : `rAccountable`
- **Consulté 💬** (violet) : `rConsulted`
- **Informé 📢** (orange) : `rInformed`

Chaque section : border coloré, bg subtil, icône, description explicative.
Utilise `<MemberMultiSelect />` existant (déjà dans le fichier).

#### 4. 🤝 Accès (renommer "Collaborateurs")
Sections encadrées avec icônes :
- Gestion des accès (🤝)
- Ajouter collaborateur (➕)
- Liste collaborateurs (👥)
- Invitations en attente (📧)

#### 5. ⏱️ Temps (expert mode, renommer "Temps & coût")
- **Section Temps et effort (⏱️)** : encadrée
- **Section Coûts et budgets (💰)** : encadrée

## ÉTATS REACT À AJOUTER

```typescript
// Nouveaux états pour blocage amélioré
const [blockedReason, setBlockedReason] = useState('');
const [blockedEmails, setBlockedEmails] = useState<string[]>([]);
const [blockedEmailInput, setBlockedEmailInput] = useState('');
const [blockedSince, setBlockedSince] = useState<string | null>(null);
const [isBlockResolved, setIsBlockResolved] = useState(false);

// Modifier le type activeTab
const [activeTab, setActiveTab] = useState<'details' | 'planning' | 'raci' | 'collaborators' | 'time'>('details');
```

## SYNCHRONISATION API

### Dans useEffect de sync avec detail

```typescript
// Ajouter ces lignes
setBlockedReason((detail as any).blockedReason || '');
setBlockedEmails((detail as any).blockedReminderEmails || []);
setBlockedSince((detail as any).blockedSince || null);
setIsBlockResolved((detail as any).isBlockResolved || false);
```

### Dans hasDirty

```typescript
// Ajouter comparaison arrays avec JSON.stringify
if (JSON.stringify([...blockedEmails].sort()) !== JSON.stringify([...(detail?.blockedReminderEmails || [])].sort())) {
  return true;
}
if (blockedReason !== ((detail as any).blockedReason || '')) return true;
if (isBlockResolved !== ((detail as any).isBlockResolved || false)) return true;
```

### Dans onSave payload

```typescript
(payload as any).blockedReason = blockedReason.trim() || null;
(payload as any).blockedReminderEmails = blockedEmails;
(payload as any).isBlockResolved = isBlockResolved;
// Le backend set automatiquement blockedSince quand colonne = BLOCKED
```

### Dans reset (quand detail devient null)

```typescript
setBlockedReason('');
setBlockedEmails([]);
setBlockedEmailInput('');
setBlockedSince(null);
setIsBlockResolved(false);
```

## PATTERN VISUEL

Toutes les sections importantes doivent avoir ce pattern :

```tsx
<section className="space-y-3 rounded-lg border border-white/10 bg-slate-500/5 p-4 shadow-sm">
  <div className="flex items-center gap-2">
    <span className="text-lg">🚫</span>
    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
      Blocage
    </h3>
  </div>
  {/* contenu */}
</section>
```

### Pour les sections RACI avec couleurs

```tsx
{/* Responsable (bleu) */}
<div className="space-y-3 rounded-lg border border-blue-200 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-950/20 p-3">
  <div className="flex items-center gap-2">
    <span className="text-base">👤</span>
    <span className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
      Responsable (R)
    </span>
  </div>
  <MemberMultiSelect
    label=""
    members={teamMembers}
    selectedIds={rResponsible}
    onChange={setRResponsible}
    disabled={saving}
  />
  <p className="text-[10px] text-blue-600 dark:text-blue-400">
    Personne(s) qui réalise(nt) la tâche
  </p>
</div>

{/* Approbateur (vert) */}
<div className="space-y-3 rounded-lg border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/20 p-3">
  <div className="flex items-center gap-2">
    <span className="text-base">🎯</span>
    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
      Approbateur (A)
    </span>
  </div>
  <MemberMultiSelect
    label=""
    members={teamMembers}
    selectedIds={rAccountable}
    onChange={setRAccountable}
    disabled={saving}
  />
  <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
    Personne qui valide le résultat
  </p>
</div>

{/* Consulté (violet) */}
<div className="space-y-3 rounded-lg border border-purple-200 dark:border-purple-900/30 bg-purple-50 dark:bg-purple-950/20 p-3">
  <div className="flex items-center gap-2">
    <span className="text-base">💬</span>
    <span className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
      Consulté (C)
    </span>
  </div>
  <MemberMultiSelect
    label=""
    members={teamMembers}
    selectedIds={rConsulted}
    onChange={setRConsulted}
    disabled={saving}
  />
  <p className="text-[10px] text-purple-600 dark:text-purple-400">
    Personne(s) consultée(s) avant décision
  </p>
</div>

{/* Informé (orange) */}
<div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 p-3">
  <div className="flex items-center gap-2">
    <span className="text-base">📢</span>
    <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
      Informé (I)
    </span>
  </div>
  <MemberMultiSelect
    label=""
    members={teamMembers}
    selectedIds={rInformed}
    onChange={setRInformed}
    disabled={saving}
  />
  <p className="text-[10px] text-amber-600 dark:text-amber-400">
    Personne(s) tenue(s) informée(s) du résultat
  </p>
</div>
```

### Section Blocage complète

```tsx
{detail.board && detail.board.columns && (()=>{
  const currentCol = detail.board.columns.find(c=>c.id===detail.columnId);
  const isBlocked = currentCol?.behaviorKey === 'BLOCKED';
  if(!isBlocked) return null;
  
  return (
    <section className="space-y-4 rounded-lg border border-white/10 bg-slate-500/5 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg">🚫</span>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
          Blocage
        </h3>
      </div>
      
      <label className="block text-xs text-slate-500 dark:text-slate-400">
        <span className="mb-1 flex items-center gap-1.5">
          <span className="text-base">📝</span>
          Qu'est-ce qui est attendu ?
        </span>
        <textarea
          value={blockedReason}
          onChange={e=>setBlockedReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
          placeholder="Décrivez ce qui est attendu pour débloquer cette tâche..."
          disabled={saving}
        />
      </label>

      <div className="space-y-2">
        <label className="block text-xs text-slate-500 dark:text-slate-400">
          <span className="mb-1 flex items-center gap-1.5">
            <span className="text-base">📧</span>
            Email(s) du/des bloqueur(s)
          </span>
          <div className="space-y-2">
            {blockedEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {blockedEmails.map((email, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-0.5 text-xs text-emerald-800 dark:text-emerald-200">
                    {email}
                    <button 
                      type="button" 
                      onClick={() => setBlockedEmails(blockedEmails.filter((_, i) => i !== idx))} 
                      className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200" 
                      disabled={saving}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="email"
              value={blockedEmailInput}
              onChange={e=>setBlockedEmailInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const email = blockedEmailInput.trim().toLowerCase();
                  if (email && /.+@.+\..+/.test(email) && !blockedEmails.includes(email)) {
                    setBlockedEmails([...blockedEmails, email]);
                    setBlockedEmailInput('');
                  }
                }
              }}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
              placeholder="ajouter@exemple.com (Entrée pour ajouter)"
              disabled={saving}
            />
          </div>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="text-base">⏰</span>
            Relance automatique
          </span>
          <select
            value={blockedInterval}
            onChange={e=>setBlockedInterval(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
            disabled={saving}
          >
            <option value="">Jamais</option>
            <option value="1">Tous les jours</option>
            <option value="2">Tous les 2 jours</option>
            <option value="3">Tous les 3 jours</option>
            <option value="5">Tous les 5 jours</option>
            <option value="7">Toutes les semaines</option>
            <option value="14">Toutes les 2 semaines</option>
          </select>
        </label>
        
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="text-base">📅</span>
            Date estimée déblocage
          </span>
          <input
            type="date"
            value={blockedEta}
            onChange={e=>setBlockedEta(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
            disabled={saving}
          />
        </label>
      </div>

      {blockedSince && (
        <p className="text-xs text-slate-500">
          📌 Bloqué depuis : <strong>{new Date(blockedSince).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</strong>
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isBlockResolved}
          onChange={e=>setIsBlockResolved(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/40"
          disabled={saving}
        />
        <span className="text-xs text-slate-600 dark:text-slate-300">
          ✅ Blocage résolu (arrête les relances automatiques)
        </span>
      </label>

      <p className="text-[11px] text-slate-500">
        💡 Les relances automatiques incluront le titre de la tâche, ce qui est attendu, et un lien vers le kanban.
      </p>
    </section>
  );
})()}
```

## APPROACH SUGGÉRÉE

Fichier trop long (1346 lignes) pour tout remplacer d'un coup. Procéder par étapes :

1. **Étape 1** : Étendre type `activeTab` à 5 valeurs + ajouter les 9 nouveaux états React
2. **Étape 2** : Modifier la navigation (5 boutons avec émojis au lieu de 3)
3. **Étape 3** : Restructurer onglet Détails avec 3 sections encadrées
4. **Étape 4** : Créer onglet Planning avec sections Planification + Tags + Blocage
5. **Étape 5** : Créer onglet RACI avec 4 sections colorées
6. **Étape 6** : Renommer et restructurer onglet Collaborateurs → Accès
7. **Étape 7** : Restructurer onglet Temps avec 2 sections encadrées

## FICHIERS CONCERNÉS

- `apps/frontend/src/features/nodes/task-drawer/TaskDrawer.tsx` (1346 lignes, **seul fichier à modifier**)
- Backend déjà OK, **ne pas toucher**

## NAVIGATION DES ONGLETS

```tsx
<div className="flex gap-2 rounded border border-white/10 bg-surface/40 p-1 text-xs">
  <button
    type="button"
    onClick={() => setActiveTab('details')}
    className={`flex-1 rounded px-3 py-2 font-medium transition ${activeTab === 'details' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
  >
    📋 Détails
  </button>
  <button
    type="button"
    onClick={() => setActiveTab('planning')}
    className={`flex-1 rounded px-3 py-2 font-medium transition ${activeTab === 'planning' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
  >
    📅 Planning
  </button>
  <button
    type="button"
    onClick={() => setActiveTab('raci')}
    className={`flex-1 rounded px-3 py-2 font-medium transition ${activeTab === 'raci' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
  >
    👥 RACI
  </button>
  <button
    type="button"
    onClick={() => setActiveTab('collaborators')}
    className={`flex-1 rounded px-3 py-2 font-medium transition ${activeTab === 'collaborators' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
  >
    🤝 Accès
  </button>
  {expertMode && (
    <button
      type="button"
      onClick={() => setActiveTab('time')}
      className={`flex-1 rounded px-3 py-2 font-medium transition ${activeTab === 'time' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
    >
      ⏱️ Temps
    </button>
  )}
</div>
```

## QUESTION POUR L'IA

Peux-tu implémenter ce redesign complet du TaskDrawer en suivant **exactement** cette spécification ? Commence par les modifications d'état et de type, puis restructure onglet par onglet en utilisant `multi_replace_string_in_file` pour optimiser les modifications.

⚠️ **IMPORTANT** : Ne pas oublier de synchroniser les nouveaux états avec l'API dans les 3 endroits (sync depuis detail, hasDirty, onSave payload, reset).
