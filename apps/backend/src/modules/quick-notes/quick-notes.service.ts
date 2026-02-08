import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ColumnBehaviorKey,
  MembershipStatus,
  QuickNoteType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AttachQuickNoteDto } from './dto/attach-quick-note.dto';
import { CreateQuickNoteDto } from './dto/create-quick-note.dto';
import type {
  QuickNoteBoardDto,
  QuickNoteDto,
  QuickNoteListDto,
} from './dto/quick-note.dto';

const NOTE_TEXT_MAX = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class QuickNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async listOpen(userId: string): Promise<QuickNoteListDto> {
    const notes = await this.prisma.quickNote.findMany({
      where: { userId, treatedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        kanban: {
          select: {
            id: true,
            node: {
              select: {
                title: true,
                teamId: true,
                archivedAt: true,
                column: {
                  select: {
                    behavior: {
                      select: { key: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const items = notes.map((note) => this.toDto(note));

    return {
      items,
      count: items.length,
    };
  }

  async create(userId: string, dto: CreateQuickNoteDto): Promise<QuickNoteDto> {
    const text = this.normalizeText(dto.text);
    if (!text) {
      throw new BadRequestException('Le texte est obligatoire.');
    }
    if (text.length > NOTE_TEXT_MAX) {
      throw new BadRequestException(
        `Le texte ne doit pas dépasser ${NOTE_TEXT_MAX} caractères.`,
      );
    }

    const type = this.normalizeType(dto.type);
    const { kanbanId, kanbanName } = await this.resolveKanban(
      userId,
      dto.kanbanId ?? null,
    );

    const note = await this.prisma.quickNote.create({
      data: {
        userId,
        text,
        type,
        kanbanId,
        kanbanName,
      },
      include: {
        kanban: {
          select: {
            id: true,
            node: {
              select: {
                title: true,
                teamId: true,
                archivedAt: true,
                column: {
                  select: {
                    behavior: { select: { key: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return this.toDto(note);
  }

  async treat(userId: string, id: string): Promise<QuickNoteDto> {
    const updated = await this.prisma.quickNote.updateMany({
      where: { id, userId, treatedAt: null },
      data: { treatedAt: new Date() },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Note introuvable.');
    }

    const note = await this.prisma.quickNote.findUnique({
      where: { id },
      include: {
        kanban: {
          select: {
            id: true,
            node: {
              select: {
                title: true,
                teamId: true,
                archivedAt: true,
                column: {
                  select: {
                    behavior: { select: { key: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!note) {
      throw new NotFoundException('Note introuvable.');
    }

    return this.toDto(note);
  }

  async attach(
    userId: string,
    id: string,
    dto: AttachQuickNoteDto,
  ): Promise<QuickNoteDto> {
    const { kanbanId, kanbanName } = await this.resolveKanban(
      userId,
      dto.kanbanId ?? null,
    );

    const updated = await this.prisma.quickNote.updateMany({
      where: { id, userId, treatedAt: null },
      data: { kanbanId, kanbanName },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Note introuvable.');
    }

    const note = await this.prisma.quickNote.findUnique({
      where: { id },
      include: {
        kanban: {
          select: {
            id: true,
            node: {
              select: {
                title: true,
                teamId: true,
                archivedAt: true,
                column: {
                  select: {
                    behavior: { select: { key: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!note) {
      throw new NotFoundException('Note introuvable.');
    }

    return this.toDto(note);
  }

  async listBoards(userId: string): Promise<QuickNoteBoardDto[]> {
    const boards = await this.prisma.board.findMany({
      where: {
        node: {
          archivedAt: null,
          team: {
            memberships: {
              some: { userId, status: MembershipStatus.ACTIVE },
            },
          },
          OR: [
            { columnId: null },
            {
              column: {
                behavior: {
                  key: { not: ColumnBehaviorKey.DONE },
                },
              },
            },
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        node: {
          select: {
            title: true,
            teamId: true,
            team: { select: { name: true } },
          },
        },
      },
    });

    return boards.map((board) => ({
      id: board.id,
      name: board.node.title,
      teamId: board.node.teamId,
      teamName: board.node.team.name,
    }));
  }

  async cleanup(userId: string): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * DAY_MS);
    const result = await this.prisma.quickNote.deleteMany({
      where: {
        userId,
        treatedAt: { not: null, lt: cutoff },
      },
    });

    return result.count;
  }

  private normalizeText(value: string | undefined | null): string {
    return (value ?? '').trim();
  }

  private normalizeType(
    value: QuickNoteType | undefined | null,
  ): QuickNoteType {
    if (!value) {
      throw new BadRequestException('Le type est obligatoire.');
    }
    if (!Object.values(QuickNoteType).includes(value)) {
      throw new BadRequestException('Type invalide.');
    }
    return value;
  }

  private async resolveKanban(
    userId: string,
    kanbanId: string | null,
  ): Promise<{ kanbanId: string | null; kanbanName: string | null }> {
    if (!kanbanId) {
      return { kanbanId: null, kanbanName: null };
    }

    const board = await this.prisma.board.findFirst({
      where: {
        id: kanbanId,
        node: {
          archivedAt: null,
          team: {
            memberships: {
              some: { userId, status: MembershipStatus.ACTIVE },
            },
          },
          OR: [
            { columnId: null },
            {
              column: {
                behavior: {
                  key: { not: ColumnBehaviorKey.DONE },
                },
              },
            },
          ],
        },
      },
      include: {
        node: {
          select: {
            title: true,
            column: { select: { behavior: { select: { key: true } } } },
          },
        },
      },
    });

    if (!board) {
      throw new NotFoundException('Kanban introuvable ou inaccessible.');
    }

    return { kanbanId: board.id, kanbanName: board.node.title };
  }

  private toDto(note: {
    id: string;
    text: string;
    type: QuickNoteType;
    kanbanId: string | null;
    kanbanName: string | null;
    createdAt: Date;
    treatedAt: Date | null;
    kanban?: {
      id: string;
      node: {
        title: string;
        teamId: string;
        archivedAt: Date | null;
        column: { behavior: { key: ColumnBehaviorKey } } | null;
      };
    } | null;
  }): QuickNoteDto {
    const kanban = note.kanban;
    const isArchived = kanban?.node.archivedAt ? true : false;
    const isDone =
      kanban?.node.column?.behavior?.key === ColumnBehaviorKey.DONE;
    const kanbanAvailable = Boolean(kanban && !isArchived && !isDone);

    return {
      id: note.id,
      text: note.text,
      type: note.type,
      kanbanId: note.kanbanId ?? null,
      kanbanName: note.kanbanName ?? kanban?.node.title ?? null,
      kanbanTeamId: kanban?.node.teamId ?? null,
      kanbanAvailable,
      createdAt: note.createdAt.toISOString(),
      treatedAt: note.treatedAt ? note.treatedAt.toISOString() : null,
    };
  }
}
