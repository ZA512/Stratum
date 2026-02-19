import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EventStreamItemDto,
  EventStreamResponseDto,
} from './dto/event-stream.dto';

@Injectable()
export class EventStreamService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch events for a workspace with cursor-based pagination.
   * Cursor is the last event ID seen by the consumer.
   */
  async getEvents(
    workspaceId: string,
    options: {
      cursor?: string;
      eventType?: string;
      limit?: number;
    },
  ): Promise<EventStreamResponseDto> {
    const limit = Math.min(options.limit ?? 50, 200);
    // Fetch one extra to detect hasMore
    const fetchLimit = limit + 1;

    const where: Record<string, unknown> = {
      workspaceId,
    };

    if (options.cursor) {
      // Cursor is an event ID; fetch events created after that event
      const cursorEvent = await this.prisma.eventLog.findUnique({
        where: { id: options.cursor },
        select: { createdAt: true },
      });

      if (cursorEvent) {
        where.OR = [
          { createdAt: { gt: cursorEvent.createdAt } },
          {
            createdAt: cursorEvent.createdAt,
            id: { gt: options.cursor },
          },
        ];
      }
    }

    if (options.eventType) {
      where.eventType = options.eventType;
    }

    const events = await this.prisma.eventLog.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: fetchLimit,
      select: {
        id: true,
        eventType: true,
        entityType: true,
        entityId: true,
        actorType: true,
        actorId: true,
        payload: true,
        createdAt: true,
      },
    });

    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;

    const items: EventStreamItemDto[] = page.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      entityType: e.entityType,
      entityId: e.entityId,
      actorType: e.actorType,
      actorId: e.actorId ?? undefined,
      payload: (e.payload as Record<string, unknown>) ?? {},
      createdAt: e.createdAt.toISOString(),
    }));

    const lastItem = page[page.length - 1];

    return {
      events: items,
      nextCursor: hasMore && lastItem ? lastItem.id : null,
      hasMore,
    };
  }
}
