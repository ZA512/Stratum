"use client";
import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useTranslation } from '@/i18n';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useTaskDrawer } from './TaskDrawerContext';
import { useTaskDetail } from './useTaskDetail';
import { ChildTasksSection } from './ChildTasksSection';
import { CommentsSection } from './CommentsSection';
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
import { MultiSelectCombo } from '@/components/ui/MultiSelectCombo';
import {
  createRaciTeam as createSavedRaciTeam,
  fetchRaciTeams as fetchSavedRaciTeams,
  type RaciTeamPreset,
} from '@/features/users/raci-teams-api';
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
    <div className="h-6 w-3/4 rounded bg-card/70" />
    <div className="h-4 w-1/2 rounded bg-card/60" />
    <div className="h-4 w-full rounded bg-card/60" />
    <div className="h-4 w-5/6 rounded bg-card/60" />
    <div className="space-y-2 pt-4">
      <div className="h-4 w-1/3 rounded bg-card/50" />
      <div className="h-4 w-2/3 rounded bg-card/50" />
    </div>
  </div>
);

interface MemberMultiSelectProps {
  label: string;
  members: TeamMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

const MemberMultiSelect: React.FC<MemberMultiSelectProps> = ({
  label,
  members,
  selectedIds,
  onChange,
  disabled = false,
}) => {
  const { t: tBoard } = useTranslation('board');
  const options = useMemo(
    () => members.map((member) => ({
      id: member.id,
      label: member.displayName,
      description: member.email,
      searchText: `${member.displayName} ${member.email}`,
    })),
    [members],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <MultiSelectCombo
        options={options}
        selectedIds={selectedIds}
        onChange={onChange}
        placeholder={tBoard('taskDrawer.multiSelect.placeholder')}
        searchPlaceholder={tBoard('taskDrawer.multiSelect.searchPlaceholder')}
        emptyMessage={tBoard('taskDrawer.multiSelect.empty')}
        noResultsMessage={tBoard('taskDrawer.multiSelect.noResults')}
        disabled={disabled}
      />
    </div>
  );
};

export const TaskDrawer: React.FC = () => {
  const { t: tBoard, locale } = useTranslation('board');
  const { openedNodeId, close } = useTaskDrawer();
  const { detail, loading, error, refresh } = useTaskDetail();
  const { accessToken, user } = useAuth();
  const { success, error: toastError } = useToast();
  const { expertMode } = useBoardUiSettings();
  const { teamId, refreshActiveBoard, board } = useBoardData();

  const formatDate = useCallback(
    (input: string | Date | null | undefined, options: Intl.DateTimeFormatOptions): string => {
      if (!input) return '—';
      const date = input instanceof Date ? input : new Date(input);
      if (Number.isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat(locale, options).format(date);
    },
    [locale],
  );

  const formatDateTime = useCallback(
    (input: string | Date | null | undefined): string =>
      formatDate(input, { dateStyle: 'medium', timeStyle: 'short' }),
    [formatDate],
  );

  const formatDateLong = useCallback(
    (input: string | Date | null | undefined): string =>
      formatDate(input, { dateStyle: 'long' }),
    [formatDate],
  );

  const formatDateMedium = useCallback(
    (input: string | Date | null | undefined): string =>
      formatDate(input, { dateStyle: 'medium' }),
    [formatDate],
  );

  const describeSnoozeCountdown = useCallback(
    (value: string): string | null => {
      if (!value) return null;
      const date = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return null;
      const diffMs = date.getTime() - Date.now();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        return diffDays === 1
          ? tBoard('taskDrawer.backlog.snoozeCountdown.futureOne')
          : tBoard('taskDrawer.backlog.snoozeCountdown.futureOther', { count: diffDays });
      }
      if (diffDays === 0) {
        return tBoard('taskDrawer.backlog.snoozeCountdown.today');
      }
      const pastDays = Math.abs(diffDays);
      return pastDays === 1
        ? tBoard('taskDrawer.backlog.snoozeCountdown.pastOne')
        : tBoard('taskDrawer.backlog.snoozeCountdown.pastOther', { count: pastDays });
    },
    [tBoard],
  );

  // Form state
  const [saving, setSaving] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
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
    blocked: {
      reason: string;
      emails: string[];
      interval: string;
      eta: string;
      isResolved: boolean;
    };
    backlog: {
      hiddenUntil: string;
    };
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
  const [blockedReason, setBlockedReason] = useState('');
  const [blockedEmails, setBlockedEmails] = useState<string[]>([]);
  const [blockedEmailInput, setBlockedEmailInput] = useState('');
  const [blockedSince, setBlockedSince] = useState<string | null>(null);
  const [isBlockResolved, setIsBlockResolved] = useState(false);
  const [blockedInterval, setBlockedInterval] = useState('');
  const [blockedEta, setBlockedEta] = useState('');
  const [backlogHiddenUntil, setBacklogHiddenUntil] = useState('');
  const [backlogRestartRequested, setBacklogRestartRequested] = useState(false);
  // RACI
  const [rResponsible, setRResponsible] = useState<string[]>([]);
  const [rAccountable, setRAccountable] = useState<string[]>([]);
  const [rConsulted, setRConsulted] = useState<string[]>([]);
  const [rInformed, setRInformed] = useState<string[]>([]);
  const [savedRaciTeams, setSavedRaciTeams] = useState<RaciTeamPreset[]>([]);
  const [savedRaciTeamsLoading, setSavedRaciTeamsLoading] = useState(false);
  const [savedRaciTeamsError, setSavedRaciTeamsError] = useState<string | null>(null);
  const [selectedRaciTeamId, setSelectedRaciTeamId] = useState<string>('');
  const [savingRaciTeam, setSavingRaciTeam] = useState(false);
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

  const currentColumnBehavior = useMemo(() => {
    if (!detail) return null;
    if (detail.columnId && board?.columns) {
      const column = board.columns.find((entry) => entry.id === detail.columnId);
      if (column?.behaviorKey) {
        return column.behaviorKey;
      }
    }
    return detail.lastKnownColumnBehavior ?? null;
  }, [board, detail]);

  const isBacklogCard = currentColumnBehavior === 'BACKLOG';

  const backlogArchiveConfig = useMemo(() => {
    if (!isBacklogCard || !detail) {
      console.log('🔍 backlogArchiveConfig: conditions not met', { isBacklogCard, hasDetail: !!detail });
      return null;
    }
    
    // Essayer d'abord avec detail.board (qui peut avoir plus d'infos)
    const boardToUse = detail.board || board;
    if (!boardToUse) {
      console.log('🔍 No board available');
      return null;
    }
    
    const column = boardToUse.columns.find((c) => c.id === detail.columnId) as any;
    console.log('🔍 Found column:', column);
    if (!column?.settings) {
      console.log('🔍 No settings on column');
      return null;
    }
    const settings = column.settings as Record<string, any>;
    console.log('🔍 Column settings:', settings);
    let archiveAfterDaysValue: unknown;
    // Nouvelle logique: structure nested (backlog / done)
    if (column.behaviorKey === 'BACKLOG') {
      archiveAfterDaysValue = settings?.backlog?.archiveAfterDays;
    } else if (column.behaviorKey === 'DONE') {
      archiveAfterDaysValue = settings?.done?.archiveAfterDays;
    } else {
      // Fallback éventuel si d'autres comportements stockent directement archiveAfterDays à la racine
      archiveAfterDaysValue = (settings as any).archiveAfterDays;
    }
    console.log('🔍 archiveAfterDaysValue (nested):', archiveAfterDaysValue, 'type:', typeof archiveAfterDaysValue);
    const archiveAfterDays = typeof archiveAfterDaysValue === 'number' ? archiveAfterDaysValue : null;
    console.log('🔍 Final archiveAfterDays (nested):', archiveAfterDays);
    return archiveAfterDays;
  }, [isBacklogCard, detail, board]);

  // Config archivage pour colonnes DONE (pas de snooze)
  const doneArchiveConfig = useMemo(() => {
    if (!detail) return null;
    const boardToUse = detail.board || board;
    if (!boardToUse) return null;
    const column = boardToUse.columns.find((c) => c.id === detail.columnId) as any;
    if (!column || column.behaviorKey !== 'DONE') return null;
    if (!column.settings) return null;
    const settings = column.settings as Record<string, any>;
    const value = settings?.done?.archiveAfterDays ?? (settings as any).archiveAfterDays;
    return typeof value === 'number' ? value : null;
  }, [detail, board]);

  const backlogHiddenDisplay = useMemo(
    () => (backlogHiddenUntil ? formatDateLong(`${backlogHiddenUntil}T00:00:00Z`) : '—'),
    [backlogHiddenUntil, formatDateLong],
  );

  const snoozeCountdown = useMemo(
    () => describeSnoozeCountdown(backlogHiddenUntil),
    [backlogHiddenUntil, describeSnoozeCountdown],
  );

  const backlogAutomationLabels = useMemo(
    () => ({
      nextReview: formatDateTime(detail?.backlogNextReviewAt ?? null),
      lastReminder: formatDateTime(detail?.backlogLastReminderAt ?? null),
      reviewStarted: formatDateTime(detail?.backlogReviewStartedAt ?? null),
      lastInteraction: formatDateTime(detail?.backlogLastInteractionAt ?? null),
    }),
    [
      detail?.backlogNextReviewAt,
      detail?.backlogLastReminderAt,
      detail?.backlogReviewStartedAt,
      detail?.backlogLastInteractionAt,
      formatDateTime,
    ],
  );

  const archiveCountdown = useMemo(() => {
    if (!isBacklogCard || !detail || !board) return null;
  const column = board.columns.find((c) => c.id === detail.columnId);
  if (!column?.settings) return null;
  const settings = column.settings as Record<string, any>;
  let archiveAfterDaysValue: unknown;
  if (column.behaviorKey === 'BACKLOG') {
    archiveAfterDaysValue = settings?.backlog?.archiveAfterDays;
  } else if (column.behaviorKey === 'DONE') {
    archiveAfterDaysValue = settings?.done?.archiveAfterDays;
  } else {
    archiveAfterDaysValue = (settings as any).archiveAfterDays;
  }
  const archiveAfterDays = typeof archiveAfterDaysValue === 'number' ? archiveAfterDaysValue : null;
    if (archiveAfterDays === null) return null;
  // Prefer the last backlog interaction as the start of the countdown.
  // If missing, try the node creation date (if backend returns it) or the doneArchiveScheduledAt.
  const maybeCreated = (detail as any).createdAt ?? (detail as any).doneArchiveScheduledAt ?? null;
  const lastInteraction = detail.backlogLastInteractionAt || maybeCreated;
  if (!lastInteraction) return null;
  const lastDate = new Date(lastInteraction);
    if (Number.isNaN(lastDate.getTime())) return null;
    const archiveDate = new Date(lastDate.getTime() + archiveAfterDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diffMs = archiveDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    const isCritical = daysRemaining <= 7 && daysRemaining > 0;
    const isExpired = daysRemaining <= 0;
    return { daysRemaining, isCritical, isExpired, archiveDate, archiveAfterDays };
  }, [isBacklogCard, detail, board]);

  // Countdown pour DONE
  const doneArchiveCountdown = useMemo(() => {
    if (!detail || !board || doneArchiveConfig === null) return null;
    // Pour DONE on part de la dernière interaction backlog si disponible, sinon la date d'archivage (si déjà archivé) sinon pas de base
  // For DONE cards we prefer the last backlog interaction, otherwise fall back to
  // the creation date (if available), then doneArchiveScheduledAt, then archivedAt.
  const maybeCreated2 = (detail as any).createdAt ?? (detail as any).doneArchiveScheduledAt ?? null;
  const interaction = detail.backlogLastInteractionAt || maybeCreated2 || detail.archivedAt;
  if (!interaction) return null;
  const baseDate = new Date(interaction);
    if (Number.isNaN(baseDate.getTime())) return null;
    const archiveDate = new Date(baseDate.getTime() + doneArchiveConfig * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diffMs = archiveDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    const isCritical = daysRemaining <= 7 && daysRemaining > 0;
    const isExpired = daysRemaining <= 0;
    return { daysRemaining, isCritical, isExpired, archiveDate, archiveAfterDays: doneArchiveConfig };
  }, [detail, board, doneArchiveConfig]);

  const archiveCountdownLabel = useMemo(() => {
    if (!archiveCountdown) return null;
    if (archiveCountdown.isExpired) {
      return tBoard('taskDrawer.backlog.archiveCountdown.imminent');
    }
    if (archiveCountdown.isCritical) {
      return archiveCountdown.daysRemaining === 1
        ? tBoard('taskDrawer.backlog.archiveCountdown.criticalOne')
        : tBoard('taskDrawer.backlog.archiveCountdown.criticalOther', { count: archiveCountdown.daysRemaining });
    }
    return archiveCountdown.daysRemaining === 1
      ? tBoard('taskDrawer.backlog.archiveCountdown.scheduledOne')
      : tBoard('taskDrawer.backlog.archiveCountdown.scheduledOther', { count: archiveCountdown.daysRemaining });
  }, [archiveCountdown, tBoard]);

  const archiveCountdownDescription = useMemo(() => {
    if (!archiveCountdown) return null;
    if (archiveCountdown.isExpired || archiveCountdown.isCritical) {
      return tBoard('taskDrawer.backlog.archiveCountdown.criticalHint');
    }
    return tBoard('taskDrawer.backlog.archiveCountdown.scheduledHint', {
      date: formatDateMedium(archiveCountdown.archiveDate),
    });
  }, [archiveCountdown, formatDateMedium, tBoard]);

  const [resettingArchiveCounter, setResettingArchiveCounter] = useState(false);

  const handleArchiveCard = useCallback(async () => {
    if (!detail || !accessToken) return;
    
    const isArchived = !!detail.archivedAt;
    const confirmMessage = isArchived 
      ? tBoard('taskDrawer.confirm.unarchive')
      : tBoard('taskDrawer.confirm.archive');
    
    if (!window.confirm(confirmMessage)) return;
    
    setSaving(true);
    try {
      const newArchivedAt = isArchived ? null : new Date().toISOString();
      await updateNode(detail.id, { archivedAt: newArchivedAt }, accessToken);
  success(isArchived ? tBoard('taskDrawer.toasts.unarchived') : tBoard('taskDrawer.toasts.archived'));
      await refresh();
      
      // Si on désarchive, émettre un événement pour rafraîchir la liste des archivés
      if (isArchived && detail.columnId) {
        window.dispatchEvent(new CustomEvent('refreshArchivedNodes', { 
          detail: { columnId: detail.columnId } 
        }));
      }
      
      close();
      refreshActiveBoard();
    } catch (error) {
      console.error('Erreur archivage/désarchivage carte:', error);
  toastError(isArchived ? tBoard('taskDrawer.errors.unarchiveFailed') : tBoard('taskDrawer.errors.archiveFailed'));
    } finally {
      setSaving(false);
    }
  }, [detail, accessToken, success, refresh, close, refreshActiveBoard, toastError, tBoard]);

  const handleResetArchiveCounter = useCallback(async () => {
    if (!detail || !accessToken || !board?.id) return;
    setResettingArchiveCounter(true);
    try {
      const { resetBacklogArchiveCounter } = await import('@/features/nodes/nodes-api');
      await resetBacklogArchiveCounter(board.id, detail.id, accessToken);
  success(tBoard('taskDrawer.toasts.archiveCounterReset'));
      await refresh();
    } catch (error) {
      console.error('Erreur reset compteur archive:', error);
  toastError(tBoard('taskDrawer.errors.archiveCounterFailed'));
    } finally {
      setResettingArchiveCounter(false);
    }
  }, [detail, accessToken, board, refresh, success, toastError, tBoard]);

  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'planning' | 'raci' | 'collaborators' | 'time'>('details');
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

  const addBlockedEmail = useCallback(() => {
    const input = blockedEmailInput.trim();
    if (!input) return;
    
    // Séparer par point-virgule pour permettre l'ajout multiple
    const emails = input.split(';').map(e => e.trim().toLowerCase()).filter(e => e);
    
    if (emails.length === 0) return;
    
    const emailRegex = /.+@.+\..+/;
    const validEmails: string[] = [];
    const invalidEmails: string[] = [];
    
    for (const email of emails) {
      if (!emailRegex.test(email)) {
        invalidEmails.push(email);
      } else if (!blockedEmails.includes(email) && !validEmails.includes(email)) {
        validEmails.push(email);
      }
    }
    
    if (invalidEmails.length > 0) {
      toastError(tBoard('taskDrawer.errors.invalidEmail') + ': ' + invalidEmails.join(', '));
    }
    
    if (validEmails.length > 0) {
      setBlockedEmails((prev) => [...prev, ...validEmails]);
    }
    
    setBlockedEmailInput('');
  }, [blockedEmailInput, blockedEmails, toastError, tBoard]);

  const removeBlockedEmail = useCallback((email: string) => {
    setBlockedEmails((prev) => prev.filter((value) => value !== email));
  }, []);

  const previousNodeIdRef = useRef<string | null>(null);
  const previousBehaviorRef = useRef<string | null>(null);

  // Sync form when detail loads or node changes
  useEffect(() => {
    setSelectedRaciTeamId('');
    if (detail) {
      const nodeIdChanged = previousNodeIdRef.current !== detail.id;
      previousNodeIdRef.current = detail.id;
      
      const dDate = detail.dueAt ? detail.dueAt.substring(0,10) : '';
      setTitle(detail.title || '');
      setDescription(detail.description || '');
      setDueAt(dDate);
      setProgress(detail.progress ?? 0);
      setPriority(detail.priority ?? 'NONE');
      setEffort(detail.effort ?? null);
      setTags(detail.tags || []);
      // Blocage -> map values
      setBlockedReason((detail as Record<string, unknown>).blockedReason as string || '');
      setBlockedEmails(detail.blockedReminderEmails || []);
      setBlockedEmailInput('');
      setBlockedInterval(detail.blockedReminderIntervalDays != null ? String(detail.blockedReminderIntervalDays) : '');
      setBlockedEta(detail.blockedExpectedUnblockAt ? detail.blockedExpectedUnblockAt.substring(0,10) : '');
      setBlockedSince((detail as Record<string, unknown>).blockedSince as string | null || null);
      setIsBlockResolved((detail as Record<string, unknown>).isBlockResolved as boolean || false);
      setBacklogHiddenUntil(detail.backlogHiddenUntil ? detail.backlogHiddenUntil.substring(0, 10) : '');
      setBacklogRestartRequested(false);
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
        blocked: {
          reason: ((detail as Record<string, unknown>).blockedReason as string | undefined) ?? '',
          emails: detail.blockedReminderEmails ? [...detail.blockedReminderEmails] : [],
          interval: detail.blockedReminderIntervalDays != null ? String(detail.blockedReminderIntervalDays) : '',
          eta: detail.blockedExpectedUnblockAt ? detail.blockedExpectedUnblockAt.substring(0,10) : '',
          isResolved: ((detail as Record<string, unknown>).isBlockResolved as boolean | undefined) ?? false,
        },
        backlog: {
          hiddenUntil: detail.backlogHiddenUntil ? detail.backlogHiddenUntil.substring(0, 10) : '',
        },
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
      // Ne forcer 'details' que si c'est une nouvelle tâche
      if (nodeIdChanged) {
        setActiveTab('details');
      }
    } else {
      previousNodeIdRef.current = null;
      setTitle('');
      setDescription('');
      setDueAt('');
      setProgress(0);
      setPriority('NONE');
      setEffort(null);
      setTags([]);
      setBlockedReason('');
      setBlockedEmails([]);
      setBlockedEmailInput('');
      setBlockedInterval('');
      setBlockedEta('');
      setBlockedSince(null);
      setIsBlockResolved(false);
      setBacklogHiddenUntil('');
      setBacklogRestartRequested(false);
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

  // Effet pour vider les champs blocked quand on quitte la colonne BLOCKED
  useEffect(() => {
    if (!detail) return;
    
    const isCurrentlyBlocked = currentColumnBehavior === 'BLOCKED';
    
    // Si on n'est pas dans BLOCKED et qu'on a des données blocked non vides, les vider
    if (!isCurrentlyBlocked && (
      blockedReason !== '' ||
      blockedEmails.length > 0 ||
      blockedInterval !== '' ||
      blockedEta !== '' ||
      isBlockResolved
    )) {
      console.log('🧹 Clearing blocked fields - not in BLOCKED column anymore');
      setBlockedReason('');
      setBlockedEmails([]);
      setBlockedEmailInput('');
      setBlockedInterval('');
      setBlockedEta('');
      setIsBlockResolved(false);
    }
  }, [currentColumnBehavior, detail, blockedReason, blockedEmails, blockedInterval, blockedEta, isBlockResolved]);

  // Quand on entre dans la colonne BLOQUÉE, basculer une seule fois vers l'onglet Détails
  useEffect(() => {
    const prev = previousBehaviorRef.current;
    if (prev !== currentColumnBehavior && currentColumnBehavior === 'BLOCKED') {
      setActiveTab('details');
    }
    previousBehaviorRef.current = currentColumnBehavior ?? null;
  }, [currentColumnBehavior]);

  useEffect(() => {
    if (activeTab !== 'raci') return;
    if (!accessToken) return;
    let cancelled = false;
    setSavedRaciTeamsLoading(true);
    setSavedRaciTeamsError(null);
    fetchSavedRaciTeams(accessToken)
      .then((teams) => {
        if (cancelled) return;
        const sorted = [...teams].sort((a, b) =>
          a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
        );
        setSavedRaciTeams(sorted);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setSavedRaciTeamsError(
          fetchError instanceof Error
            ? fetchError.message
            : "Impossible de charger vos équipes enregistrées",
        );
        setSavedRaciTeams([]);
      })
      .finally(() => {
        if (!cancelled) setSavedRaciTeamsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, accessToken]);

  useEffect(() => {
    if (!selectedRaciTeamId) return;
    if (!savedRaciTeams.some((team) => team.id === selectedRaciTeamId)) {
      setSelectedRaciTeamId('');
    }
  }, [savedRaciTeams, selectedRaciTeamId]);

  const savedRaciTeamsCount = savedRaciTeams.length;

  const handleRResponsibleChange = useCallback((ids: string[]) => {
    setSelectedRaciTeamId('');
    setRResponsible(ids);
  }, []);

  const handleRAccountableChange = useCallback((ids: string[]) => {
    setSelectedRaciTeamId('');
    setRAccountable(ids);
  }, []);

  const handleRConsultedChange = useCallback((ids: string[]) => {
    setSelectedRaciTeamId('');
    setRConsulted(ids);
  }, []);

  const handleRInformedChange = useCallback((ids: string[]) => {
    setSelectedRaciTeamId('');
    setRInformed(ids);
  }, []);

  const applySavedRaciTeam = useCallback(
    (teamId: string) => {
      if (!teamId) {
        setSelectedRaciTeamId('');
        return;
      }
      const team = savedRaciTeams.find((entry) => entry.id === teamId);
      if (!team) return;
      setSelectedRaciTeamId(teamId);
      setRResponsible(team.raci.R);
      setRAccountable(team.raci.A);
      setRConsulted(team.raci.C);
      setRInformed(team.raci.I);
    },
    [savedRaciTeams],
  );

  const handleSelectSavedRaciTeam = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      applySavedRaciTeam(event.target.value);
    },
    [applySavedRaciTeam],
  );

  const handleSaveCurrentRaciTeam = useCallback(() => {
    if (!accessToken) {
      toastError(tBoard('taskDrawer.errors.sessionExpired'));
      return;
    }
    const totalSelected =
      rResponsible.length +
      rAccountable.length +
      rConsulted.length +
      rInformed.length;
    if (totalSelected === 0) {
      toastError(tBoard('taskDrawer.errors.emptyRaciSelection'));
      return;
    }
    const defaultName = `Équipe ${savedRaciTeamsCount + 1}`;
    const name = window.prompt(tBoard('taskDrawer.prompts.raciTeamName'), defaultName);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toastError(tBoard('taskDrawer.errors.invalidRaciName'));
      return;
    }
    setSavingRaciTeam(true);
    createSavedRaciTeam(
      {
        name: trimmed,
        raci: {
          R: rResponsible,
          A: rAccountable,
          C: rConsulted,
          I: rInformed,
        },
      },
      accessToken,
    )
      .then((team) => {
        setSavedRaciTeams((prev) => {
          const next = [...prev, team];
          return next.sort((a, b) =>
            a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
          );
        });
        setSelectedRaciTeamId(team.id);
        setSavedRaciTeamsError(null);
        success(tBoard('taskDrawer.toasts.raciTeamSaved'));
      })
      .catch(() => {
        toastError(tBoard('taskDrawer.errors.raciTeamSaveFailed'));
      })
      .finally(() => {
        setSavingRaciTeam(false);
      });
  }, [
    accessToken,
    rResponsible,
    rAccountable,
    rConsulted,
    rInformed,
    savedRaciTeamsCount,
    success,
    toastError,
    tBoard,
  ]);

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
      !arraysEqual(tags, initialSnapshot.tags)
    ) {
      return true;
    }

    const sortedBlocked = [...blockedEmails].map((email) => email.toLowerCase()).sort();
    const sortedSnapshotBlocked = [...initialSnapshot.blocked.emails].map((email) => email.toLowerCase()).sort();
    if (JSON.stringify(sortedBlocked) !== JSON.stringify(sortedSnapshotBlocked)) return true;
    if (blockedReason.trim() !== initialSnapshot.blocked.reason.trim()) return true;
    if (blockedInterval.trim() !== initialSnapshot.blocked.interval.trim()) return true;
    if (blockedEta.trim() !== initialSnapshot.blocked.eta.trim()) return true;
    if (isBlockResolved !== initialSnapshot.blocked.isResolved) return true;

    if (backlogHiddenUntil !== initialSnapshot.backlog.hiddenUntil) return true;
    if (backlogRestartRequested) return true;

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
    tags,
    blockedEmails,
    blockedReason,
    blockedInterval,
    blockedEta,
    isBlockResolved,
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
    backlogHiddenUntil,
    backlogRestartRequested,
  ]);

  const requestClose = useCallback(() => {
    if (hasDirty) {
      setShowUnsavedModal(true);
    } else {
      close();
    }
  }, [close, hasDirty]);

  const escHandler = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (showUnsavedModal) {
        setShowUnsavedModal(false);
        return;
      }
      requestClose();
    }
  }, [requestClose, showUnsavedModal]);

  useEffect(() => {
    if (openedNodeId) {
      window.addEventListener('keydown', escHandler);
      return () => window.removeEventListener('keydown', escHandler);
    }
  }, [openedNodeId, escHandler]);

  useEffect(() => {
    if (!openedNodeId) {
      setShowUnsavedModal(false);
    }
  }, [openedNodeId]);

  const onSave = async (): Promise<boolean> => {
    if (!detail || !accessToken) return false;
    if (!hasDirty) return false;
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
      (payload as Record<string, unknown>).blockedReason = blockedReason.trim() || null;
      payload.blockedReminderEmails = [...blockedEmails];
      (payload as Record<string, unknown>).isBlockResolved = isBlockResolved;
      if (blockedInterval.trim() === '') {
        payload.blockedReminderIntervalDays = null;
      } else {
        const intervalValue = Number(blockedInterval);
        payload.blockedReminderIntervalDays = Number.isNaN(intervalValue) ? null : intervalValue;
      }
      if (blockedEta.trim() === '') {
        payload.blockedExpectedUnblockAt = null;
      } else {
        payload.blockedExpectedUnblockAt = new Date(blockedEta + 'T00:00:00Z').toISOString();
      }
      if (backlogHiddenUntil.trim() === '') {
        payload.backlogHiddenUntil = null;
      } else {
        const snoozeDate = new Date(backlogHiddenUntil + 'T00:00:00Z');
        if (Number.isNaN(snoozeDate.getTime())) {
          toastError(tBoard('taskDrawer.errors.invalidBacklogSnooze'));
          return false;
        }
        payload.backlogHiddenUntil = snoozeDate.toISOString();
      }
      if (backlogRestartRequested) {
        payload.backlogReviewRestart = true;
      }
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
        return false;
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
  success(tBoard('taskDrawer.toasts.saved'));
      setInitialSnapshot({
        title: title.trim()||'',
        description: description.trim()===''? null : description,
        dueAt,
        progress,
        priority,
        effort,
        tags: [...tags],
        blocked: {
          reason: blockedReason.trim(),
          emails: [...blockedEmails],
          interval: blockedInterval,
          eta: blockedEta,
          isResolved: isBlockResolved,
        },
        backlog: {
          hiddenUntil: backlogHiddenUntil.trim(),
        },
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
      setBacklogRestartRequested(false);
      refresh();
      // Fermer le tiroir après une sauvegarde réussie comme demandé
      close();
      return true;
    } catch (e) {
  const msg = e instanceof Error ? e.message : tBoard('taskDrawer.errors.updateFailed');
  toastError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFromDialog = async () => {
    const saved = await onSave();
    if (saved) {
      setShowUnsavedModal(false);
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
            onClick={requestClose}
            aria-hidden="true"
          />
          <motion.aside
            key="panel"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={panelVariants}
            className="fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-white/10 bg-surface shadow-xl sm:w-[640px] md:w-[720px] lg:w-[840px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-drawer-title"
          >
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-2 min-w-0 pr-4 flex-1">
                <input
                  id="task-drawer-title"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); }}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-lg font-semibold focus:outline-none focus:ring focus:ring-emerald-500/40"
                  placeholder="Titre de la tâche"
                  disabled={saving}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleArchiveCard}
                  disabled={saving || !detail}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    detail?.archivedAt
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-600 hover:border-cyan-500 hover:bg-cyan-500/20 dark:text-cyan-400'
                      : 'border-orange-500/40 bg-orange-500/10 text-orange-600 hover:border-orange-500 hover:bg-orange-500/20 dark:text-orange-400'
                  }`}
                  title={detail?.archivedAt ? 'Désarchiver cette carte' : 'Archiver cette carte'}
                >
                  {detail?.archivedAt ? '📂 Désarchiver' : '📦 Archiver'}
                </button>
                <button
                  onClick={() => { void onSave(); }}
                  disabled={saving || !hasDirty}
                  className="rounded px-3 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >{saving ? '...' : 'Valider'}</button>
                <button
                  onClick={requestClose}
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
                      className={`flex-1 rounded px-3 py-2 font-medium transition flex items-center justify-center gap-1.5 ${activeTab === 'details' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                    ><span className="material-symbols-outlined text-[18px]">description</span> Détails</button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('comments')}
                      className={`flex-1 rounded px-3 py-2 font-medium transition flex items-center justify-center gap-1.5 ${activeTab === 'comments' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                    ><span className="material-symbols-outlined text-[18px]">chat_bubble</span> Commentaires</button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('planning')}
                      className={`flex-1 rounded px-3 py-2 font-medium transition flex items-center justify-center gap-1.5 ${activeTab === 'planning' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                    ><span className="material-symbols-outlined text-[18px]">calendar_month</span> Planning</button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('raci')}
                      className={`flex-1 rounded px-3 py-2 font-medium transition flex items-center justify-center gap-1.5 ${activeTab === 'raci' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                    ><span className="material-symbols-outlined text-[18px]">group</span> RACI</button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('collaborators')}
                      className={`flex-1 rounded px-3 py-2 font-medium transition flex items-center justify-center gap-1.5 ${activeTab === 'collaborators' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                    ><span className="material-symbols-outlined text-[18px]">lock</span> Accès</button>
                    {expertMode && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('time')}
                        className={`flex-1 rounded px-3 py-2 font-medium transition flex items-center justify-center gap-1.5 ${activeTab === 'time' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}
                      ><span className="material-symbols-outlined text-[18px]">schedule</span> Temps</button>
                    )}
                  </div>

                  {activeTab === 'details' && (
                    <div className="space-y-5">
                      <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[24px] text-slate-600 dark:text-slate-300">edit_note</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Description
                          </h3>
                        </div>
                        <textarea
                          value={description}
                          onChange={(e) => { setDescription(e.target.value); }}
                          rows={5}
                          className="w-full resize-y rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                          placeholder="Description de la tâche"
                          disabled={saving}
                        />
                      </section>

                      <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[24px] text-slate-600 dark:text-slate-300">checklist</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Sous-tâches
                          </h3>
                        </div>
                        <ChildTasksSection />
                      </section>

                      <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[24px] text-slate-600 dark:text-slate-300">bar_chart</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Progression
                          </h3>
                        </div>
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
                            onChange={(e)=>{
                              const v = parseInt(e.target.value, 10);
                              if (!Number.isNaN(v)) setProgress(Math.min(100, Math.max(0, v)));
                            }}
                            className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-center"
                            disabled={saving}
                          />
                          <span className="text-xs text-slate-500">%</span>
                        </div>
                      </section>
                    </div>
                  )}

                  {activeTab === 'comments' && detail && (
                    <CommentsSection
                      members={teamMembers}
                      membersLoading={membersLoading}
                      membersError={membersError}
                    />
                  )}

                  {activeTab === 'planning' && (
                    <div className="space-y-5">
                      <section className="space-y-4 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[24px] text-slate-600 dark:text-slate-300">event</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Planification
                          </h3>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                              Echéance
                            </span>
                            <input
                              type="date"
                              value={dueAt}
                              onChange={(e) => { setDueAt(e.target.value); }}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <span className="text-base">⚡</span>
                              {tBoard('filters.priority.title')}
                            </span>
                            <select
                              value={priority}
                              onChange={(e)=> setPriority(e.target.value as Priority)}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            >
                              <option value="NONE">{tBoard('priority.labels.NONE')}</option>
                              <option value="CRITICAL">{tBoard('priority.labels.CRITICAL')}</option>
                              <option value="HIGH">{tBoard('priority.labels.HIGH')}</option>
                              <option value="MEDIUM">{tBoard('priority.labels.MEDIUM')}</option>
                              <option value="LOW">{tBoard('priority.labels.LOW')}</option>
                              <option value="LOWEST">{tBoard('priority.labels.LOWEST')}</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <span className="text-base">⏱️</span>
                              {tBoard('filters.effort.title')}
                            </span>
                            <select
                              value={effort ?? ''}
                              onChange={(e)=> setEffort(e.target.value ? (e.target.value as Exclude<Effort, null>) : null)}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring focus:ring-emerald-500/40"
                              disabled={saving}
                            >
                              <option value="">{tBoard('taskDrawer.effort.none')}</option>
                              <option value="UNDER2MIN">{tBoard('filters.effort.options.UNDER2MIN')}</option>
                              <option value="XS">{tBoard('filters.effort.options.XS')}</option>
                              <option value="S">{tBoard('filters.effort.options.S')}</option>
                              <option value="M">{tBoard('filters.effort.options.M')}</option>
                              <option value="L">{tBoard('filters.effort.options.L')}</option>
                              <option value="XL">{tBoard('filters.effort.options.XL')}</option>
                              <option value="XXL">{tBoard('filters.effort.options.XXL')}</option>
                            </select>
                          </label>
                        </div>
                      </section>

                      {isBacklogCard && (
                        <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300 mb-3">
                            {tBoard('taskDrawer.lifecycle.title')}
                          </h3>

                          {/* Ligne 1: Snooze */}
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined text-[18px] text-sky-600 dark:text-sky-400">snooze</span>
                              <span className="text-sm text-slate-700 dark:text-slate-300">{tBoard('taskDrawer.backlog.snooze.label')}</span>
                              <div className="group relative">
                                <span className="material-symbols-outlined cursor-help text-[16px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">info</span>
                                <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-80 -translate-x-1/2 rounded-lg border border-sky-500/20 bg-slate-800 p-4 text-xs shadow-2xl group-hover:block">
                                  <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-sky-500/20 bg-slate-800"></div>
                                  <h4 className="mb-2 flex items-center gap-2 font-semibold text-sky-400">
                                    <span className="material-symbols-outlined text-[16px]">info</span>
                                    {tBoard('taskDrawer.backlog.snooze.tooltip.title')}
                                  </h4>
                                  <div className="space-y-2 text-slate-300">
                                    <p className="text-[11px]">{tBoard('taskDrawer.backlog.snooze.tooltip.description')}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex-shrink-0 w-48">
                              <input
                                type="date"
                                value={backlogHiddenUntil}
                                onChange={(event) => setBacklogHiddenUntil(event.target.value)}
                                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                                disabled={saving}
                              />
                            </div>
                          </div>
                          {backlogHiddenUntil && snoozeCountdown && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 ml-6">{snoozeCountdown}</p>
                          )}

                          {/* Ligne 2: Archivage automatique */}
                          {backlogArchiveConfig !== null ? (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`material-symbols-outlined text-[18px] ${
                                  archiveCountdown?.isExpired || archiveCountdown?.isCritical
                                    ? 'text-orange-600 dark:text-orange-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}>inventory_2</span>
                                <div className="min-w-0">
                                  <span className="text-sm text-slate-700 dark:text-slate-300">{tBoard('taskDrawer.lifecycle.autoArchive')}</span>
                                  <div className="group relative inline-block ml-1">
                                    <span className="material-symbols-outlined cursor-help text-[16px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">info</span>
                                    <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-96 -translate-x-1/2 rounded-lg border border-amber-500/20 bg-slate-800 p-4 text-xs shadow-2xl group-hover:block">
                                      <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-amber-500/20 bg-slate-800"></div>
                                      <h4 className="mb-2 flex items-center gap-2 font-semibold text-amber-400">
                                        <span className="material-symbols-outlined text-[16px]">info</span>
                                        {tBoard('taskDrawer.lifecycle.autoArchiveTooltip.title')}
                                      </h4>
                                      <div className="space-y-2 text-slate-300">
                                        <p className="text-[11px]">{tBoard('taskDrawer.lifecycle.autoArchiveTooltip.description')}</p>
                                        <p className="text-[11px]">{tBoard('taskDrawer.lifecycle.autoArchiveTooltip.why')}</p>
                                        <p className="text-[11px]">{tBoard('taskDrawer.lifecycle.autoArchiveTooltip.config')}</p>
                                      </div>
                                    </div>
                                  </div>
                                  {archiveCountdown && (
                                    <p className={`text-[11px] truncate ${
                                      archiveCountdown.isExpired
                                        ? 'text-red-600 dark:text-red-400'
                                        : archiveCountdown.isCritical
                                        ? 'text-orange-600 dark:text-orange-400'
                                        : 'text-slate-600 dark:text-slate-400'
                                    }`}>
                                      {tBoard('taskDrawer.backlog.archive.date', { date: formatDateMedium(archiveCountdown.archiveDate) })}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0 w-48">
                                <button
                                  type="button"
                                  onClick={handleResetArchiveCounter}
                                  disabled={resettingArchiveCounter || saving}
                                  className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600 transition hover:border-amber-500 hover:bg-amber-500/20 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-400 dark:hover:text-amber-300"
                                >
                                  {resettingArchiveCounter
                                    ? tBoard('taskDrawer.backlog.archive.extending')
                                    : tBoard('taskDrawer.backlog.archive.extend', { days: backlogArchiveConfig })}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 italic ml-6">
                              <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                              <span>{tBoard('taskDrawer.backlog.archive.disabled')}</span>
                            </div>
                          )}
                        </section>
                      )}

                      {/* Panneau "Gestion du cycle de vie" pour colonnes DONE (sans snooze) */}
                      {(() => {
                        const boardToUse = (detail.board || board);
                        const columns = boardToUse?.columns;
                        if (!columns) return null;
                        const currentCol = columns.find(c => c.id === detail.columnId);
                        const isDone = currentCol?.behaviorKey === 'DONE';
                        if (!isDone) return null;
                        
                        return (
                          <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                              {tBoard('taskDrawer.backlog.lifecycle.title')}
                            </h3>
                            
                            {/* Ligne unique: Archivage automatique */}
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400">inventory_2</span>
                                <span className="text-sm text-slate-700 dark:text-slate-300">
                                  {tBoard('taskDrawer.backlog.lifecycle.autoArchive')}
                                </span>
                                {/* Tooltip expliquant l'archivage pour DONE */}
                                <div className="group relative">
                                  <button
                                    type="button"
                                    className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[11px] text-slate-500 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500"
                                    aria-label="Info archivage automatique"
                                  >
                                    i
                                  </button>
                                  <div className="pointer-events-none invisible absolute left-0 top-6 z-50 w-80 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-800">
                                    <p className="font-semibold mb-1 text-slate-900 dark:text-slate-100">
                                      {tBoard('taskDrawer.backlog.lifecycle.autoArchiveTooltip.title')}
                                    </p>
                                    <p className="mb-2 text-slate-600 dark:text-slate-300">
                                      {tBoard('taskDrawer.backlog.lifecycle.autoArchiveTooltip.description')}
                                    </p>
                                    <p className="mb-2 text-slate-600 dark:text-slate-300">
                                      {tBoard('taskDrawer.backlog.lifecycle.autoArchiveTooltip.why')}
                                    </p>
                                    <p className="text-slate-600 dark:text-slate-300">
                                      {tBoard('taskDrawer.backlog.lifecycle.autoArchiveTooltip.config')}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {doneArchiveConfig !== null && doneArchiveCountdown && (
                                  <p className={`text-xs font-medium ${
                                    doneArchiveCountdown.isExpired || doneArchiveCountdown.isCritical
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-slate-600 dark:text-slate-400'
                                  }`}>
                                    {tBoard('taskDrawer.backlog.archive.date', { date: formatDateMedium(doneArchiveCountdown.archiveDate) })}
                                  </p>
                                )}
                                {doneArchiveConfig !== null ? (
                                  <button
                                    type="button"
                                    onClick={handleResetArchiveCounter}
                                    disabled={resettingArchiveCounter || saving}
                                    className="w-48 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600 transition hover:border-amber-500 hover:bg-amber-500/20 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-400 dark:hover:text-amber-300"
                                  >
                                    {resettingArchiveCounter
                                      ? tBoard('taskDrawer.backlog.archive.extending')
                                      : tBoard('taskDrawer.backlog.archive.extend', { days: doneArchiveConfig })}
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                                    {tBoard('taskDrawer.backlog.archive.disabled')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </section>
                        );
                      })()}

                      <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🏷️</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Tags
                          </h3>
                        </div>
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
                                if(raw.length>32) { toastError(tBoard('taskDrawer.errors.tagTooLong')); return; }
                                if(tags.length>=20) { toastError(tBoard('taskDrawer.errors.tagLimit')); return; }
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
                                if(raw.length>32) { toastError(tBoard('taskDrawer.errors.tagTooLong')); return; }
                                if(tags.length>=20) { toastError(tBoard('taskDrawer.errors.tagLimit')); return; }
                                setTags([...tags, raw]);
                                setTagInput('');
                              }}
                              className="px-2 py-1 text-xs rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
                            >Ajouter</button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">Entrée pour ajouter. Max 20, longueur ≤32. Doublons ignorés.</p>
                      </section>

                      {(() => {
                        const boardToUse = detail.board || board;
                        const columns = boardToUse?.columns;
                        if (!columns) return null;
                        const currentCol = columns.find(c => c.id === detail.columnId);
                        const isBlocked = currentCol?.behaviorKey === 'BLOCKED';
                        if (!isBlocked) return null;

                        return (
                          <section className="space-y-4 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[24px] text-rose-600 dark:text-rose-400">block</span>
                              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                                {tBoard('taskDrawer.blocked.title')}
                              </h3>
                            </div>

                            <label className="block text-xs text-slate-500 dark:text-slate-400">
                              <span className="mb-1 flex items-center gap-1.5">
                                <span className="text-base">📝</span>
                                {tBoard('taskDrawer.blocked.reason.label')}
                              </span>
                              <textarea
                                value={blockedReason}
                                onChange={e=>setBlockedReason(e.target.value)}
                                rows={3}
                                className="mt-1 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                                placeholder={tBoard('taskDrawer.blocked.reason.placeholder')}
                                disabled={saving}
                              />
                            </label>

                            <div className="space-y-2">
                              <label className="block text-xs text-slate-500 dark:text-slate-400">
                                <span className="mb-1 flex items-center gap-1.5">
                                  <span className="text-base">📧</span>
                                  {tBoard('taskDrawer.blocked.emails.label')}
                                </span>
                                <div className="space-y-2">
                                  {blockedEmails.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {blockedEmails.map((email) => (
                                        <span
                                          key={email}
                                          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-0.5 text-xs text-emerald-800 dark:text-emerald-200"
                                        >
                                          {email}
                                          <button
                                            type="button"
                                            onClick={() => removeBlockedEmail(email)}
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
                                    type="text"
                                    inputMode="email"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    name="blocked-reminder-list"
                                    data-bwignore
                                    data-bitwarden-watching="false"
                                    data-1p-ignore
                                    data-lpignore="true"
                                    value={blockedEmailInput}
                                    onChange={e=>setBlockedEmailInput(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addBlockedEmail();
                                      }
                                    }}
                                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                                    placeholder={tBoard('taskDrawer.blocked.emails.placeholder')}
                                    disabled={saving}
                                  />
                                </div>
                              </label>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-base">⏰</span>
                                  {tBoard('taskDrawer.blocked.interval.label')}
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={blockedInterval}
                                  onChange={e=>{
                                    const v = e.target.value;
                                    if (v === '') { setBlockedInterval(''); return; }
                                    // autoriser seulement des entiers positifs
                                    const n = Number(v);
                                    if (Number.isNaN(n) || n < 0) return;
                                    setBlockedInterval(String(Math.floor(n)));
                                  }}
                                  placeholder="0 = jamais"
                                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                                  disabled={saving}
                                />
                              </label>

                              <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-base">📅</span>
                                  {tBoard('taskDrawer.blocked.eta.label')}
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
                              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px]">push_pin</span> {tBoard('taskDrawer.blocked.since', { date: formatDateLong(blockedSince) })}
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
                              <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span> {tBoard('taskDrawer.blocked.resolved')}
                              </span>
                            </label>

                            <p className="text-[11px] text-slate-500 flex items-start gap-1">
                              <span className="material-symbols-outlined text-[14px] text-amber-500">info</span> {tBoard('taskDrawer.blocked.autoReminderInfo')}
                            </p>
                          </section>
                        );
                      })()}
                    </div>
                  )}

                  {activeTab === 'raci' && (
                    <div className="space-y-5">
                      <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-300">group</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Matrice RACI
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Assignez les rôles RACI pour clarifier les responsabilités autour de cette tâche.
                        </p>
                      </section>

                      {membersLoading && (
                        <div className="rounded-lg border border-white/10 bg-card/60 p-4 text-xs text-muted">
                          Chargement des membres…
                        </div>
                      )}
                      {membersError && (
                        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-xs text-red-500 dark:text-red-300">
                          {membersError}
                        </div>
                      )}

                      <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                              Équipes enregistrées
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Appliquez vos favoris RACI en un clic.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleSaveCurrentRaciTeam}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-emerald-500/50 hover:text-emerald-600 dark:text-slate-200 dark:hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={saving || savingRaciTeam}
                          >
                            💾 Enregistrer l’équipe
                          </button>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <select
                            value={selectedRaciTeamId}
                            onChange={handleSelectSavedRaciTeam}
                            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={savedRaciTeamsLoading || savedRaciTeams.length === 0}
                          >
                            <option value="">Sélectionner une équipe enregistrée</option>
                            {savedRaciTeams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name} — R:{team.raci.R.length} · A:{team.raci.A.length} · C:{team.raci.C.length} · I:{team.raci.I.length}
                              </option>
                            ))}
                          </select>
                        </div>
                        {savedRaciTeamsLoading && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Chargement de vos équipes enregistrées…
                          </p>
                        )}
                        {savedRaciTeamsError && (
                          <p className="text-[11px] text-red-500 dark:text-red-400">{savedRaciTeamsError}</p>
                        )}
                        {!savedRaciTeamsLoading && !savedRaciTeamsError && savedRaciTeams.length === 0 && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Aucune équipe enregistrée pour le moment.
                          </p>
                        )}
                      </section>

                      <section className="space-y-4 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">Rôles et responsabilités</h4>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                              <span className="material-symbols-outlined text-[18px] text-slate-500">person</span>
                              Responsable (R)
                            </label>
                            <MemberMultiSelect
                              label=""
                              members={teamMembers}
                              selectedIds={rResponsible}
                              onChange={handleRResponsibleChange}
                              disabled={saving}
                            />
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Personne(s) qui réalise(nt) la tâche.</p>
                          </div>

                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                              <span className="material-symbols-outlined text-[18px] text-slate-500">task_alt</span>
                              Approbateur (A)
                            </label>
                            <MemberMultiSelect
                              label=""
                              members={teamMembers}
                              selectedIds={rAccountable}
                              onChange={handleRAccountableChange}
                              disabled={saving}
                            />
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Personne qui valide le résultat.</p>
                          </div>

                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                              <span className="material-symbols-outlined text-[18px] text-slate-500">chat</span>
                              Consulté (C)
                            </label>
                            <MemberMultiSelect
                              label=""
                              members={teamMembers}
                              selectedIds={rConsulted}
                              onChange={handleRConsultedChange}
                              disabled={saving}
                            />
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Personne(s) consultée(s) avant décision.</p>
                          </div>

                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                              <span className="material-symbols-outlined text-[18px] text-slate-500">campaign</span>
                              Informé (I)
                            </label>
                            <MemberMultiSelect
                              label=""
                              members={teamMembers}
                              selectedIds={rInformed}
                              onChange={handleRInformedChange}
                              disabled={saving}
                            />
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Personne(s) tenue(s) informée(s) du résultat.</p>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}

                  {activeTab === 'collaborators' && (
                    <div className="space-y-5">
                      <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🤝</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Gestion des accès
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Invitez des collaborateurs pour partager cette tâche dans leur kanban. Les accès hérités sont affichés automatiquement.
                        </p>
                      </section>

                      <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">➕</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Ajouter un collaborateur
                          </h3>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(event) => setInviteEmail(event.target.value)}
                            placeholder="email@exemple.com"
                            className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-emerald-500/40"
                            disabled={inviteSubmitting}
                            aria-label="Email du collaborateur à inviter"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!detail?.id || !accessToken) return;
                              const trimmedEmail = inviteEmail.trim();
                              if (!trimmedEmail) {
                                toastError(tBoard('taskDrawer.errors.emptyCollaboratorEmail'));
                                return;
                              }
                              setInviteSubmitting(true);
                              inviteNodeCollaborator(detail.id, { email: trimmedEmail }, accessToken)
                                .then((response) => {
                                  setCollaborators(response.collaborators);
                                  setCollaboratorInvites(response.invitations);
                                  setCollaboratorsError(null);
                                  setInviteEmail('');
                                  success(tBoard('taskDrawer.toasts.collaboratorAdded'));
                                })
                                .catch((inviteError) => {
                                  const message = inviteError instanceof Error ? inviteError.message : tBoard('taskDrawer.errors.collaboratorInviteFailed');
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
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          L&apos;adresse doit correspondre à un compte Stratum. Sinon, une invitation restera en attente.
                        </p>
                        {membersError && (
                          <span className="text-xs text-red-500">{membersError}</span>
                        )}
                      </section>

                      <section className="space-y-3 rounded-lg border border-white/10 bg-card/60 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">👥</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Collaborateurs
                          </h3>
                        </div>
                        {collaboratorsLoading ? (
                          <div className="space-y-2">
                            {Array.from({ length: 3 }).map((_, index) => (
                              <div key={index} className="animate-pulse rounded border border-white/10 bg-white/5 p-3 dark:bg-white/5">
                                <div className="h-4 w-1/3 rounded bg-white/20" />
                                <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
                              </div>
                            ))}
                          </div>
                        ) : collaboratorsError ? (
                          <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {collaboratorsError}
                          </div>
                        ) : collaborators.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">Aucun collaborateur pour le moment.</p>
                        ) : (
                          <ul className="space-y-3">
                            {collaborators.map((collab) => {
                              const addedBy = collab.addedById ? membersMap.get(collab.addedById)?.displayName ?? collab.addedById : null;
                              const addedAtLabel = collab.addedAt ? new Date(collab.addedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : null;
                              return (
                                <li
                                  key={collab.userId}
                                  className="rounded border border-white/10 bg-white/5 p-3 dark:bg-white/5"
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium text-foreground">{collab.displayName}</p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">{collab.email}</p>
                                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
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
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
                                              success(tBoard('taskDrawer.toasts.collaboratorRemoved'));
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
                                        className="self-start rounded border border-white/20 px-3 py-1 text-xs font-medium text-red-300 transition hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
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
                      </section>

                      <section className="space-y-3 rounded-lg border border-white/10 bg-slate-500/5 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📧</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Invitations en attente
                          </h3>
                        </div>
                        {collaboratorInvites.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">Aucune invitation en attente.</p>
                        ) : (
                          <ul className="space-y-2 text-sm text-muted">
                            {collaboratorInvites.map((invite) => (
                              <li
                                key={`${invite.email}-${invite.invitedAt ?? 'pending'}`}
                                className="rounded border border-white/10 bg-white/5 px-3 py-2 dark:bg-white/5"
                              >
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium text-foreground">{invite.email}</span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    Statut : {invite.status === 'PENDING' ? 'En attente' : 'Acceptée'}
                                    {invite.invitedAt ? ` • Envoyée le ${new Date(invite.invitedAt).toLocaleDateString('fr-FR', { dateStyle: 'medium' })}` : ''}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </div>
                  )}

                  {expertMode && activeTab === 'time' && (
                    <div className="space-y-5">
                      <section className="space-y-3 rounded-lg border border-white/10 bg-slate-500/5 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">⏱️</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Temps et effort
                          </h3>
                        </div>
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

                      <section className="space-y-3 rounded-lg border border-white/10 bg-slate-500/5 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">💰</span>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                            Coûts et budgets
                          </h3>
                        </div>
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
          {showUnsavedModal && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowUnsavedModal(false)} aria-hidden="true" />
              <div className="relative z-10 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Modifications non sauvegardées</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Vous avez des changements non sauvegardés. Voulez-vous les enregistrer avant de fermer&nbsp;?
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    onClick={() => { void handleSaveFromDialog(); }}
                    disabled={saving}
                  >{saving ? 'Sauvegarde…' : 'Sauvegarder'}</button>
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={() => {
                      setShowUnsavedModal(false);
                      close();
                    }}
                  >Fermer sans sauvegarder</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatePresence>
  );
};
