import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { NodesService } from './nodes.service';
import { MembershipStatus, ColumnBehaviorKey } from '@prisma/client';

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
          return matchParent && matchColumn;
        }).length,
      ),
      findMany: jest.fn(async () => []),
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
      findUnique: jest.fn(async ({ where }) =>
        ctx.column.find((column) => column.id === where.id) ?? null,
      ),
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
  let prisma: any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    // seed membership + parent node simple
    prisma._ctx.membership.push({ id: 'm1', userId: 'u1', teamId: 't1', status: MembershipStatus.ACTIVE });
    prisma._ctx.node.push({
      id: 'parent-1', teamId: 't1', parentId: null, title: 'Parent', description: null, path: '/parent-1', depth: 0, position: 0, createdById: 'u1', columnId: null, dueAt: null, statusMetadata: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [NodesService, { provide: PrismaService, useValue: prisma }],
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
});
