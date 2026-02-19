import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiConfigService } from './ai-config.service';
import { ModelCatalogResponseDto } from './dto/ai-config.dto';

@ApiTags('AI Model Catalog')
@Controller('ai/model-catalog')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiModelCatalogController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'Catalogue de modèles IA avec recommandations par fonctionnalité et coûts',
  })
  @ApiOkResponse({ type: ModelCatalogResponseDto })
  getModelCatalog(): ModelCatalogResponseDto {
    return this.aiConfigService.getModelCatalog();
  }
}
