import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

class HealthDto {
  status!: 'ok';
  timestamp!: string;
}

@ApiTags('Health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check for Stratum API' })
  @ApiOkResponse({ type: HealthDto })
  getHealth(): HealthDto {
    return this.appService.getHealth();
  }
}
