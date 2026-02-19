import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GoalService } from './goal.service';
import {
  CreateGoalDto,
  GoalResponseDto,
  UpdateGoalDto,
} from './dto/goal.dto';

@ApiTags('Goals')
@Controller('workspaces/:workspaceId/goals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GoalController {
  constructor(private readonly goalService: GoalService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un objectif workspace' })
  @ApiParam({ name: 'workspaceId' })
  @ApiOkResponse({ type: GoalResponseDto })
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateGoalDto,
  ): Promise<GoalResponseDto> {
    return this.goalService.create(workspaceId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les objectifs d\'un workspace' })
  @ApiParam({ name: 'workspaceId' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'PAUSED', 'DONE', 'ARCHIVED'] })
  @ApiOkResponse({ type: [GoalResponseDto] })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
  ): Promise<GoalResponseDto[]> {
    return this.goalService.list(workspaceId, status);
  }

  @Get(':goalId')
  @ApiOperation({ summary: 'Obtenir un objectif' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'goalId' })
  @ApiOkResponse({ type: GoalResponseDto })
  get(
    @Param('workspaceId') workspaceId: string,
    @Param('goalId') goalId: string,
  ): Promise<GoalResponseDto> {
    return this.goalService.get(workspaceId, goalId);
  }

  @Patch(':goalId')
  @ApiOperation({ summary: 'Mettre à jour un objectif' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'goalId' })
  @ApiOkResponse({ type: GoalResponseDto })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('goalId') goalId: string,
    @Body() dto: UpdateGoalDto,
  ): Promise<GoalResponseDto> {
    return this.goalService.update(workspaceId, goalId, dto);
  }

  @Delete(':goalId')
  @ApiOperation({ summary: 'Supprimer un objectif' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'goalId' })
  delete(
    @Param('workspaceId') workspaceId: string,
    @Param('goalId') goalId: string,
  ): Promise<void> {
    return this.goalService.delete(workspaceId, goalId);
  }
}
