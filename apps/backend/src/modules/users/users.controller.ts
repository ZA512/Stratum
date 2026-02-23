import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateRaciTeamDto, UpdateRaciTeamDto } from './dto/raci-team.dto';
import { UsersService, RaciTeamPreference } from './users.service';
import { AiSettingsDto, UpdateAiSettingsDto } from './dto/ai-settings.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Recupere le profil courant et ses equipes actives',
  })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.usersService.getProfileWithTeams(user.id);
    return profile;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Met a jour le profil utilisateur' })
  @ApiOkResponse({ description: 'Profil mis a jour' })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const data: Partial<
      Pick<User, 'displayName' | 'locale' | 'avatarUrl' | 'bio'>
    > = {};

    if (dto.displayName !== undefined) {
      data.displayName = dto.displayName;
    }
    if (dto.locale !== undefined) {
      data.locale = dto.locale;
    }
    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = dto.avatarUrl;
    }
    if (dto.bio !== undefined) {
      data.bio = dto.bio;
    }

    if (Object.keys(data).length === 0) {
      return this.usersService.getProfileWithTeams(user.id);
    }

    await this.usersService.updateProfile(user.id, data);
    return this.usersService.getProfileWithTeams(user.id);
  }

  @Get('me/raci-teams')
  @ApiOperation({
    summary: 'Liste les équipes RACI enregistrées par l’utilisateur',
  })
  async listRaciTeams(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RaciTeamPreference[]> {
    return this.usersService.listRaciTeams(user.id);
  }

  @Post('me/raci-teams')
  @ApiOperation({ summary: 'Crée une nouvelle équipe RACI personnelle' })
  async createRaciTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRaciTeamDto,
  ): Promise<RaciTeamPreference> {
    return this.usersService.createRaciTeam(user.id, dto);
  }

  @Patch('me/raci-teams/:teamId')
  @ApiOperation({ summary: 'Renomme une équipe RACI enregistrée' })
  async renameRaciTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateRaciTeamDto,
  ): Promise<RaciTeamPreference> {
    return this.usersService.renameRaciTeam(user.id, teamId, dto.name);
  }

  @Delete('me/raci-teams/:teamId')
  @ApiOperation({ summary: 'Supprime une équipe RACI enregistrée' })
  async deleteRaciTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
  ): Promise<{ success: true }> {
    await this.usersService.deleteRaciTeam(user.id, teamId);
    return { success: true };
  }

  @Get('me/ai-settings')
  @ApiOperation({ summary: "Récupère les paramètres IA de l'utilisateur" })
  @ApiOkResponse({ type: AiSettingsDto })
  async getAiSettings(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiSettingsDto> {
    const settings = await this.usersService.getAiSettings(user.id);
    return {
      aiEnabled: settings.aiEnabled,
      provider: settings.provider,
      model: settings.model,
      baseUrl: settings.baseUrl,
      timeoutMs: settings.timeoutMs,
      hasApiKey: settings.apiKeyPresent,
      embeddingProvider: settings.embeddingProvider,
      embeddingModel: settings.embeddingModel,
      updatedAt: settings.updatedAt,
    };
  }

  @Patch('me/ai-settings')
  @ApiOperation({ summary: "Met à jour les paramètres IA de l'utilisateur" })
  @ApiOkResponse({ type: AiSettingsDto })
  async updateAiSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAiSettingsDto,
  ): Promise<AiSettingsDto> {
    const settings = await this.usersService.updateAiSettings(user.id, dto);
    return {
      aiEnabled: settings.aiEnabled,
      provider: settings.provider,
      model: settings.model,
      baseUrl: settings.baseUrl,
      timeoutMs: settings.timeoutMs,
      hasApiKey: settings.apiKeyPresent,
      embeddingProvider: settings.embeddingProvider,
      embeddingModel: settings.embeddingModel,
      updatedAt: settings.updatedAt,
    };
  }
}
