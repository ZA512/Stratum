import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { NodesService } from './nodes.service';
import { MembershipStatus, ColumnBehaviorKey } from '@prisma/client';
import { MailService } from '../mail/mail.service';

// Ce test se concentre sur l'auto-création du board et des colonnes lors de la création de sous-tâche.
// Simplifié: on mock Prisma pour vérifier les appels structurels, sans toucher à la BD réelle.

type MockCtx = {
  board: any[];
  column: any[];
  columnBehavior: any[];
  node: any[];
  membership: any[];
};

function createMockPrisma(existingCtx?: MockCtx): PrismaService & any {
  const ctx: MockCtx =
    existingCtx ??
    ({
      board: [],
      column: [],
      columnBehavior: [],
      node: [],
      membership: [],
    } as MockCtx);

  const client: any = {
    _ctx: ctx,
    node: {
      findUnique: jest.fn(async ({ where, include }) => {
        const n = ctx.node.find((node) => node.id === where.id);
        if (!n) return null;

        const withBase = { ...n };

        if (include?.board) {
          const boardRecord = ctx.board.find(
            (board) => board.nodeId === n.id || board.id === where.id,
          );
          if (boardRecord) {
            const boardColumns = ctx.column
              .filter((column) => column.boardId === boardRecord.id)
              .map((column) => ({
                ...column,
                behavior: ctx.columnBehavior.find(
                  (behavior) => behavior.id === column.behaviorId,
                ),
              }));
            withBase.board = { ...boardRecord, columns: boardColumns };
          } else {
            withBase.board = null;
          }
        }

        if (include?.children) {
          const children = ctx.node
            .filter((child) => child.parentId === n.id)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((child) => {
              const column = ctx.column.find((col) => col.id === child.columnId);
              const behavior = column
                ? ctx.columnBehavior.find((b) => b.id === column.behaviorId)
                : null;
              return {
                id: child.id,
                title: child.title,
                columnId: child.columnId,
                column: column
                  ? {
                      id: column.id,
                      behavior: behavior ? { key: behavior.key } : null,
                    }
                  : null,
              };
            });
          withBase.children = children;
        }

        if (include?.assignments) {
          withBase.assignments = [];
        }

        if (include?.comments) {
          withBase.comments = [];
        }

        return withBase;
      }),
      aggregate: jest.fn(async ({ where }) => {
        const filtered = ctx.node.filter(
          (node) =>
            node.parentId === where.parentId &&
            node.columnId === where.columnId,
        );
        const max = filtered.reduce(
          (acc, node) => (node.position > acc ? node.position : acc),
          0,
        );
        return { _max: { position: filtered.length ? max : null } };
      }),
      create: jest.fn(async ({ data }) => {
        const record = {
          ...data,
          statusMetadata: data.statusMetadata ?? {
            startedAt: null,
            doneAt: null,
          },
          metadata: data.metadata ?? {},
          blockedReminderEmails: data.blockedReminderEmails ?? [],
          blockedReminderIntervalDays: data.blockedReminderIntervalDays ?? null,
          blockedReminderLastSentAt: data.blockedReminderLastSentAt ?? null,
          blockedReason: data.blockedReason ?? null,
          blockedExpectedUnblockAt: data.blockedExpectedUnblockAt ?? null,
          blockedSince: data.blockedSince ?? null,
          isBlockResolved: data.isBlockResolved ?? false,
          archivedAt: data.archivedAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        ctx.node.push(record);
        return record;
      }),
      update: jest.fn(async ({ where, data }) => {
        const idx = ctx.node.findIndex((node) => node.id === where.id);
        if (idx === -1) throw new Error('node not found');
        ctx.node[idx] = { ...ctx.node[idx], ...data };
        return ctx.node[idx];
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        ctx.node = ctx.node.map((node) => {
          const matchParent =
            where.parentId === undefined || node.parentId === where.parentId;
          const matchColumn =
            where.columnId === undefined || node.columnId === where.columnId;
          if (matchParent && matchColumn) {
            count += 1;
            const increment = data?.position?.increment ?? 0;
            return {
              ...node,
              position: (node.position ?? 0) + increment,
            };
          }
          return node;
        });
        return { count };
      }),
      count: jest.fn(async ({ where }) =>
        ctx.node.filter((node) => {
          const matchParent =
            where.parentId === undefined || node.parentId === where.parentId;
          const matchColumn =
            where.columnId === undefined || node.columnId === where.columnId;
          const matchArchived =
            where.archivedAt === undefined
              ? true
              : where.archivedAt === null
              ? node.archivedAt === null || node.archivedAt === undefined
              : node.archivedAt === where.archivedAt;
          return matchParent && matchColumn && matchArchived;
        }).length,
      ),
      findMany: jest.fn(async ({ where = {}, select, orderBy }) => {
        let results = ctx.node.filter((node) => {
          if (where.parentId !== undefined && node.parentId !== where.parentId)
            return false;
          if (where.columnId !== undefined && node.columnId !== where.columnId)
            return false;
          if (where.column?.behavior?.key) {
            const column = ctx.column.find((col) => col.id === node.columnId);
            const behavior = column
              ? ctx.columnBehavior.find((b) => b.id === column.behaviorId)
              : null;
            if (!behavior || behavior.key !== where.column.behavior.key)
              return false;
          }
          if (where.archivedAt === null) {
            if (!(node.archivedAt === null || node.archivedAt === undefined))
              return false;
          }
          if (
            where.blockedReminderIntervalDays?.not !== undefined &&
            where.blockedReminderIntervalDays?.not !== null
          ) {
            if (node.blockedReminderIntervalDays === null)
              return false;
          }
          return true;
        });
        if (orderBy?.position === 'asc') {
          results = results.sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0),
          );
        } else if (orderBy?.position === 'desc') {
          results = results.sort(
            (a, b) => (b.position ?? 0) - (a.position ?? 0),
          );
        }
        if (!select) {
          return results.map((node) => ({ ...node }));
        }
        return results.map((node) => {
          const entry: any = {};
          for (const key of Object.keys(select)) {
            const descriptor = (select as any)[key];
            if (!descriptor) continue;
            if (key === 'column') {
              const column = ctx.column.find((col) => col.id === node.columnId);
              if (!column) {
                entry.column = null;
              } else if (descriptor.select?.behavior?.select?.key) {
                const behavior = ctx.columnBehavior.find(
                  (b) => b.id === column.behaviorId,
                );
                entry.column = {
                  behavior: behavior ? { key: behavior.key } : null,
                };
              } else {
                entry.column = { ...column };
              }
            } else if (descriptor === true) {
              entry[key] = (node as any)[key];
            }
          }
          return entry;
        });
      }),
    },
    board: {
      findUnique: jest.fn(async ({ where, include }) => {
        const boardRecord = ctx.board.find(
          (board) => board.nodeId === where.nodeId || board.id === where.id,
        );
        if (!boardRecord) return null;

        if (include?.columns || include?.include?.columns) {
          const boardColumns = ctx.column
            .filter((column) => column.boardId === boardRecord.id)
            .map((column) => ({
              ...column,
              behavior: ctx.columnBehavior.find(
                (behavior) => behavior.id === column.behaviorId,
              ),
            }));
          return { ...boardRecord, columns: boardColumns };
        }

        if (include?.select?.columns) {
          const boardColumns = ctx.column
            .filter((column) => column.boardId === boardRecord.id)
            .map((column) => ({
              id: column.id,
              behavior: {
                key:
                  ctx.columnBehavior.find(
                    (behavior) => behavior.id === column.behaviorId,
                  )?.key ?? null,
              },
            }));
          return { id: boardRecord.id, columns: boardColumns };
        }

        return boardRecord;
      }),
      create: jest.fn(async ({ data }) => {
        const record = {
          id: data.id ?? 'board-' + (ctx.board.length + 1),
          nodeId: data.nodeId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        ctx.board.push(record);
        return record;
      }),
    },
    columnBehavior: {
      findMany: jest.fn(async ({ where }) =>
        ctx.columnBehavior.filter(
          (behavior) =>
            behavior.teamId === where.teamId &&
            (!where.key?.in || where.key.in.includes(behavior.key)),
        ),
      ),
      create: jest.fn(async ({ data }) => {
        const record = {
          id: 'beh-' + (ctx.columnBehavior.length + 1),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        ctx.columnBehavior.push(record);
        return record;
      }),
    },
    column: {
      create: jest.fn(async ({ data }) => {
        const record = {
          id: 'col-' + (ctx.column.length + 1),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        ctx.column.push(record);
        return record;
      }),
      findUnique: jest.fn(async ({ where, include }) => {
        const column = ctx.column.find((entry) => entry.id === where.id);
        if (!column) return null;
        if (include?.behavior) {
          const behavior = ctx.columnBehavior.find(
            (b) => b.id === column.behaviorId,
          );
          return { ...column, behavior };
        }
        return { ...column };
      }),
    },
    membership: {
      findFirst: jest.fn(async ({ where }) =>
        ctx.membership.find(
          (membership) =>
            membership.userId === where.userId &&
            membership.teamId === where.teamId &&
            membership.status === MembershipStatus.ACTIVE,
        ) || null,
      ),
    },
  };

  client.$transaction = jest.fn(async (cb: any) => cb(client));

  return client as PrismaService & any;
}

describe('NodesService ensureBoard auto-create', () => {
let service: NodesService;
let mailService: { sendMail: jest.Mock };
  let prisma: any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    // seed membership + parent node simple
    prisma._ctx.membership.push({ id: 'm1', userId: 'u1', teamId: 't1', status: MembershipStatus.ACTIVE });
    prisma._ctx.node.push({
      id: 'parent-1',
      teamId: 't1',
      parentId: null,
      title: 'Parent',
      description: null,
      path: '/parent-1',
      depth: 0,
      position: 0,
      createdById: 'u1',
      columnId: null,
      dueAt: null,
      statusMetadata: null,
      blockedReminderEmails: [],
      blockedReminderIntervalDays: null,
      blockedReason: null,
      blockedExpectedUnblockAt: null,
      blockedSince: null,
      isBlockResolved: false,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mailService = {
      sendMail: jest.fn(async () => {}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodesService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(NodesService);
  });

  it('crée board + 4 colonnes lors de la première sous-tâche', async () => {
    const detail = await service.createChildNode('parent-1', { title: 'Child A' } as any, 'u1');
    expect(prisma.board.create).toHaveBeenCalled();
    const cols = prisma._ctx.column;
    const behaviors = prisma._ctx.columnBehavior;
    expect(cols.length).toBe(4);
    expect(behaviors.filter((b: any) => [ColumnBehaviorKey.BACKLOG, ColumnBehaviorKey.IN_PROGRESS, ColumnBehaviorKey.BLOCKED, ColumnBehaviorKey.DONE].includes(b.key)).length).toBe(4);
    expect(detail.children.length).toBe(1);
  });

  it('ne recrée pas un second board/colonnes à la deuxième sous-tâche', async () => {
    await service.createChildNode('parent-1', { title: 'Child A' } as any, 'u1');
    const boardCreateCalls = (prisma.board.create as jest.Mock).mock.calls.length;
    await service.createChildNode('parent-1', { title: 'Child B' } as any, 'u1');
    expect((prisma.board.create as jest.Mock).mock.calls.length).toBe(boardCreateCalls);
    expect(prisma._ctx.column.length).toBe(4);
  });

  it('initialise le workflow backlog lors de la création d’une sous-tâche', async () => {
    const detail = await service.createChildNode(
      'parent-1',
      { title: 'Workflow child' } as any,
      'u1',
    );
    const ctx = (prisma as any)._ctx;
    const childId = detail.children[detail.children.length - 1].id;
    const nodeRecord = ctx.node.find((n: any) => n.id === childId);
    expect(nodeRecord.metadata.workflow).toBeDefined();
    expect(nodeRecord.metadata.workflow.backlog.lastKnownColumnId).toBeDefined();
    expect(nodeRecord.metadata.workflow.backlog.nextReviewAt).toBeDefined();
    expect(nodeRecord.metadata.workflow.backlog.hiddenUntil).toBeNull();
  });

  it('toggleChildDone renseigne doneAt à la première complétion', async () => {
    const detailAfterCreate = await service.createChildNode('parent-1', { title: 'Task 1' } as any, 'u1');
    const childId = detailAfterCreate.children[0].id;
    const updated = await service.toggleChildDone('parent-1', childId, 'u1');
    const child = prisma._ctx.node.find((n: any) => n.id === childId);
    expect(child.statusMetadata.doneAt).toBeDefined();
  });

  it('moveChildNode vers IN_PROGRESS définit startedAt une seule fois', async () => {
    await service.createChildNode('parent-1', { title: 'Task 2' } as any, 'u1');
    const board = prisma._ctx.board[0];
    const columns = prisma._ctx.column.filter((c: any) => c.boardId === board.id);
    const backlogCol = columns.find((c: any) => prisma._ctx.columnBehavior.find((b: any) => b.id === c.behaviorId && b.key === ColumnBehaviorKey.BACKLOG));
    const progressCol = columns.find((c: any) => prisma._ctx.columnBehavior.find((b: any) => b.id === c.behaviorId && b.key === ColumnBehaviorKey.IN_PROGRESS));
    const child = prisma._ctx.node.find((n: any) => n.parentId === 'parent-1' && n.columnId === backlogCol.id);
    await service.moveChildNode('parent-1', child.id, { targetColumnId: progressCol.id }, 'u1');
    const afterFirst = prisma._ctx.node.find((n: any) => n.id === child.id);
    const firstStartedAt = afterFirst.statusMetadata.startedAt;
    expect(firstStartedAt).toBeDefined();
    // Move to another position same column should not overwrite startedAt
    await service.moveChildNode('parent-1', child.id, { targetColumnId: progressCol.id, position: 0 }, 'u1');
    const afterSecond = prisma._ctx.node.find((n: any) => n.id === child.id);
    expect(afterSecond.statusMetadata.startedAt).toBe(firstStartedAt);
  });

  it('refuse creation si WIP backlog atteint', async () => {
    // Préparer parent avec board + colonnes simulées + wip backlog = 1
    // On simule en créant une première child puis en ajustant manuellement la limite backlog
    const detail = await service.createChildNode('parent-1', { title: 'A' } as any, 'u1');
    const prismaCtx = (prisma as any)._ctx;
    const board = prismaCtx.board[0];
    const backlogCol = prismaCtx.column.find((c: any) => prismaCtx.columnBehavior.find((b: any) => b.id === c.behaviorId && b.key === ColumnBehaviorKey.BACKLOG));
    backlogCol.wipLimit = 1; // forcer limite
    await expect(service.createChildNode('parent-1', { title: 'B' } as any, 'u1')).rejects.toThrow(/WIP/);
  });

  it('refuse move vers colonne pleine', async () => {
    // créer deux tasks pour remplir IN_PROGRESS limite =1
    const ctx = (prisma as any)._ctx;
    const detail = await service.createChildNode('parent-1', { title: 'Task A' } as any, 'u1');
    const detail2 = await service.createChildNode('parent-1', { title: 'Task B' } as any, 'u1');
    const board = ctx.board[0];
    const columns = ctx.column.filter((c: any) => c.boardId === board.id);
    const colBehavior = (col: any, key: ColumnBehaviorKey) => ctx.columnBehavior.find((b: any) => b.id === col.behaviorId && b.key === key);
    const backlogCol = columns.find((c: any) => colBehavior(c, ColumnBehaviorKey.BACKLOG));
    const progressCol = columns.find((c: any) => colBehavior(c, ColumnBehaviorKey.IN_PROGRESS));
    progressCol.wipLimit = 1;
    // Move first task to IN_PROGRESS OK
    const firstTask = ctx.node.find((n: any) => n.title === 'Task A');
    await service.moveChildNode('parent-1', firstTask.id, { targetColumnId: progressCol.id }, 'u1');
    // Attempt move second -> should fail
    const secondTask = ctx.node.find((n: any) => n.title === 'Task B');
    await expect(service.moveChildNode('parent-1', secondTask.id, { targetColumnId: progressCol.id }, 'u1')).rejects.toThrow(/WIP/);
  });

  it('refuse de passer une tâche en DONE si des sous-tâches actives existent', async () => {
    const detail = await service.createChildNode('parent-1', { title: 'Epic' } as any, 'u1');
    const epicId = detail.children[0].id;
    await service.createChildNode(epicId, { title: 'Sub A' } as any, 'u1');
    await expect(service.toggleChildDone('parent-1', epicId, 'u1')).rejects.toThrow(/sous-tache/);
  });

  it('autorise DONE quand toutes les sous-tâches sont terminées', async () => {
    const ctx = (prisma as any)._ctx;
    const detail = await service.createChildNode('parent-1', { title: 'Feature' } as any, 'u1');
    const featureId = detail.children[0].id;
    const subDetail = await service.createChildNode(featureId, { title: 'Sub task' } as any, 'u1');
    const subId = subDetail.children[0].id;
    await service.toggleChildDone(featureId, subId, 'u1');
    await service.toggleChildDone('parent-1', featureId, 'u1');
    const doneColumn = ctx.column.find((c: any) =>
      ctx.columnBehavior.find((b: any) => b.id === c.behaviorId && b.key === ColumnBehaviorKey.DONE),
    );
    const featureNode = ctx.node.find((n: any) => n.id === featureId);
    expect(featureNode.columnId).toBe(doneColumn.id);
  });

  it('réinitialise les champs de blocage en quittant la colonne BLOQUE', async () => {
    const ctx = (prisma as any)._ctx;
    const detail = await service.createChildNode('parent-1', { title: 'Blocked task' } as any, 'u1');
    const taskId = detail.children[0].id;
    const board = ctx.board[0];
    const columns = ctx.column.filter((c: any) => c.boardId === board.id);
    const findCol = (key: ColumnBehaviorKey) =>
      columns.find((c: any) => ctx.columnBehavior.find((b: any) => b.id === c.behaviorId && b.key === key));
    const blockedCol = findCol(ColumnBehaviorKey.BLOCKED);
    const backlogCol = findCol(ColumnBehaviorKey.BACKLOG);
    await service.moveChildNode('parent-1', taskId, { targetColumnId: blockedCol.id }, 'u1');
    await service.updateNode(taskId, {
      blockedReason: 'Need info',
      blockedReminderEmails: ['a@example.com', 'b@example.com'],
      blockedReminderIntervalDays: 4,
      blockedExpectedUnblockAt: new Date().toISOString(),
    } as any, 'u1');
    let nodeRecord = ctx.node.find((n: any) => n.id === taskId);
    expect(Array.isArray(nodeRecord.blockedReminderEmails)).toBe(true);
    expect(nodeRecord.blockedReminderEmails.length).toBe(2);
    expect(nodeRecord.blockedSince).toBeInstanceOf(Date);

    await service.moveChildNode('parent-1', taskId, { targetColumnId: backlogCol.id }, 'u1');
    nodeRecord = ctx.node.find((n: any) => n.id === taskId);
    expect(nodeRecord.blockedReminderEmails).toEqual([]);
    expect(nodeRecord.blockedReminderIntervalDays).toBeNull();
    expect(nodeRecord.blockedReminderLastSentAt).toBeNull();
    expect(nodeRecord.blockedReason).toBeNull();
    expect(nodeRecord.blockedExpectedUnblockAt).toBeNull();
    expect(nodeRecord.blockedSince).toBeNull();
  });

  it('permet de snoozer et relancer la revue backlog', async () => {
    const ctx = (prisma as any)._ctx;
    const detail = await service.createChildNode(
      'parent-1',
      { title: 'Snooze me' } as any,
      'u1',
    );
    const childId = detail.children[detail.children.length - 1].id;
    const snoozeUntil = new Date(Date.now() + 2 * 86400000).toISOString();
    await service.updateNode(
      childId,
      { backlogHiddenUntil: snoozeUntil } as any,
      'u1',
    );
    let nodeRecord = ctx.node.find((n: any) => n.id === childId);
    expect(nodeRecord.metadata.workflow.backlog.hiddenUntil).toBe(snoozeUntil);

    const restartBaseline = Date.now();
    await service.updateNode(childId, { backlogReviewRestart: true } as any, 'u1');
    nodeRecord = ctx.node.find((n: any) => n.id === childId);
    expect(nodeRecord.metadata.workflow.backlog.hiddenUntil).toBeNull();
    const nextReviewTs = new Date(
      nodeRecord.metadata.workflow.backlog.nextReviewAt,
    ).getTime();
    const diffDays = Math.round((nextReviewTs - restartBaseline) / 86400000);
    expect(diffDays).toBeGreaterThanOrEqual(6);
    expect(diffDays).toBeLessThanOrEqual(8);
  });

  it('restaure une tâche archivée dans sa colonne d’origine', async () => {
    const ctx = (prisma as any)._ctx;
    const detail = await service.createChildNode(
      'parent-1',
      { title: 'Archive me' } as any,
      'u1',
    );
    const childId = detail.children[detail.children.length - 1].id;
    const backlogColumn = ctx.column.find((column: any) =>
      ctx.columnBehavior.find(
        (behavior: any) =>
          behavior.id === column.behaviorId &&
          behavior.key === ColumnBehaviorKey.BACKLOG,
      ),
    );
    expect(backlogColumn).toBeDefined();

    const archivedNode = ctx.node.find((node: any) => node.id === childId);
    expect(archivedNode).toBeDefined();
    const previousReview = archivedNode.metadata.workflow.backlog.reviewStartedAt;

    archivedNode.archivedAt = new Date('2024-01-01T00:00:00.000Z');
    archivedNode.columnId = backlogColumn.id;
    archivedNode.metadata.workflow.backlog.lastKnownColumnId = backlogColumn.id;
    archivedNode.metadata.workflow.backlog.lastKnownBehavior =
      ColumnBehaviorKey.BACKLOG;

    await service.createChildNode(
      'parent-1',
      { title: 'Still active' } as any,
      'u1',
    );

    const backlogActiveBefore = ctx.node.filter(
      (node: any) =>
        node.parentId === 'parent-1' &&
        node.columnId === backlogColumn.id &&
        (node.archivedAt === null || node.archivedAt === undefined),
    ).length;

    const restored = await service.restoreNode(childId, 'u1');
    expect(restored.columnId).toBe(backlogColumn.id);
    expect(restored.lastKnownColumnId).toBe(backlogColumn.id);

    const refreshed = ctx.node.find((node: any) => node.id === childId);
    expect(refreshed.archivedAt).toBeNull();
    expect(refreshed.position).toBe(backlogActiveBefore);
    expect(refreshed.metadata.workflow.backlog.reviewStartedAt).not.toBe(
      previousReview,
    );
  });
  it('relance automatiquement la revue backlog échue', async () => {
    const ctx = (prisma as any)._ctx;
    const detail = await service.createChildNode(
      'parent-1',
      { title: 'Automation backlog' } as any,
      'u1',
    );
    const childId = detail.children[detail.children.length - 1].id;
    const nodeRecord = ctx.node.find((n: any) => n.id === childId);
    nodeRecord.metadata.workflow.backlog.nextReviewAt = '2025-01-01T00:00:00.000Z';
    nodeRecord.metadata.workflow.backlog.lastInteractionAt = '2024-12-15T00:00:00.000Z';

    const appendSpy = jest.spyOn(service as any, 'appendMailLog');
    const writeSpy = jest
      .spyOn(service as any, 'writeMailLog')
      .mockResolvedValue(undefined);

    await service.runWorkflowAutomation(new Date('2025-01-10T00:00:00.000Z'));

    const refreshed = ctx.node.find((n: any) => n.id === childId);
    expect(new Date(refreshed.metadata.workflow.backlog.nextReviewAt).getTime()).toBeGreaterThan(
      new Date('2025-01-10T00:00:00.000Z').getTime(),
    );
    expect(refreshed.metadata.workflow.backlog.lastReminderAt).toBeDefined();
    expect(appendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'backlog-review-reminder',
        node: expect.objectContaining({ id: childId }),
      }),
    );

    appendSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it('archive automatiquement un backlog dépassé', async () => {
    const ctx = (prisma as any)._ctx;
    const detail = await service.createChildNode(
      'parent-1',
      { title: 'Archive backlog' } as any,
      'u1',
    );
    const childId = detail.children[detail.children.length - 1].id;
    const nodeRecord = ctx.node.find((n: any) => n.id === childId);
    nodeRecord.metadata.workflow.backlog.lastInteractionAt = '2024-08-01T00:00:00.000Z';
    nodeRecord.metadata.workflow.backlog.nextReviewAt = '2024-08-15T00:00:00.000Z';

    const appendSpy = jest.spyOn(service as any, 'appendMailLog');
    const writeSpy = jest
      .spyOn(service as any, 'writeMailLog')
      .mockResolvedValue(undefined);

    await service.runWorkflowAutomation(new Date('2024-12-01T00:00:00.000Z'));

    const refreshed = ctx.node.find((n: any) => n.id === childId);
    expect(refreshed.archivedAt).toBeInstanceOf(Date);
    expect(appendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'backlog-auto-archive',
        node: expect.objectContaining({ id: childId }),
      }),
    );

    appendSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it('programme une relance automatique sur une tâche bloquée', async () => {
    const ctx = (prisma as any)._ctx;
    const detail = await service.createChildNode(
      'parent-1',
      { title: 'Blocked reminder' } as any,
      'u1',
    );
    const taskId = detail.children[detail.children.length - 1].id;
    const board = ctx.board[0];
    const columns = ctx.column.filter((c: any) => c.boardId === board.id);
    const findCol = (key: ColumnBehaviorKey) =>
      columns.find((c: any) => ctx.columnBehavior.find((b: any) => b.id === c.behaviorId && b.key === key));
    const blockedCol = findCol(ColumnBehaviorKey.BLOCKED);
    await service.moveChildNode('parent-1', taskId, { targetColumnId: blockedCol.id }, 'u1');
    await service.updateNode(
      taskId,
      {
        blockedReminderEmails: ['alert@example.com'],
        blockedReminderIntervalDays: 3,
      } as any,
      'u1',
    );
    const nodeRecord = ctx.node.find((n: any) => n.id === taskId);
    nodeRecord.blockedSince = new Date('2025-01-01T00:00:00.000Z');

    const appendSpy = jest.spyOn(service as any, 'appendMailLog');
    const writeSpy = jest
      .spyOn(service as any, 'writeMailLog')
      .mockResolvedValue(undefined);

    await service.runWorkflowAutomation(new Date('2025-01-05T00:00:00.000Z'));

    const refreshed = ctx.node.find((n: any) => n.id === taskId);
    expect(refreshed.blockedReminderLastSentAt).toBeInstanceOf(Date);
    expect(appendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'blocked-auto-reminder',
        node: expect.objectContaining({ id: taskId }),
      }),
    );
    expect(mailService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Relance automatique'),
      }),
    );

    appendSpy.mockRestore();
    writeSpy.mockRestore();
  });

});
