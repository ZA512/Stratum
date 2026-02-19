import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalHorizon, GoalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateGoalDto,
  GoalResponseDto,
  UpdateGoalDto,
} from './dto/goal.dto';

@Injectable()
export class GoalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    dto: CreateGoalDto,
  ): Promise<GoalResponseDto> {
    const goal = await this.prisma.goal.create({
      data: {
        workspaceId,
        description: dto.description,
        horizon: dto.horizon as GoalHorizon,
        linkedNodes: (dto.linkedNodes ?? []) as Prisma.InputJsonValue,
        successMetric: (dto.successMetric ?? {}) as Prisma.InputJsonValue,
        confidenceLevel: dto.confidenceLevel ?? null,
        status: GoalStatus.ACTIVE,
      },
    });

    return this.toResponse(goal);
  }

  async list(
    workspaceId: string,
    status?: string,
  ): Promise<GoalResponseDto[]> {
    const where: Prisma.GoalWhereInput = { workspaceId };
    if (status) {
      where.status = status as GoalStatus;
    }

    const goals = await this.prisma.goal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return goals.map((g) => this.toResponse(g));
  }

  async get(workspaceId: string, goalId: string): Promise<GoalResponseDto> {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, workspaceId },
    });

    if (!goal) {
      throw new NotFoundException('Goal non trouvé');
    }

    return this.toResponse(goal);
  }

  async update(
    workspaceId: string,
    goalId: string,
    dto: UpdateGoalDto,
  ): Promise<GoalResponseDto> {
    const existing = await this.prisma.goal.findFirst({
      where: { id: goalId, workspaceId },
    });

    if (!existing) {
      throw new NotFoundException('Goal non trouvé');
    }

    const data: Prisma.GoalUpdateInput = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status as GoalStatus;
    if (dto.linkedNodes !== undefined)
      data.linkedNodes = dto.linkedNodes as Prisma.InputJsonValue;
    if (dto.successMetric !== undefined)
      data.successMetric = dto.successMetric as Prisma.InputJsonValue;
    if (dto.confidenceLevel !== undefined)
      data.confidenceLevel = dto.confidenceLevel;

    const goal = await this.prisma.goal.update({
      where: { id: goalId },
      data,
    });

    return this.toResponse(goal);
  }

  async delete(workspaceId: string, goalId: string): Promise<void> {
    const existing = await this.prisma.goal.findFirst({
      where: { id: goalId, workspaceId },
    });

    if (!existing) {
      throw new NotFoundException('Goal non trouvé');
    }

    await this.prisma.goal.delete({ where: { id: goalId } });
  }

  /**
   * Get active goals for a workspace, used by the agent to align proposals.
   */
  async getActiveGoals(workspaceId: string): Promise<GoalResponseDto[]> {
    return this.list(workspaceId, 'ACTIVE');
  }

  private toResponse(goal: {
    id: string;
    workspaceId: string;
    description: string;
    horizon: string;
    linkedNodes: Prisma.JsonValue;
    successMetric: Prisma.JsonValue;
    confidenceLevel: Prisma.Decimal | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): GoalResponseDto {
    return {
      id: goal.id,
      workspaceId: goal.workspaceId,
      description: goal.description,
      horizon: goal.horizon,
      linkedNodes: (goal.linkedNodes as string[]) ?? [],
      successMetric: (goal.successMetric as Record<string, unknown>) ?? {},
      confidenceLevel: goal.confidenceLevel
        ? Number(goal.confidenceLevel)
        : undefined,
      status: goal.status,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    };
  }
}
