import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import * as crypto from 'crypto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BoardDto } from './dto/board.dto';
import { BoardWithNodesDto } from './dto/board-with-nodes.dto';
import { BoardColumnDto } from './dto/board-column.dto';
import { CreateBoardColumnDto } from './dto/create-board-column.dto';
import { UpdateBoardColumnDto } from './dto/update-board-column.dto';
import { BoardsService } from './boards.service';
import { ArchivedBoardNodeDto } from './dto/archived-board-node.dto';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Boards')
@Controller('boards')
export class BoardsController {
  constructor(
    private readonly boardsService: BoardsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':boardId')
  @ApiOperation({ summary: 'Retrieve a board with its columns' })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiOkResponse({ type: BoardDto })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getBoard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
  ): Promise<BoardDto> {
    return this.boardsService.getBoard(boardId, user.id);
  }

  @Get(':boardId/detail')
  @ApiOperation({
    summary:
      'Retrieve a board with its columns and nodes (optimisé avec ETag pour auto-refresh)',
  })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'ETag de la dernière version connue',
  })
  @ApiOkResponse({ type: BoardWithNodesDto })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getBoardWithNodes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.boardsService.getBoardWithNodes(boardId, user.id);

    // Générer un ETag basé sur le contenu
    const dataString = JSON.stringify(data);
    const etag = `"${crypto.createHash('md5').update(dataString).digest('hex')}"`;

    // Si le client a déjà cette version, retourner 304 Not Modified
    if (ifNoneMatch === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    // Sinon, retourner les données avec le nouvel ETag
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache'); // Force validation avec ETag
    res.json(data);
  }

  @Get(':boardId/columns/:columnId/archived')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Liste les tâches archivées associées à une colonne du board',
  })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiParam({ name: 'columnId', example: 'column_789' })
  @ApiOkResponse({ type: ArchivedBoardNodeDto, isArray: true })
  listArchivedNodes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
  ): Promise<ArchivedBoardNodeDto[]> {
    return this.boardsService.listArchivedNodes(boardId, columnId, user.id);
  }

  @Get('team/:teamId')
  @ApiOperation({ summary: 'Retrieve the root board for a team' })
  @ApiParam({ name: 'teamId', example: 'team_demo' })
  @ApiOkResponse({ type: BoardDto })
  getRootBoardForTeam(@Param('teamId') teamId: string): Promise<BoardDto> {
    return this.boardsService.getRootBoardForTeam(teamId);
  }

  @Post(':boardId/columns')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new column on the board' })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiCreatedResponse({ type: BoardColumnDto })
  createColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
    @Body() dto: CreateBoardColumnDto,
  ): Promise<BoardColumnDto> {
    return this.boardsService.createColumn(boardId, dto, user.id);
  }

  @Patch(':boardId/columns/:columnId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a column on the board' })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiParam({ name: 'columnId', example: 'column_789' })
  @ApiOkResponse({ type: BoardColumnDto })
  updateColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateBoardColumnDto,
  ): Promise<BoardColumnDto> {
    return this.boardsService.updateColumn(boardId, columnId, dto, user.id);
  }

  @Delete(':boardId/columns/:columnId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a column from the board' })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiParam({ name: 'columnId', example: 'column_789' })
  @ApiNoContentResponse()
  async deleteColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
  ): Promise<void> {
    await this.boardsService.deleteColumn(boardId, columnId, user.id);
  }

  @Post(':boardId/nodes/:nodeId/reset-archive-counter')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({
    summary:
      "Remet à zéro le compteur d'archivage automatique d'une carte backlog",
  })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiParam({ name: 'nodeId', example: 'node_456' })
  @ApiNoContentResponse()
  async resetBacklogArchiveCounter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<void> {
    await this.boardsService.resetBacklogArchiveCounter(
      boardId,
      nodeId,
      user.id,
    );
  }

  // --- Diagnostics & réparation (dev seulement) ---
  @Get(':boardId/diagnostic')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Diagnostic flags board (dev)' })
  async diagnostic(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
  ): Promise<any> {
    const flags = await this.boardsService.diagnosticFlags(boardId);
    const membership = flags.teamId
      ? await this.prisma.membership.findFirst({
          where: { userId: user.id, teamId: flags.teamId },
        })
      : null;
    return {
      ...flags,
      currentUserId: user.id,
      hasMembership: Boolean(membership),
    };
  }

  @Post(':boardId/diagnostic/fix')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Répare flags board personnel (dev)' })
  async fix(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
  ): Promise<any> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        node: { select: { teamId: true } },
      },
    });
    if (!board) {
      return { status: 'NOT_FOUND' };
    }
    const team = await this.prisma.team.findUnique({
      where: { id: board.node.teamId },
    });
    const repair: any = {};
    let changed = false;
    const boardFlags = await this.prisma.board.findUnique({
      where: { id: boardId },
    });
    if (boardFlags) {
      const t: any = team as any;
      const b: any = boardFlags as any;
      if (t?.isPersonal && !b.isPersonal) {
        repair.isPersonal = true;
        changed = true;
      }
      if (t?.isPersonal && b.ownerUserId !== user.id) {
        repair.ownerUserId = user.id;
        changed = true;
      }
      if (!t?.isPersonal && b.isPersonal) {
        repair.isPersonal = false;
        changed = true;
      }
    }
    if (changed) {
      await this.prisma.board.update({ where: { id: board.id }, data: repair });
    }
    // Ensure membership
    const existingMembership = await this.prisma.membership.findFirst({
      where: { teamId: board.node.teamId, userId: user.id },
    });
    if (!existingMembership) {
      await this.prisma.membership.create({
        data: { teamId: board.node.teamId, userId: user.id, status: 'ACTIVE' },
      });
    }
    const refreshed = await this.boardsService.diagnosticFlags(boardId);
    return { status: 'OK', changed, board: refreshed };
  }
}
