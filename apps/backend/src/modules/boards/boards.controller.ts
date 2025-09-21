import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BoardDto } from './dto/board.dto';
import { BoardWithNodesDto } from './dto/board-with-nodes.dto';
import { BoardColumnDto } from './dto/board-column.dto';
import { CreateBoardColumnDto } from './dto/create-board-column.dto';
import { UpdateBoardColumnDto } from './dto/update-board-column.dto';
import { BoardsService } from './boards.service';

@ApiTags('Boards')
@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get(':boardId')
  @ApiOperation({ summary: 'Retrieve a board with its columns' })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiOkResponse({ type: BoardDto })
  getBoard(@Param('boardId') boardId: string): Promise<BoardDto> {
    return this.boardsService.getBoard(boardId);
  }

  @Get(':boardId/detail')
  @ApiOperation({ summary: 'Retrieve a board with its columns and nodes' })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiOkResponse({ type: BoardWithNodesDto })
  getBoardWithNodes(
    @Param('boardId') boardId: string,
  ): Promise<BoardWithNodesDto> {
    return this.boardsService.getBoardWithNodes(boardId);
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
}
