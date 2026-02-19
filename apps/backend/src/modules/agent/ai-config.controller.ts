import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiConfigService } from './ai-config.service';
import {
  AiConfigResponseDto,
  AiUsageQueryDto,
  AiUsageSummaryDto,
  ModelCatalogResponseDto,
  UpdateAiConfigDto,
} from './dto/ai-config.dto';

@ApiTags('AI Config')
@Controller('workspaces/:workspaceId/ai-config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Obtenir la configuration IA du workspace' })
  @ApiParam({ name: 'workspaceId' })
  @ApiOkResponse({ type: AiConfigResponseDto })
  getConfig(
    @Param('workspaceId') workspaceId: string,
  ): Promise<AiConfigResponseDto> {
    return this.aiConfigService.getConfig(workspaceId);
  }

  @Patch()
  @ApiOperation({ summary: 'Mettre à jour la configuration IA du workspace' })
  @ApiParam({ name: 'workspaceId' })
  @ApiOkResponse({ type: AiConfigResponseDto })
  updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateAiConfigDto,
  ): Promise<AiConfigResponseDto> {
    return this.aiConfigService.updateConfig(workspaceId, dto);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Résumé de consommation IA du workspace' })
  @ApiParam({ name: 'workspaceId' })
  @ApiOkResponse({ type: AiUsageSummaryDto })
  getUsage(
    @Param('workspaceId') workspaceId: string,
    @Query() query: AiUsageQueryDto,
  ): Promise<AiUsageSummaryDto> {
    return this.aiConfigService.getUsageSummary(
      workspaceId,
      query.from,
      query.to,
    );
  }

  @Get('model-catalog')
  @ApiOperation({
    summary: 'Catalogue de modèles IA avec recommandations et coûts',
  })
  @ApiOkResponse({ type: ModelCatalogResponseDto })
  getModelCatalog(): ModelCatalogResponseDto {
    return this.aiConfigService.getModelCatalog();
  }
}
