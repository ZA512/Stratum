import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Body,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttachQuickNoteDto } from './dto/attach-quick-note.dto';
import { CreateQuickNoteDto } from './dto/create-quick-note.dto';
import {
  QuickNoteBoardDto,
  QuickNoteCleanupDto,
  QuickNoteDto,
  QuickNoteListDto,
} from './dto/quick-note.dto';
import {
  QuickNoteAiExecuteRequestDto,
  QuickNoteAiExecuteResponseDto,
  QuickNoteAiRefineRequestDto,
  QuickNoteAiSuggestRequestDto,
  QuickNoteAiSuggestResponseDto,
} from './dto/quick-note-ai.dto';
import { QuickNotesAiService } from './quick-notes-ai.service';
import { QuickNotesService } from './quick-notes.service';

@ApiTags('QuickNotes')
@Controller('quick-notes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QuickNotesController {
  constructor(
    private readonly quickNotesService: QuickNotesService,
    private readonly quickNotesAiService: QuickNotesAiService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer une note rapide' })
  @ApiOkResponse({ type: QuickNoteDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuickNoteDto,
  ): Promise<QuickNoteDto> {
    return this.quickNotesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les notes rapides' })
  @ApiQuery({ name: 'status', required: false, example: 'open' })
  @ApiOkResponse({ type: QuickNoteListDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ): Promise<QuickNoteListDto> {
    if (status && status !== 'open') {
      throw new BadRequestException('Statut invalide.');
    }
    return this.quickNotesService.listOpen(user.id);
  }

  @Post(':id/treat')
  @ApiOperation({ summary: 'Archiver une note rapide' })
  @ApiParam({ name: 'id', example: 'note_123' })
  @ApiOkResponse({ type: QuickNoteDto })
  treat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<QuickNoteDto> {
    return this.quickNotesService.treat(user.id, id);
  }

  @Post(':id/attach')
  @ApiOperation({ summary: 'Attacher un kanban à une note rapide' })
  @ApiParam({ name: 'id', example: 'note_123' })
  @ApiOkResponse({ type: QuickNoteDto })
  attach(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AttachQuickNoteDto,
  ): Promise<QuickNoteDto> {
    return this.quickNotesService.attach(user.id, id, dto);
  }

  @Get('boards')
  @ApiOperation({
    summary: 'Lister les kanbans disponibles pour les notes rapides',
  })
  @ApiQuery({ name: 'search', required: false, example: 'marketing' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiOkResponse({ type: QuickNoteBoardDto, isArray: true })
  listBoards(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ): Promise<QuickNoteBoardDto[]> {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.quickNotesService.listBoards(user.id, {
      search,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Post('cleanup')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Supprimer les notes archivées depuis plus de 7 jours',
  })
  @ApiOkResponse({ type: QuickNoteCleanupDto })
  async cleanup(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuickNoteCleanupDto> {
    const deleted = await this.quickNotesService.cleanup(user.id);
    return { deleted };
  }

  @Post(':id/ai/suggest')
  @ApiOperation({ summary: 'Générer des propositions IA pour une quick note' })
  @ApiParam({ name: 'id', example: 'note_123' })
  @ApiOkResponse({ type: QuickNoteAiSuggestResponseDto })
  suggestWithAi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: QuickNoteAiSuggestRequestDto,
  ): Promise<QuickNoteAiSuggestResponseDto> {
    return this.quickNotesAiService.suggest(user.id, id, dto);
  }

  @Post(':id/ai/refine')
  @ApiOperation({
    summary: 'Affiner les propositions IA avec un feedback utilisateur',
  })
  @ApiParam({ name: 'id', example: 'note_123' })
  @ApiOkResponse({ type: QuickNoteAiSuggestResponseDto })
  refineWithAi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: QuickNoteAiRefineRequestDto,
  ): Promise<QuickNoteAiSuggestResponseDto> {
    return this.quickNotesAiService.refine(user.id, id, dto);
  }

  @Post(':id/ai/execute')
  @ApiOperation({
    summary: "Exécuter une sélection d'actions IA sur la quick note",
  })
  @ApiParam({ name: 'id', example: 'note_123' })
  @ApiOkResponse({ type: QuickNoteAiExecuteResponseDto })
  executeAiActions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: QuickNoteAiExecuteRequestDto,
  ): Promise<QuickNoteAiExecuteResponseDto> {
    return this.quickNotesAiService.execute(user.id, id, dto);
  }
}
