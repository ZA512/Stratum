import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NodeDto } from './dto/node.dto';

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoardWithNodes(boardId: string) {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          include: {
            nodes: {
              select: {
                id: true,
                title: true,
                shortId: true, // Ajout du champ shortId
                assignments: true, // Ajout des assignations
                // ...existing code...
              },
            },
          },
        },
      },
    });

    // ...existing code...

    const nodes = await this.prisma.node.findMany({
      select: {
        id: true,
        title: true,
        shortId: true, // Ajout du champ shortId
        assignments: true, // Ajout des assignations
        // ...existing code...
      },
    });

    // ...existing code...

    const assignees = node.assignments as Array<{
      userId: string;
      role: string;
    }>;

    // ...existing code...

    const shortId =
      typeof node.shortId === 'number'
        ? node.shortId
        : Number(node.shortId ?? 0);

    // ...existing code...
  }
}