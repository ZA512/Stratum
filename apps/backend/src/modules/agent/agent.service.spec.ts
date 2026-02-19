import { ForbiddenException } from '@nestjs/common';

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return {
    ...actual,
    ProposalStatus: {
      ...(actual.ProposalStatus ?? {}),
      DRAFT: 'DRAFT',
    },
    EventActorType: {
      ...(actual.EventActorType ?? {}),
      USER: 'USER',
    },
    EventSource: {
      ...(actual.EventSource ?? {}),
      AGENT: 'AGENT',
    },
    MembershipStatus: {
      ...(actual.MembershipStatus ?? {}),
      ACTIVE: 'ACTIVE',
    },
  };
});

import { AgentService } from './agent.service';

function createMocks() {
  const prisma = {
    board: {
      findUnique: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
    proposal: {
      create: jest.fn(),
    },
    eventLog: {
      create: jest.fn(),
    },
  } as any;

  const killSwitch = {
    assertAgentAllowed: jest.fn(),
  } as any;

  const metrics = {
    recordProposalCreated: jest.fn(),
    recordCommand: jest.fn(),
    recordChat: jest.fn(),
  } as any;

  return { prisma, killSwitch, metrics };
}

describe('AgentService', () => {
  it('creates a draft proposal in command mode and records metrics', async () => {
    const { prisma, killSwitch, metrics } = createMocks();
    prisma.board.findUnique.mockResolvedValue({
      ownerUserId: 'user-1',
      node: { teamId: 'team-1' },
    });
    prisma.proposal.create.mockResolvedValue({
      id: 'proposal-1',
      status: 'DRAFT',
    });
    prisma.eventLog.create.mockResolvedValue({ id: 'event-1' });

    const service = new AgentService(prisma, killSwitch, metrics);

    const result = await service.command('workspace-1', 'user-1', {
      intent: '  Réorganise les tâches  ',
    });

    expect(killSwitch.assertAgentAllowed).toHaveBeenCalledWith(
      'workspace-1',
      'command',
    );
    expect(prisma.proposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace-1',
          intent: 'Réorganise les tâches',
          requestedByUserId: 'user-1',
        }),
      }),
    );
    expect(result.proposalId).toBe('proposal-1');
    expect(result.mode).toBe('command');
    expect(result.proposalStatus).toBe('DRAFT');
    expect(metrics.recordProposalCreated).toHaveBeenCalledTimes(1);
    expect(metrics.recordCommand).toHaveBeenCalledWith(expect.any(Number));
  });

  it('returns chat answer with suggested command payload and records metrics', async () => {
    const { prisma, killSwitch, metrics } = createMocks();
    prisma.board.findUnique.mockResolvedValue({
      ownerUserId: null,
      node: { teamId: 'team-1' },
    });
    prisma.membership.findFirst.mockResolvedValue({ id: 'membership-1' });
    prisma.eventLog.create.mockResolvedValue({ id: 'event-1' });

    const service = new AgentService(prisma, killSwitch, metrics);

    const result = await service.chat('workspace-1', 'user-1', {
      message: '  Que prioriser ?  ',
      context: { focusNodeId: 'node-1' },
    });

    expect(killSwitch.assertAgentAllowed).toHaveBeenCalledWith(
      'workspace-1',
      'chat',
    );
    expect(result.answer).toContain('priorisation');
    expect(result.suggestedCommandPayload?.intent).toContain('Que prioriser ?');
    expect(result.suggestedCommandPayload?.context).toEqual({
      focusNodeId: 'node-1',
    });
    expect(metrics.recordChat).toHaveBeenCalledWith(expect.any(Number));
  });

  it('throws ForbiddenException on personal workspace owned by another user', async () => {
    const { prisma, killSwitch, metrics } = createMocks();
    prisma.board.findUnique.mockResolvedValue({
      ownerUserId: 'owner-user',
      node: { teamId: 'team-1' },
    });

    const service = new AgentService(prisma, killSwitch, metrics);

    await expect(
      service.command('workspace-1', 'user-1', {
        intent: 'Réorganise',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(metrics.recordCommand).toHaveBeenCalledWith(expect.any(Number), true);
  });

  it('propagates kill-switch errors and records command failures', async () => {
    const { prisma, killSwitch, metrics } = createMocks();
    killSwitch.assertAgentAllowed.mockImplementation(() => {
      throw new ForbiddenException('agent disabled');
    });

    const service = new AgentService(prisma, killSwitch, metrics);

    await expect(
      service.command('workspace-1', 'user-1', { intent: 'Réorganise' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(metrics.recordCommand).toHaveBeenCalledWith(expect.any(Number), true);
    expect(prisma.proposal.create).not.toHaveBeenCalled();
  });
});