"use client";
import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useTaskDrawer } from './TaskDrawerContext';
import { useTaskDetail } from './useTaskDetail';
import { ChildTasksSection } from './ChildTasksSection';
import { updateNode, type UpdateNodeInput } from '@/features/nodes/nodes-api';
import { useAuth } from '@/features/auth/auth-provider';
import { useToast } from '@/components/toast/ToastProvider';
import { useBoardUiSettings } from '@/features/boards/board-ui-settings';
import { useBoardData } from '@/features/boards/board-data-provider';
import { fetchTeamMembers, type TeamMember } from '@/features/teams/team-members-api';
import {
  fetchNodeCollaborators,
  inviteNodeCollaborator,
  removeNodeCollaborator,
  type NodeCollaborator as SharedNodeCollaborator,
  type NodeCollaboratorInvitation,
} from '@/features/nodes/node-collaborators-api';
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

interface MemberMultiSelectProps {
  label: string;
  members: TeamMember[];
  membersMap: Map<string, TeamMember>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const MemberMultiSelect: React.FC<MemberMultiSelectProps> = ({
  label,
  members,
  membersMap,
  selectedIds,
  onChange,
}) => {
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    if (!normalizedQuery) return members;
    return members.filter((member) => {
      const name = member.displayName.toLowerCase();
      const email = member.email.toLowerCase();
      return (
        name.includes(normalizedQuery) ||
        email.includes(normalizedQuery)
      );
    });
  }, [members, normalizedQuery]);

  const toggleMember = useCallback((id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((value) => value !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }, [selectedIds, onChange]);

  const removeMember = useCallback((id: string) => {
    onChange(selectedIds.filter((value) => value !== id));
  }, [selectedIds, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-slate-500 transition hover:text-foreground"
          >
            Effacer
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedIds.length === 0 && (
          <span className="text-[11px] text-slate-500">Aucun membre sélectionné</span>
        )}
        {selectedIds.map((id) => {
          const member = membersMap.get(id);
          const display = member?.displayName ?? id;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-surface/80 px-2 py-0.5 text-xs text-foreground"
            >
              {display}
              <button
                type="button"
                onClick={() => removeMember(id)}
                className="text-[10px] text-slate-400 transition hover:text-foreground"
                aria-label={`Retirer ${display}`}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher par nom ou email"
        className="w-full rounded border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
      />
      <div className="max-h-40 overflow-y-auto rounded border border-white/10 bg-surface/60">
        {filteredMembers.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted">Aucun résultat</p>
        ) : (
          filteredMembers.map((member) => {
            const active = selectedIds.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => toggleMember(member.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${active ? 'bg-accent/10 text-foreground' : 'text-muted hover:bg-white/5 hover:text-foreground'}`}
              >
                <span>{member.displayName}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{member.email}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export const TaskDrawer: React.FC = () => {
  const { openedNodeId, close } = useTaskDrawer();
  const { detail, loading, error, refresh } = useTaskDetail();
  const { accessToken, user } = useAuth();
  const { success, error: toastError } = useToast();
  const { expertMode } = useBoardUiSettings();
  const { teamId, refreshActiveBoard } = useBoardData();

  // Form state
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  type Priority = 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
  type Effort = 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;
  type Snapshot = {
    title: string;
    description: string | null;
    dueAt: string;
    progress: number;
    priority: Priority;
    effort: Effort;
    tags: string[];
    raci: { R: string[]; A: string[]; C: string[]; I: string[] };
    timeTracking: {
      estimatedTimeHours: number | null;
      actualOpexHours: number | null;
      actualCapexHours: number | null;
      plannedStartDate: string | null;
      plannedEndDate: string | null;
      actualEndDate: string | null;
    };
    financials: {
      billingStatus: 'TO_BILL'|'BILLED'|'PAID' | null;
      hourlyRate: number | null;
      plannedBudget: number | null;
      consumedBudgetValue: number | null;
      consumedBudgetPercent: number | null;
    };
  };
  const [initialSnapshot, setInitialSnapshot] = useState<Snapshot | null>(null);
  const [priority, setPriority] = useState<Priority>('NONE');
  const [effort, setEffort] = useState<Effort>(null);
  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  // Blocage
  const [blockedEmails, setBlockedEmails] = useState<string>('');
  const [blockedInterval, setBlockedInterval] = useState<string>('');
  const [blockedEta, setBlockedEta] = useState<string>('');
  // RACI
  const [rResponsible, setRResponsible] = useState<string[]>([]);
  const [rAccountable, setRAccountable] = useState<string[]>([]);
  const [rConsulted, setRConsulted] = useState<string[]>([]);
  const [rInformed, setRInformed] = useState<string[]>([]);
  // Temps & coûts
  const [estimatedTime, setEstimatedTime] = useState<string>('');
  const [actualOpex, setActualOpex] = useState<string>('');
  const [actualCapex, setActualCapex] = useState<string>('');
  const [plannedStart, setPlannedStart] = useState<string>('');
  const [plannedEnd, setPlannedEnd] = useState<string>('');
  const [actualEnd, setActualEnd] = useState<string>('');
  const [billingStatus, setBillingStatus] = useState<string>('');
  const [hourlyRate, setHourlyRate] = useState<string>('');
  const [plannedBudget, setPlannedBudget] = useState<string>('');
  const [consumedBudgetValue, setConsumedBudgetValue] = useState<string>('');
  const [consumedBudgetPercent, setConsumedBudgetPercent] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'collaborators' | 'time'>('details');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const membersMap = useMemo(() => new Map(teamMembers.map(member => [member.id, member])), [teamMembers]);

  const [collaborators, setCollaborators] = useState<SharedNodeCollaborator[]>([]);
  const [collaboratorInvites, setCollaboratorInvites] = useState<NodeCollaboratorInvitation[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [collaboratorsError, setCollaboratorsError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');

  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null);
  const computedActualCost = useMemo(() => {
    const parseValue = (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const normalized = trimmed.replace(',', '.');
      const value = Number(normalized);
      if (Number.isNaN(value)) return NaN;
      return value;
    };
    const rate = parseValue(hourlyRate);
    const opex = parseValue(actualOpex);
    const capex = parseValue(actualCapex);
    if (rate === null || opex === null || capex === null) return null;
    if (Number.isNaN(rate) || Number.isNaN(opex) || Number.isNaN(capex)) return null;
    return (opex + capex) * rate;
  }, [hourlyRate, actualOpex, actualCapex]);
  const formattedActualCost = useMemo(() => {
    if (computedActualCost === null) return null;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(computedActualCost);
  }, [computedActualCost]);

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
      setRResponsible(detail.raci?.responsibleIds ? [...detail.raci.responsibleIds] : []);
      setRAccountable(detail.raci?.accountableIds ? [...detail.raci.accountableIds] : []);
      setRConsulted(detail.raci?.consultedIds ? [...detail.raci.consultedIds] : []);
      setRInformed(detail.raci?.informedIds ? [...detail.raci.informedIds] : []);
      setEstimatedTime(detail.timeTracking?.estimatedTimeHours != null ? String(detail.timeTracking.estimatedTimeHours) : '');
      setActualOpex(detail.timeTracking?.actualOpexHours != null ? String(detail.timeTracking.actualOpexHours) : '');
      setActualCapex(detail.timeTracking?.actualCapexHours != null ? String(detail.timeTracking.actualCapexHours) : '');
      setPlannedStart(detail.timeTracking?.plannedStartDate ?? '');
      setPlannedEnd(detail.timeTracking?.plannedEndDate ?? '');
      setActualEnd(detail.timeTracking?.actualEndDate ?? '');
      setBillingStatus(detail.financials?.billingStatus ?? '');
      setHourlyRate(detail.financials?.hourlyRate != null ? String(detail.financials.hourlyRate) : '');
      setPlannedBudget(detail.financials?.plannedBudget != null ? String(detail.financials.plannedBudget) : '');
      setConsumedBudgetValue(detail.financials?.consumedBudgetValue != null ? String(detail.financials.consumedBudgetValue) : '');
      setConsumedBudgetPercent(detail.financials?.consumedBudgetPercent != null ? String(detail.financials.consumedBudgetPercent) : '');
      setInitialSnapshot({
        title: detail.title||'',
        description: detail.description||null,
        dueAt: dDate,
        progress: detail.progress ?? 0,
        priority: detail.priority ?? 'NONE',
        effort: detail.effort ?? null,
        tags: detail.tags ?? [],
        raci: {
          R: detail.raci?.responsibleIds ? [...detail.raci.responsibleIds] : [],
          A: detail.raci?.accountableIds ? [...detail.raci.accountableIds] : [],
          C: detail.raci?.consultedIds ? [...detail.raci.consultedIds] : [],
          I: detail.raci?.informedIds ? [...detail.raci.informedIds] : [],
        },
        timeTracking: {
          estimatedTimeHours: detail.timeTracking?.estimatedTimeHours ?? null,
          actualOpexHours: detail.timeTracking?.actualOpexHours ?? null,
          actualCapexHours: detail.timeTracking?.actualCapexHours ?? null,
          plannedStartDate: detail.timeTracking?.plannedStartDate ?? null,
          plannedEndDate: detail.timeTracking?.plannedEndDate ?? null,
          actualEndDate: detail.timeTracking?.actualEndDate ?? null,
        },
        financials: {
          billingStatus: detail.financials?.billingStatus ?? null,
          hourlyRate: detail.financials?.hourlyRate ?? null,
          plannedBudget: detail.financials?.plannedBudget ?? null,
          consumedBudgetValue: detail.financials?.consumedBudgetValue ?? null,
          consumedBudgetPercent: detail.financials?.consumedBudgetPercent ?? null,
        },
      });
      setActiveTab('details');
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
      setRResponsible([]);
      setRAccountable([]);
      setRConsulted([]);
      setRInformed([]);
      setEstimatedTime('');
      setActualOpex('');
      setActualCapex('');
      setPlannedStart('');
      setPlannedEnd('');
      setActualEnd('');
      setBillingStatus('');
      setHourlyRate('');
      setPlannedBudget('');
      setConsumedBudgetValue('');
      setConsumedBudgetPercent('');
      setActiveTab('details');
      setInitialSnapshot(null);
    }
  }, [detail]);

  useEffect(() => {
    if (!teamId || !accessToken) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    setMembersError(null);
    fetchTeamMembers(teamId, accessToken)
      .then((list) => {
        if (cancelled) return;
        const sorted = [...list].sort((a, b) =>
          a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }),
        );
        setTeamMembers(sorted);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setMembersError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Erreur de chargement des membres',
        );
        setTeamMembers([]);
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, accessToken]);

  useEffect(() => {
    if (!detail?.id || !accessToken) {
      setCollaborators([]);
      setCollaboratorInvites([]);
      setCollaboratorsError(null);

      setInviteEmail('');
      setCollaboratorsLoading(false);
      return;
    }
    let cancelled = false;
    setCollaboratorsLoading(true);
    setCollaboratorsError(null);
    fetchNodeCollaborators(detail.id, accessToken)
      .then((response) => {
        if (cancelled) return;
        setCollaborators(response.collaborators);
        setCollaboratorInvites(response.invitations);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : 'Erreur lors du chargement des collaborateurs';
        setCollaboratorsError(message);
        setCollaborators([]);
        setCollaboratorInvites([]);
      })
      .finally(() => {
        if (!cancelled) setCollaboratorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.id, accessToken]);

  useEffect(() => {
    if (!expertMode && activeTab === 'time') {
      setActiveTab('details');
    }

  }, [expertMode, activeTab]);

  const hasDirty = useMemo(() => {
    if (!initialSnapshot) return false;

    const normalizeDescription = initialSnapshot.description ?? '';
    const arraysEqual = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      const sortedA = [...a].sort();
      const sortedB = [...b].sort();
      return sortedA.every((value, index) => value === sortedB[index]);
    };
    const parseNumericField = (raw: string): number | null | undefined => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const normalized = trimmed.replace(',', '.');
      const parsed = Number(normalized);
      if (Number.isNaN(parsed)) return undefined;
      return parsed;
    };
    const compareDateField = (raw: string, baseline: string | null) => {
      const normalized = raw.trim() ? raw.trim() : null;
      return normalized !== (baseline ?? null);
    };

    if (
      title !== initialSnapshot.title ||
      description !== normalizeDescription ||
      dueAt !== initialSnapshot.dueAt ||
      progress !== initialSnapshot.progress ||
      priority !== initialSnapshot.priority ||
      (effort || null) !== (initialSnapshot.effort ?? null) ||
      blockedEmails.trim() !== (detail?.blockedReminderEmails || []).join(', ') ||
      (blockedInterval || '') !== (detail?.blockedReminderIntervalDays != null ? String(detail.blockedReminderIntervalDays) : '') ||
      (blockedEta || '') !== (detail?.blockedExpectedUnblockAt ? detail.blockedExpectedUnblockAt.substring(0, 10) : '') ||
      !arraysEqual(tags, initialSnapshot.tags)
    ) {
      return true;
    }

    if (
      !arraysEqual(rResponsible, initialSnapshot.raci.R) ||
      !arraysEqual(rAccountable, initialSnapshot.raci.A) ||
      !arraysEqual(rConsulted, initialSnapshot.raci.C) ||
      !arraysEqual(rInformed, initialSnapshot.raci.I)
    ) {
      return true;
    }

    const estimatedValue = parseNumericField(estimatedTime);
    if (estimatedValue === undefined || estimatedValue !== initialSnapshot.timeTracking.estimatedTimeHours) return true;
    const opexValue = parseNumericField(actualOpex);
    if (opexValue === undefined || opexValue !== initialSnapshot.timeTracking.actualOpexHours) return true;
    const capexValue = parseNumericField(actualCapex);
    if (capexValue === undefined || capexValue !== initialSnapshot.timeTracking.actualCapexHours) return true;

    if (compareDateField(plannedStart, initialSnapshot.timeTracking.plannedStartDate)) return true;
    if (compareDateField(plannedEnd, initialSnapshot.timeTracking.plannedEndDate)) return true;
    if (compareDateField(actualEnd, initialSnapshot.timeTracking.actualEndDate)) return true;

    const normalizedBilling = billingStatus || null;
    if (normalizedBilling !== (initialSnapshot.financials.billingStatus ?? null)) return true;

    const rateValue = parseNumericField(hourlyRate);
    if (rateValue === undefined || rateValue !== initialSnapshot.financials.hourlyRate) return true;
    const plannedBudgetValue = parseNumericField(plannedBudget);
    if (plannedBudgetValue === undefined || plannedBudgetValue !== initialSnapshot.financials.plannedBudget) return true;
    const consumedBudgetValueParsed = parseNumericField(consumedBudgetValue);
    if (consumedBudgetValueParsed === undefined || consumedBudgetValueParsed !== initialSnapshot.financials.consumedBudgetValue) return true;
    const consumedBudgetPercentParsed = parseNumericField(consumedBudgetPercent);
    if (consumedBudgetPercentParsed === undefined || consumedBudgetPercentParsed !== initialSnapshot.financials.consumedBudgetPercent) return true;

    return false;
  }, [
    initialSnapshot,
    title,
    description,
    dueAt,
    progress,
    priority,
    effort,
    blockedEmails,
    blockedInterval,
    blockedEta,
    detail?.blockedReminderEmails,
    detail?.blockedReminderIntervalDays,
    detail?.blockedExpectedUnblockAt,
    tags,
    rResponsible,
    rAccountable,
    rConsulted,
    rInformed,
    estimatedTime,
    actualOpex,
    actualCapex,
    plannedStart,
    plannedEnd,
    actualEnd,
    billingStatus,
    hourlyRate,
    plannedBudget,
    consumedBudgetValue,
    consumedBudgetPercent,
  ]);

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
      payload.tags = tags;

      const parseNumberField = (raw: string, label: string): number | null => {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const normalized = trimmed.replace(',', '.');
        const value = Number(normalized);
        if (Number.isNaN(value)) {
          throw new Error(`${label} doit être un nombre valide`);
        }
        if (value < 0) {
          throw new Error(`${label} ne peut pas être négatif`);
        }
        return value;
      };

      let estimatedNumeric: number | null;
      let opexNumeric: number | null;
      let capexNumeric: number | null;
      let rateNumeric: number | null;
      let plannedBudgetNumeric: number | null;
      let consumedValueNumeric: number | null;
      let consumedPercentNumeric: number | null;

      try {
        estimatedNumeric = parseNumberField(estimatedTime, 'Temps estimé');
        opexNumeric = parseNumberField(actualOpex, 'Temps réel OPEX');
        capexNumeric = parseNumberField(actualCapex, 'Temps réel CAPEX');
        rateNumeric = parseNumberField(hourlyRate, 'Taux horaire');
        plannedBudgetNumeric = parseNumberField(plannedBudget, 'Budget prévu');
        consumedValueNumeric = parseNumberField(consumedBudgetValue, 'Budget consommé (€)');
        consumedPercentNumeric = parseNumberField(consumedBudgetPercent, 'Budget consommé (%)');
      } catch (validationError) {
        const message = validationError instanceof Error ? validationError.message : 'Valeur numérique invalide';
        toastError(message);
        return;
      }

      payload.estimatedTimeHours = estimatedNumeric;
      payload.actualOpexHours = opexNumeric;
      payload.actualCapexHours = capexNumeric;
      payload.plannedStartDate = plannedStart ? plannedStart : null;
      payload.plannedEndDate = plannedEnd ? plannedEnd : null;
      payload.actualEndDate = actualEnd ? actualEnd : null;
      const normalizedBilling = billingStatus ? (billingStatus as 'TO_BILL'|'BILLED'|'PAID') : null;
      payload.billingStatus = normalizedBilling;
      payload.hourlyRate = rateNumeric;
      payload.plannedBudget = plannedBudgetNumeric;
      payload.consumedBudgetValue = consumedValueNumeric;
      payload.consumedBudgetPercent = consumedPercentNumeric;
      payload.raciResponsibleIds = rResponsible;
      payload.raciAccountableIds = rAccountable;
      payload.raciConsultedIds = rConsulted;
      payload.raciInformedIds = rInformed;

      await updateNode(detail.id, payload, accessToken);
      await refreshActiveBoard();
      success('Tâche mise à jour');
      setInitialSnapshot({
        title: title.trim()||'',
        description: description.trim()===''? null : description,
        dueAt,
        progress,
        priority,
        effort,
        tags: [...tags],
        raci: {
          R: [...rResponsible],
          A: [...rAccountable],
          C: [...rConsulted],
          I: [...rInformed],
        },
        timeTracking: {
          estimatedTimeHours: estimatedNumeric ?? null,
          actualOpexHours: opexNumeric ?? null,
          actualCapexHours: capexNumeric ?? null,
          plannedStartDate: plannedStart ? plannedStart : null,
          plannedEndDate: plannedEnd ? plannedEnd : null,
          actualEndDate: actualEnd ? actualEnd : null,
        },
        financials: {
          billingStatus: normalizedBilling,
          hourlyRate: rateNumeric ?? null,
          plannedBudget: plannedBudgetNumeric ?? null,
          consumedBudgetValue: consumedValueNumeric ?? null,
          consumedBudgetPercent: consumedPercentNumeric ?? null,
        },
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
                    {progress > 0 && (
                      <span className="text-slate-500 dark:text-slate-400">
                        Progression : {progress}%
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
                <div className="space-y-6">
                  <div className="flex gap-2 rounded border border-white/10 bg-surface/40 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveTab('details')}
                      className={`flex-1 rounded px-3 py-2 font-medium transition ${activeTab === 'details' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                    >Détails</button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('collaborators')}
                      className={`flex-1 rounded px-3 py-2 font-medium transition ${activeTab === 'collaborators' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                    >Collaborateurs</button>
                    {expertMode && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('time')}
                        className={`flex-1 rounded px-3 py-2 font-medium transition ${activeTab === 'time' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                      >Temps & coût</button>
                    )}
                  </div>

                  {activeTab === 'details' && (
                    <div className="space-y-6">
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

                      <section className="space-y-3">
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

                      <section className="space-y-3">
                        <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Planification</h3>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Echéance
                            <input
                              type="date"
                              value={dueAt}
                              onChange={(e) => { setDueAt(e.target.value); }}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Priorité
                            <select
                              value={priority}
                              onChange={(e)=> setPriority(e.target.value as Priority)}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            >
                              <option value="NONE">None</option>
                              <option value="CRITICAL">Critical</option>
                              <option value="HIGH">High</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="LOW">Low</option>
                              <option value="LOWEST">Lowest</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Effort
                            <select
                              value={effort ?? ''}
                              onChange={(e)=> setEffort(e.target.value ? (e.target.value as Exclude<Effort, null>) : null)}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring focus:ring-emerald-500/40"
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
                          </label>
                        </div>
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

                      <section className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">RACI</h3>
                          {membersLoading && <span className="text-[11px] text-slate-500">Chargement…</span>}
                        </div>
                        {membersError && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">{membersError}</p>
                        )}
                        <div className="grid gap-4 md:grid-cols-2">
                          <MemberMultiSelect
                            label="R : Responsable"
                            members={teamMembers}
                            membersMap={membersMap}
                            selectedIds={rResponsible}
                            onChange={setRResponsible}
                          />
                          <MemberMultiSelect
                            label="A : Accountable"
                            members={teamMembers}
                            membersMap={membersMap}
                            selectedIds={rAccountable}
                            onChange={setRAccountable}
                          />
                          <MemberMultiSelect
                            label="C : Consulted"
                            members={teamMembers}
                            membersMap={membersMap}
                            selectedIds={rConsulted}
                            onChange={setRConsulted}
                          />
                          <MemberMultiSelect
                            label="I : Informed"
                            members={teamMembers}
                            membersMap={membersMap}
                            selectedIds={rInformed}
                            onChange={setRInformed}
                          />
                        </div>
                      </section>

                      {detail.board && detail.board.columns && (()=>{
                        const currentCol = detail.board.columns.find(c=>c.id===detail.columnId);
                        const isBlocked = currentCol?.behaviorKey === 'BLOCKED';
                        if(!isBlocked) return null;
                        return (
                          <section className="space-y-3">
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
                            <div className="flex flex-wrap gap-4">
                              <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                                Intervalle (jours)
                                <input
                                  type="number"
                                  min={1}
                                  max={365}
                                  value={blockedInterval}
                                  onChange={e=>setBlockedInterval(e.target.value)}
                                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                                  disabled={saving}
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                                Date estimée de fin
                                <input
                                  type="date"
                                  value={blockedEta}
                                  onChange={e=>setBlockedEta(e.target.value)}
                                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                                  disabled={saving}
                                />
                              </label>
                            </div>
                            <p className="text-[11px] text-slate-500">Nous pourrons inclure un lien d’estimation dans les emails envoyés automatiquement.</p>
                          </section>
                        );
                      })()}

                      <ChildTasksSection />
                    </div>
                  )}

                  {activeTab === 'collaborators' && (
                    <div className="space-y-4">
                      <section className="space-y-2">
                        <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Gestion des accès</h3>
                        <p className="text-sm text-muted">
                          Invitez des collaborateurs pour leur donner accès à cette tâche dans leur propre kanban. Les accès hérités via un parent sont signalés automatiquement.
                        </p>
                      </section>
                      <section className="space-y-3">
                        <div className="space-y-2">
                          <label className="flex flex-col gap-2 rounded border border-white/10 bg-surface/60 p-3 text-sm">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ajouter un collaborateur</span>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

                              <input
                                type="email"
                                value={inviteEmail}
                                onChange={(event) => setInviteEmail(event.target.value)}
                                placeholder="email@exemple.com"
                                className="flex-1 rounded border border-white/10 bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                                disabled={inviteSubmitting}
                                aria-label="Email du collaborateur à inviter"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!detail?.id || !accessToken) return;
                                  const trimmedEmail = inviteEmail.trim();
                                  if (!trimmedEmail) {
                                    toastError('Veuillez saisir un email');
                                    return;
                                  }
                                  setInviteSubmitting(true);
                                  inviteNodeCollaborator(detail.id, { email: trimmedEmail }, accessToken)

                                    .then((response) => {
                                      setCollaborators(response.collaborators);
                                      setCollaboratorInvites(response.invitations);
                                      setCollaboratorsError(null);

                                      setInviteEmail('');

                                      success('Collaborateur ajouté');
                                    })
                                    .catch((inviteError) => {
                                      const message = inviteError instanceof Error ? inviteError.message : "Impossible d&apos;ajouter le collaborateur";
                                      toastError(message);
                                    })
                                    .finally(() => {
                                      setInviteSubmitting(false);
                                    });
                                }}

                                disabled={!inviteEmail.trim() || inviteSubmitting}

                                className="whitespace-nowrap rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {inviteSubmitting ? 'Ajout…' : 'Inviter'}
                              </button>
                            </div>

                            <p className="text-xs text-muted">
                              L’adresse doit correspondre à un compte Stratum. Un membre de l’équipe sera ajouté directement, sinon une invitation restera en attente.
                            </p>
                            {membersError && (
                              <span className="text-xs text-red-400">{membersError}</span>
                            )}

                          </label>
                        </div>
                        <div className="space-y-3">
                          {collaboratorsLoading ? (
                            <div className="space-y-2">
                              {Array.from({ length: 3 }).map((_, index) => (
                                <div key={index} className="animate-pulse rounded border border-white/10 bg-surface/60 p-3">
                                  <div className="h-4 w-1/3 rounded bg-white/10" />
                                  <div className="mt-2 h-3 w-1/2 rounded bg-white/5" />
                                </div>
                              ))}
                            </div>
                          ) : collaboratorsError ? (
                            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                              {collaboratorsError}
                            </div>
                          ) : collaborators.length === 0 ? (
                            <p className="text-sm text-muted">Aucun collaborateur pour le moment.</p>
                          ) : (
                            <ul className="space-y-3">
                              {collaborators.map((collab) => {
                                const addedBy = collab.addedById ? membersMap.get(collab.addedById)?.displayName ?? collab.addedById : null;
                                const addedAtLabel = collab.addedAt ? new Date(collab.addedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : null;
                                return (
                                  <li
                                    key={collab.userId}
                                    className="rounded border border-white/10 bg-surface/60 p-3"
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="space-y-1">
                                        <p className="text-sm font-medium text-foreground">{collab.displayName}</p>
                                        <p className="text-xs text-muted">{collab.email}</p>
                                        <div className="flex flex-wrap gap-2 text-[11px] text-muted">
                                          <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 uppercase tracking-wide">
                                            {collab.accessType === 'OWNER'
                                              ? 'Propriétaire'
                                              : collab.accessType === 'DIRECT'
                                                ? 'Direct'
                                                : collab.accessType === 'INHERITED'
                                                  ? 'Hérité'
                                                  : 'Moi'}
                                          </span>
                                          {collab.viaNodes.map((via) => (
                                            <span
                                              key={via.nodeId}
                                              className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5"
                                            >
                                              Via {via.title}
                                            </span>
                                          ))}
                                        </div>
                                        {addedAtLabel && (
                                          <p className="text-[11px] text-muted">
                                            Ajouté le {addedAtLabel}
                                            {addedBy ? ` par ${addedBy}` : ''}
                                          </p>
                                        )}
                                      </div>
                                      {collab.accessType === 'DIRECT' && collab.userId !== user?.id ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!detail?.id || !accessToken) return;
                                            setRemovingCollaboratorId(collab.userId);
                                            removeNodeCollaborator(detail.id, collab.userId, accessToken)
                                              .then((response) => {
                                                setCollaborators(response.collaborators);
                                                setCollaboratorInvites(response.invitations);
                                                setCollaboratorsError(null);
                                                success('Collaborateur retiré');
                                              })
                                              .catch((removeError) => {
                                                const message = removeError instanceof Error ? removeError.message : "Impossible de retirer le collaborateur";
                                                toastError(message);
                                              })
                                              .finally(() => {
                                                setRemovingCollaboratorId(null);
                                              });
                                          }}
                                          disabled={removingCollaboratorId === collab.userId}
                                          className="self-start rounded border border-white/10 px-3 py-1 text-xs font-medium text-red-300 transition hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {removingCollaboratorId === collab.userId ? 'Suppression…' : 'Retirer'}
                                        </button>
                                      ) : null}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        {collaboratorInvites.length > 0 && (
                          <section className="space-y-2">
                            <h4 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Invitations en attente</h4>
                            <ul className="space-y-2 text-sm text-muted">
                              {collaboratorInvites.map((invite) => (
                                <li key={`${invite.email}-${invite.invitedAt ?? 'pending'}`} className="rounded border border-white/10 bg-surface/40 px-3 py-2">
                                  <div className="flex flex-col gap-1">
                                    <span className="font-medium text-foreground">{invite.email}</span>
                                    <span className="text-xs text-muted">
                                      Statut : {invite.status === 'PENDING' ? 'En attente' : 'Acceptée'}
                                      {invite.invitedAt ? ` • Envoyée le ${new Date(invite.invitedAt).toLocaleDateString('fr-FR', { dateStyle: 'medium' })}` : ''}
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}
                      </section>
                    </div>
                  )}

                  {expertMode && activeTab === 'time' && (
                    <div className="space-y-6">
                      <section className="space-y-3">
                        <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Temps et effort</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Temps estimé (heures)
                            <input
                              type="text"
                              inputMode="decimal"
                              value={estimatedTime}
                              onChange={(e) => setEstimatedTime(e.target.value)}
                              placeholder="ex : 12,5"
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Temps réel OPEX (heures)
                            <input
                              type="text"
                              inputMode="decimal"
                              value={actualOpex}
                              onChange={(e) => setActualOpex(e.target.value)}
                              placeholder="ex : 4"
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Temps réel CAPEX (heures)
                            <input
                              type="text"
                              inputMode="decimal"
                              value={actualCapex}
                              onChange={(e) => setActualCapex(e.target.value)}
                              placeholder="ex : 2,5"
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Date début prévue
                            <input
                              type="date"
                              value={plannedStart}
                              onChange={(e) => setPlannedStart(e.target.value)}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Date fin prévue
                            <input
                              type="date"
                              value={plannedEnd}
                              onChange={(e) => setPlannedEnd(e.target.value)}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Date fin réelle
                            <input
                              type="date"
                              value={actualEnd}
                              onChange={(e) => setActualEnd(e.target.value)}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Statut facturation
                            <select
                              value={billingStatus}
                              onChange={(e) => setBillingStatus(e.target.value)}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            >
                              <option value="">(non défini)</option>
                              <option value="TO_BILL">À facturer</option>
                              <option value="BILLED">Facturé</option>
                              <option value="PAID">Payé</option>
                            </select>
                          </label>
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Coûts et budgets</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Taux horaire (€)
                            <input
                              type="text"
                              inputMode="decimal"
                              value={hourlyRate}
                              onChange={(e) => setHourlyRate(e.target.value)}
                              placeholder="ex : 85"
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <div className="flex flex-col gap-1 rounded border border-dashed border-slate-300 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                            Coût réel calculé
                            <span className="text-sm font-medium text-foreground">
                              {formattedActualCost ?? '—'}
                            </span>
                            <span className="text-[10px] text-slate-400">Calcul automatique : (OPEX + CAPEX) × taux horaire</span>
                          </div>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Budget prévu
                            <input
                              type="text"
                              inputMode="decimal"
                              value={plannedBudget}
                              onChange={(e) => setPlannedBudget(e.target.value)}
                              placeholder="ex : 12000"
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Budget consommé (€)
                            <input
                              type="text"
                              inputMode="decimal"
                              value={consumedBudgetValue}
                              onChange={(e) => setConsumedBudgetValue(e.target.value)}
                              placeholder="ex : 4500"
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            Budget consommé (%)
                            <input
                              type="text"
                              inputMode="decimal"
                              value={consumedBudgetPercent}
                              onChange={(e) => setConsumedBudgetPercent(e.target.value)}
                              placeholder="ex : 37"
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
