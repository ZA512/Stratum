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
import { QuickNotesService } from './quick-notes.service';

@ApiTags('QuickNotes')
@Controller('quick-notes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QuickNotesController {
  constructor(private readonly quickNotesService: QuickNotesService) {}

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
  @ApiOperation({ summary: 'Lister les kanbans disponibles pour les notes rapides' })
  @ApiOkResponse({ type: QuickNoteBoardDto, isArray: true })
  listBoards(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuickNoteBoardDto[]> {
    return this.quickNotesService.listBoards(user.id);
  }

  @Post('cleanup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Supprimer les notes archivées depuis plus de 7 jours' })
  @ApiOkResponse({ type: QuickNoteCleanupDto })
  async cleanup(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuickNoteCleanupDto> {
    const deleted = await this.quickNotesService.cleanup(user.id);
    return { deleted };
  }
}
