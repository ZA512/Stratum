"use client";

import { useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { useProposal, useProposalExplanation, useProposalTransition } from './useProposals';
import type { Proposal, ProposalAction } from './proposals-api';

type ProposalPanelProps = {
  workspaceId: string;
  proposalId: string;
  onClose: () => void;
};

export function ProposalPanel({
  workspaceId,
  proposalId,
  onClose,
}: ProposalPanelProps) {
  const { success, error: toastError } = useToast();
  const { data: proposal, isLoading, error } = useProposal(workspaceId, proposalId);
  const [showExplanation, setShowExplanation] = useState(false);
  const { data: explanation } = useProposalExplanation(
    workspaceId,
    proposalId,
    showExplanation,
  );
  const transitions = useProposalTransition(workspaceId);

  const handleTransition = async (
    action: 'validate' | 'approve' | 'apply' | 'reject' | 'rollback',
  ) => {
    try {
      await transitions[action].mutateAsync(proposalId);
      const labels: Record<string, string> = {
        validate: 'validee',
        approve: 'approuvee',
        apply: 'appliquee',
        reject: 'rejetee',
        rollback: 'annulee',
      };
      success(`Proposal ${labels[action]}`);
      if (action === 'apply' || action === 'reject') {
        onClose();
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const isTransitioning =
    transitions.validate.isPending ||
    transitions.approve.isPending ||
    transitions.apply.isPending ||
    transitions.reject.isPending ||
    transitions.rollback.isPending;

  if (isLoading) {
    return (
      <PanelShell onClose={onClose}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-3/4 rounded bg-white/10" />
          <div className="h-3 w-1/2 rounded bg-white/10" />
          <div className="h-20 rounded bg-white/10" />
        </div>
      </PanelShell>
    );
  }

  if (error || !proposal) {
    return (
      <PanelShell onClose={onClose}>
        <p className="text-sm text-red-400">
          {error instanceof Error ? error.message : 'Proposal introuvable'}
        </p>
      </PanelShell>
    );
  }

  return (
    <PanelShell onClose={onClose}>
      {/* Header */}
      <div className="border-b border-white/10 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">Proposal</h3>
          <StatusBadge status={proposal.status} />
        </div>
        <p className="mt-1 text-sm text-foreground/90">{proposal.intent}</p>
        {proposal.confidenceScore != null && (
          <ConfidenceBar score={proposal.confidenceScore} />
        )}
      </div>

      {/* Actions list */}
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-muted">
          {proposal.actions.length} action(s)
        </p>
        {proposal.actions
          .sort((a, b) => a.ordering - b.ordering)
          .map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
      </div>

      {/* Explanation toggle */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowExplanation((v) => !v)}
          className="text-xs text-accent underline-offset-2 hover:underline"
        >
          {showExplanation ? 'Masquer les details' : 'Voir les details'}
        </button>
        {showExplanation && explanation && (
          <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-muted">
            <p>
              <span className="font-medium text-foreground">Raisonnement:</span>{' '}
              {explanation.reasoning}
            </p>
            {explanation.entitiesAffected.length > 0 && (
              <p>
                <span className="font-medium text-foreground">Entites:</span>{' '}
                {explanation.entitiesAffected.join(', ')}
              </p>
            )}
            {explanation.ruleViolations.length > 0 && (
              <p className="text-amber-300">
                <span className="font-medium">Violations:</span>{' '}
                {explanation.ruleViolations.join(', ')}
              </p>
            )}
            {explanation.promptVersion && (
              <p>
                <span className="font-medium text-foreground">Prompt:</span>{' '}
                v{explanation.promptVersion}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Transition buttons */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
        {proposal.status === 'DRAFT' && (
          <>
            <TransitionButton
              label="Valider"
              onClick={() => handleTransition('validate')}
              disabled={isTransitioning}
              variant="primary"
            />
            <TransitionButton
              label="Rejeter"
              onClick={() => handleTransition('reject')}
              disabled={isTransitioning}
              variant="danger"
            />
          </>
        )}
        {proposal.status === 'VALIDATED' && (
          <>
            <TransitionButton
              label="Approuver"
              onClick={() => handleTransition('approve')}
              disabled={isTransitioning}
              variant="primary"
            />
            <TransitionButton
              label="Rejeter"
              onClick={() => handleTransition('reject')}
              disabled={isTransitioning}
              variant="danger"
            />
          </>
        )}
        {proposal.status === 'APPROVED' && (
          <TransitionButton
            label="Appliquer"
            onClick={() => handleTransition('apply')}
            disabled={isTransitioning}
            variant="accent"
          />
        )}
        {proposal.status === 'APPLIED' && (
          <TransitionButton
            label="Rollback"
            onClick={() => handleTransition('rollback')}
            disabled={isTransitioning}
            variant="danger"
          />
        )}
      </div>
    </PanelShell>
  );
}

// --- Sub-components ---

function PanelShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-start p-4 sm:items-center sm:justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        aria-label="Fermer le panneau proposal"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-surface p-4 shadow-2xl sm:p-5">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1 text-muted transition hover:text-foreground"
          aria-label="Fermer"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Proposal['status'] }) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    VALIDATED: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    APPROVED: 'bg-green-500/20 text-green-300 border-green-500/30',
    APPLIED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    REJECTED: 'bg-red-500/20 text-red-300 border-red-500/30',
    ROLLED_BACK: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? 'bg-white/10 text-muted border-white/10'}`}
    >
      {status}
    </span>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.8
      ? 'bg-green-400'
      : score >= 0.5
        ? 'bg-amber-400'
        : 'bg-red-400';
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-muted">{pct}%</span>
    </div>
  );
}

function ActionCard({ action }: { action: ProposalAction }) {
  const labels: Record<string, string> = {
    CREATE_NODE: 'Creer',
    UPDATE_NODE: 'Modifier',
    MOVE_NODE: 'Deplacer',
    DELETE_NODE: 'Supprimer',
  };
  return (
    <div className="rounded-lg border border-white/10 bg-card/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
          {labels[action.actionType] ?? action.actionType}
        </span>
        <span className="text-xs text-muted">
          {action.entityType}
          {action.entityId ? ` · ${action.entityId.slice(0, 8)}...` : ''}
        </span>
      </div>
      {Object.keys(action.payload).length > 0 && (
        <pre className="mt-1 overflow-x-auto text-[10px] text-muted">
          {JSON.stringify(action.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TransitionButton({
  label,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant: 'primary' | 'accent' | 'danger';
}) {
  const styles = {
    primary:
      'border-white/20 text-foreground hover:border-accent/60',
    accent:
      'bg-accent text-white hover:bg-accent/90',
    danger:
      'border-red-400/40 text-red-300 hover:border-red-300',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
    >
      {label}
    </button>
  );
}
