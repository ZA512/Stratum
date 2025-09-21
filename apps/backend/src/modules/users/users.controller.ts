import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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
import { UsersService } from './users.service';

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
}
