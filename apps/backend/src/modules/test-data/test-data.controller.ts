import {
  BadRequestException,
  Controller,
  Post,
  Get,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { TestDataService } from './test-data.service';

const IMPORT_TMP_DIR = path.join(os.tmpdir(), 'stratum-imports');

@ApiTags('TestData')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('test-data')
export class TestDataController {
  constructor(private readonly testDataService: TestDataService) {
    if (!existsSync(IMPORT_TMP_DIR)) {
      mkdirSync(IMPORT_TMP_DIR, { recursive: true });
    }
  }

  @Get('export')
  @ApiOperation({ summary: 'Exporte un dump complet pour tests' })
  async exportDatabase(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    await this.testDataService.exportDatabase(user, res);
  }

  @Post('import')
  @ApiOperation({ summary: 'Importe un dump complet pour tests' })
  @UseInterceptors(
    FileInterceptor('file', {
      dest: IMPORT_TMP_DIR,
      limits: { fileSize: 1024 * 1024 * 1024 },
    }),
  )
  async importDatabase(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ status: 'ok' }> {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }

    try {
      await this.testDataService.importDatabase(user, file.path);
      return { status: 'ok' };
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }
}
