import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { NodeDto } from './dto/node.dto';

@Injectable()
export class NodesService {
  constructor(private readonly prisma: PrismaService) {}

  async getNodeDetail(id: string): Promise<NodeDto | null> {
    const node = await this.prisma.node.findUnique({
      where: { id },
    });

    if (!node) {
      return null;
    }

    return {
      id: node.id,
      title: node.title,
      shortId: Number(node.shortId ?? 0), // Ajout du champ shortId
      // ...existing code...
    };
  }

  // ...existing methods...
}