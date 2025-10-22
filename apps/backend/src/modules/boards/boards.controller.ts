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
import { TeamsService } from '../teams/teams.service';

@ApiTags('Boards')
@Controller('boards')
export class BoardsController {
  constructor(
    private readonly boardsService: BoardsService,
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary:
      'Retrieve or bootstrap the personal board of the authenticated user',
  })
  @ApiOkResponse({ type: BoardDto })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getPersonalBoard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BoardDto> {
    const { boardId } = await this.teamsService.bootstrapForUser(user.id);
    return this.boardsService.getBoard(boardId, user.id);
  }

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
    return {
      ...flags,
      currentUserId: user.id,
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
    });
    if (!board) {
      return { status: 'NOT_FOUND' };
    }
    const repair: any = {};
    let changed = false;
    if (!board.isPersonal) {
      repair.isPersonal = true;
      changed = true;
    }
    if (
      (board.ownerUserId === null || board.ownerUserId === user.id) &&
      board.ownerUserId !== user.id
    ) {
      repair.ownerUserId = user.id;
      changed = true;
    }
    if (changed) {
      await this.prisma.board.update({ where: { id: board.id }, data: repair });
    }
    const refreshed = await this.boardsService.diagnosticFlags(boardId);
    return { status: 'OK', changed, board: refreshed };
  }
}
