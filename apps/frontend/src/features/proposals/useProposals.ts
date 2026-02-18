import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveProposal,
  applyProposal,
  fetchProposal,
  fetchProposalExplanation,
  rejectProposal,
  rollbackProposal,
  validateProposal,
} from './proposals-api';

export const proposalKeys = {
  all: ['proposals'] as const,
  detail: (workspaceId: string, proposalId: string) =>
    ['proposals', workspaceId, proposalId] as const,
  explanation: (workspaceId: string, proposalId: string) =>
    ['proposals', workspaceId, proposalId, 'explain'] as const,
};

export function useProposal(workspaceId: string, proposalId: string) {
  return useQuery({
    queryKey: proposalKeys.detail(workspaceId, proposalId),
    queryFn: () => fetchProposal(workspaceId, proposalId),
    enabled: Boolean(workspaceId && proposalId),
    staleTime: 5_000,
  });
}

export function useProposalExplanation(
  workspaceId: string,
  proposalId: string,
  enabled = false,
) {
  return useQuery({
    queryKey: proposalKeys.explanation(workspaceId, proposalId),
    queryFn: () => fetchProposalExplanation(workspaceId, proposalId),
    enabled: enabled && Boolean(workspaceId && proposalId),
    staleTime: 30_000,
  });
}

export function useProposalTransition(workspaceId: string) {
  const queryClient = useQueryClient();

  const invalidate = (proposalId: string) =>
    queryClient.invalidateQueries({
      queryKey: proposalKeys.detail(workspaceId, proposalId),
    });

  const validate = useMutation({
    mutationFn: (proposalId: string) =>
      validateProposal(workspaceId, proposalId),
    onSuccess: (_, proposalId) => invalidate(proposalId),
  });

  const approve = useMutation({
    mutationFn: (proposalId: string) =>
      approveProposal(workspaceId, proposalId),
    onSuccess: (_, proposalId) => invalidate(proposalId),
  });

  const apply = useMutation({
    mutationFn: (proposalId: string) =>
      applyProposal(workspaceId, proposalId),
    onSuccess: async (_, proposalId) => {
      await Promise.all([
        invalidate(proposalId),
        queryClient.invalidateQueries({ queryKey: ['board'] }),
      ]);
    },
  });

  const reject = useMutation({
    mutationFn: (proposalId: string) =>
      rejectProposal(workspaceId, proposalId),
    onSuccess: (_, proposalId) => invalidate(proposalId),
  });

  const rollback = useMutation({
    mutationFn: (proposalId: string) =>
      rollbackProposal(workspaceId, proposalId),
    onSuccess: async (_, proposalId) => {
      await Promise.all([
        invalidate(proposalId),
        queryClient.invalidateQueries({ queryKey: ['board'] }),
      ]);
    },
  });

  return { validate, approve, apply, reject, rollback };
}
