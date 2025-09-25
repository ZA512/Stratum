"use client";
import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useTaskDrawer } from './TaskDrawerContext';
import { useTaskDetail } from './useTaskDetail';
import { ChildTasksSection } from './ChildTasksSection';
import { updateNode, type UpdateNodeInput } from '@/features/nodes/nodes-api';
import { useAuth } from '@/features/auth/auth-provider';
import { useToast } from '@/components/toast/ToastProvider';
// Icône close inline pour éviter dépendance externe
const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const panelVariants: Variants = {
  hidden: { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 28 } },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } },
};

const Skeleton: React.FC = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-6 bg-slate-300 dark:bg-slate-700 rounded w-3/4" />
    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full" />
    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
    <div className="pt-4 space-y-2">
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
    </div>
  </div>
);

export const TaskDrawer: React.FC = () => {
  const { openedNodeId, close } = useTaskDrawer();
  const { detail, loading, error, refresh } = useTaskDetail();
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();

  // Form state
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [initialSnapshot, setInitialSnapshot] = useState<{
    title: string;
    description: string | null;
    dueAt: string;
    progress: number;
    priority: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
    effort: 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;
  } | null>(null);
  type Priority = 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
  type Effort = 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;
  const [priority, setPriority] = useState<Priority>('NONE');
  const [effort, setEffort] = useState<Effort>(null);
  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  // Blocage
  const [blockedEmails, setBlockedEmails] = useState<string>('');
  const [blockedInterval, setBlockedInterval] = useState<string>('');
  const [blockedEta, setBlockedEta] = useState<string>('');

  // Sync form when detail loads or node changes
  useEffect(() => {
    if (detail) {
      const dDate = detail.dueAt ? detail.dueAt.substring(0,10) : '';
      setTitle(detail.title || '');
      setDescription(detail.description || '');
      setDueAt(dDate);
      setProgress(detail.progress ?? 0);
      setPriority(detail.priority ?? 'NONE');
      setEffort(detail.effort ?? null);
      setTags(detail.tags || []);
      // Blocage -> map values
      setBlockedEmails((detail.blockedReminderEmails||[]).join(', '));
      setBlockedInterval(detail.blockedReminderIntervalDays!=null? String(detail.blockedReminderIntervalDays):'');
      setBlockedEta(detail.blockedExpectedUnblockAt? detail.blockedExpectedUnblockAt.substring(0,10):'');
      setInitialSnapshot({
        title: detail.title||'',
        description: detail.description||null,
        dueAt: dDate,
        progress: detail.progress ?? 0,
        priority: detail.priority ?? 'NONE',
        effort: detail.effort ?? null,
      });
    } else {
      setTitle('');
      setDescription('');
      setDueAt('');
      setProgress(0);
      setPriority('NONE');
      setEffort(null);
      setTags([]);
      setBlockedEmails('');
      setBlockedInterval('');
      setBlockedEta('');
      setInitialSnapshot(null);
    }
  }, [detail]);

  const hasDirty = useMemo(()=>{
    if(!initialSnapshot) return false;
    return (
      title !== initialSnapshot.title ||
      description !== initialSnapshot.description ||
      dueAt !== initialSnapshot.dueAt ||
      progress !== initialSnapshot.progress ||
      priority !== initialSnapshot.priority ||
      (effort || null) !== (initialSnapshot.effort ?? null) ||
      // Blocage: comparer vs valeurs actuelles du detail
      blockedEmails.trim() !== (detail?.blockedReminderEmails||[]).join(', ') ||
      (blockedInterval || '') !== (detail?.blockedReminderIntervalDays!=null? String(detail.blockedReminderIntervalDays):'') ||
      (blockedEta || '') !== (detail?.blockedExpectedUnblockAt? detail.blockedExpectedUnblockAt.substring(0,10):'')
      || JSON.stringify(tags) !== JSON.stringify(detail?.tags||[])
    );
  }, [title, description, dueAt, progress, priority, effort, blockedEmails, blockedInterval, blockedEta, detail?.blockedReminderEmails, detail?.blockedReminderIntervalDays, detail?.blockedExpectedUnblockAt, initialSnapshot, tags, detail?.tags]);

  const escHandler = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (hasDirty) {
        const confirmLeave = window.confirm('Annuler les modifications ?');
        if (!confirmLeave) return;
      }
      close();
    }
  }, [close, hasDirty]);

  useEffect(() => {
    if (openedNodeId) {
      window.addEventListener('keydown', escHandler);
      return () => window.removeEventListener('keydown', escHandler);
    }
  }, [openedNodeId, escHandler]);

  const onSave = async () => {
    if (!detail || !accessToken) return;
    if (!hasDirty) return;
    setSaving(true);
    try {
      const payload: UpdateNodeInput = {
        title: title.trim() || undefined,
        description: description.trim() === '' ? null : description,
        dueAt: dueAt ? new Date(dueAt + 'T00:00:00Z').toISOString() : null,
        progress,
      };
      payload.priority = priority;
      payload.effort = effort;
      // Blocage
      const emails = blockedEmails.split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean);
      if (emails.length>0) payload.blockedReminderEmails = emails;
      if (blockedInterval.trim()!=='') payload.blockedReminderIntervalDays = Number(blockedInterval);
      if (blockedEta.trim()!=='') payload.blockedExpectedUnblockAt = new Date(blockedEta + 'T00:00:00Z').toISOString();
  if (tags.length>0) payload.tags = tags;

      await updateNode(detail.id, payload, accessToken);
      success('Tâche mise à jour');
      setInitialSnapshot({
        title: title.trim()||'',
        description: description.trim()===''? null : description,
        dueAt,
        progress,
        priority,
        effort,
      });
      refresh();
      // Fermer le tiroir après une sauvegarde réussie comme demandé
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur mise à jour';
      toastError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {openedNodeId && (
        <>
          <motion.div
            key="overlay"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={overlayVariants}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={close}
            aria-hidden="true"
          />
          <motion.aside
            key="panel"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={panelVariants}
            className="fixed top-0 right-0 h-full w-full sm:w-[640px] md:w-[720px] lg:w-[840px] bg-white dark:bg-slate-900 z-50 shadow-xl border-l border-slate-200 dark:border-slate-800 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-drawer-title"
          >
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1 min-w-0 pr-4">
                <input
                  id="task-drawer-title"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); }}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm font-semibold focus:outline-none focus:ring focus:ring-emerald-500/40"
                  placeholder="Titre de la tâche"
                  disabled={saving}
                />
                {detail && (
                  <div className="text-xs flex flex-wrap gap-x-3 gap-y-1 items-center">
                    {detail.dueAt && (
                      <span className="text-slate-500 dark:text-slate-400">
                        Echéance: {new Date(detail.dueAt).toLocaleDateString()}
                      </span>
                    )}
                    {/* Pile priorité + effort */}
                    <span className="inline-flex flex-col gap-1 items-start" aria-hidden>
                      {/* Priorité si définie */}
                      {priority && priority !== 'NONE' && (
                        <span
                          className={
                            'inline-block h-2.5 w-2.5 rounded-sm border border-black/5 dark:border-white/10 ' +
                            (priority === 'CRITICAL' ? 'bg-red-600' :
                             priority === 'HIGH' ? 'bg-rose-500' :
                             priority === 'MEDIUM' ? 'bg-amber-500' :
                             priority === 'LOW' ? 'bg-emerald-500' :
                             priority === 'LOWEST' ? 'bg-slate-500' : 'bg-slate-600')
                          }
                          title={`Priorité: ${priority}`}
                          aria-label={`Priorité ${priority}`}
                        />
                      )}
                      {/* Effort */}
                      <span
                        className={
                          'inline-block h-2.5 w-2.5 rounded-sm border border-black/5 dark:border-white/10 ' +
                          (
                            effort === 'UNDER2MIN' ? 'bg-emerald-400' :
                            effort === 'XS' ? 'bg-sky-400' :
                            effort === 'S' ? 'bg-blue-400' :
                            effort === 'M' ? 'bg-amber-400' :
                            effort === 'L' ? 'bg-orange-500' :
                            effort === 'XL' ? 'bg-rose-500' :
                            effort === 'XXL' ? 'bg-red-600' :
                            'bg-slate-400'
                          )
                        }
                        title={effort ? `Effort: ${effort}` : 'Effort: (non défini)'}
                        aria-label={effort ? `Effort ${effort}` : 'Effort non défini'}
                      />
                    </span>
                    {detail.summary && (
                      <span
                        className="font-mono tracking-tight flex items-center gap-1"
                        title={`Sous-tâches: Backlog ${detail.summary.counts.backlog} • En cours ${detail.summary.counts.inProgress} • Bloqué ${detail.summary.counts.blocked} • Fait ${detail.summary.counts.done}`}
                        aria-label={`Sous-tâches: Backlog ${detail.summary.counts.backlog}, En cours ${detail.summary.counts.inProgress}, Bloqué ${detail.summary.counts.blocked}, Fait ${detail.summary.counts.done}`}
                      >
                        <span className="sr-only">Ordre des compteurs: Backlog, En cours, Bloqué, Fait</span>
                        <span className="text-amber-600 dark:text-amber-400">{detail.summary.counts.backlog}</span>
                        <span className="text-slate-400">.</span>
                        <span className="text-sky-600 dark:text-sky-400">{detail.summary.counts.inProgress}</span>
                        <span className="text-slate-400">.</span>
                        <span className="text-red-600 dark:text-red-400">{detail.summary.counts.blocked}</span>
                        <span className="text-slate-400">.</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{detail.summary.counts.done}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onSave}
                  disabled={saving || !hasDirty}
                  className="rounded px-3 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >{saving ? '...' : 'Valider'}</button>
                <button
                  onClick={close}
                  className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring"
                  aria-label="Fermer"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {loading && <Skeleton />}
              {!loading && error && (
                <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
              )}
              {!loading && detail && (
                <>
                  <section className="space-y-2">
                    <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</h3>
                    <textarea
                      value={description}
                      onChange={(e) => { setDescription(e.target.value); }}
                      rows={5}
                      className="w-full resize-y rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                      placeholder="Description de la tâche"
                      disabled={saving}
                    />
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Tags</h3>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {tags.map(t => (
                        <span key={t} className="group inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-200">
                          {t}
                          <button
                            type="button"
                            onClick={()=> setTags(tags.filter(x=>x!==t))}
                            className="opacity-60 group-hover:opacity-100 focus:outline-none"
                            aria-label={`Supprimer tag ${t}`}
                          >×</button>
                        </span>
                      ))}
                      {tags.length===0 && <span className="text-[11px] text-slate-500">Aucun tag</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={e=>setTagInput(e.target.value)}
                        onKeyDown={e=>{
                          if(e.key==='Enter') {
                            e.preventDefault();
                            const raw = tagInput.trim();
                            if(!raw) return;
                            if(tags.includes(raw)) { setTagInput(''); return; }
                            if(raw.length>32) { toastError('Tag >32 caractères'); return; }
                            if(tags.length>=20) { toastError('Maximum 20 tags'); return; }
                            setTags([...tags, raw]);
                            setTagInput('');
                          }
                        }}
                        placeholder="Nouveau tag puis Entrée"
                        className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                        disabled={saving}
                      />
                      {tagInput && (
                        <button
                          type="button"
                          onClick={()=>{
                            const raw = tagInput.trim();
                            if(!raw) return;
                            if(tags.includes(raw)) { setTagInput(''); return; }
                            if(raw.length>32) { toastError('Tag >32 caractères'); return; }
                            if(tags.length>=20) { toastError('Maximum 20 tags'); return; }
                            setTags([...tags, raw]);
                            setTagInput('');
                          }}
                          className="px-2 py-1 text-xs rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
                        >Ajouter</button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">Entrée pour ajouter. Max 20, longueur ≤32. Doublons ignorés.</p>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Echéance</h3>
                    <input
                      type="date"
                      value={dueAt}
                      onChange={(e) => { setDueAt(e.target.value); }}
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                      disabled={saving}
                    />
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Priorité</h3>
                    <select
                      value={priority}
                      onChange={(e)=> setPriority(e.target.value as Priority)}
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                      disabled={saving}
                    >
                      <option value="NONE">None</option>
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                      <option value="LOWEST">Lowest</option>
                    </select>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Effort</h3>
                    <select
                      value={effort ?? ''}
                      onChange={(e)=> setEffort(e.target.value ? (e.target.value as Exclude<Effort, null>) : null)}
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                      disabled={saving}
                    >
                      <option value="">(non défini)</option>
                      <option value="UNDER2MIN">&lt; 2 min</option>
                      <option value="XS">XS</option>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="XXL">XXL</option>
                    </select>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Progression</h3>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={progress}
                        onChange={(e)=> setProgress(parseInt(e.target.value,10))}
                        className="flex-1"
                        disabled={saving}
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={progress}
                        onChange={(e)=>{ const v=parseInt(e.target.value,10); if(!Number.isNaN(v)) setProgress(Math.min(100,Math.max(0,v))); }}
                        className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-center"
                        disabled={saving}
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  </section>
                  {/* Blocage: visible si la tache est dans une colonne BLOCKED */}
                  {detail.board && detail.board.columns && (()=>{
                    const currentCol = detail.board.columns.find(c=>c.id===detail.columnId);
                    const isBlocked = currentCol?.behaviorKey === 'BLOCKED';
                    if(!isBlocked) return null;
                    return (
                      <section className="space-y-2">
                        <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Blocage</h3>
                        <label className="block text-xs text-slate-500 dark:text-slate-400">Emails à relancer (séparés par virgule)
                          <input
                            type="text"
                            value={blockedEmails}
                            onChange={e=>setBlockedEmails(e.target.value)}
                            className="mt-1 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                            placeholder="ex: attente@exemple.com, support@exemple.com"
                            disabled={saving}
                          />
                        </label>
                        <div className="flex items-center gap-4">
                          <label className="text-xs text-slate-500 dark:text-slate-400">Intervalle (jours)
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={blockedInterval}
                              onChange={e=>setBlockedInterval(e.target.value)}
                              className="mt-1 w-24 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="text-xs text-slate-500 dark:text-slate-400">Date estimée de fin
                            <input
                              type="date"
                              value={blockedEta}
                              onChange={e=>setBlockedEta(e.target.value)}
                              className="mt-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                        </div>
                        <p className="text-[11px] text-slate-500">Nous pourrons inclure un lien d’estimation dans les emails envoyés automatiquement.</p>
                      </section>
                    );
                  })()}
                  <ChildTasksSection />
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
