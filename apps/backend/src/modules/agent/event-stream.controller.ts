import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PublicAgentGuard } from './public-agent.guard';
import { RequirePublicAgentScope } from './public-agent-scope.decorator';
import { EventStreamService } from './event-stream.service';
import {
  EventStreamQueryDto,
  EventStreamResponseDto,
} from './dto/event-stream.dto';

@ApiTags('Public Event Stream')
@Controller('public/workspaces/:workspaceId/events')
@UseGuards(PublicAgentGuard)
export class EventStreamController {
  constructor(private readonly eventStream: EventStreamService) {}

  @Get('stream')
  @RequirePublicAgentScope('agent:command')
  @ApiOperation({
    summary: 'Event stream public avec pagination cursor (polling)',
  })
  @ApiParam({ name: 'workspaceId', example: 'workspace_123' })
  @ApiOkResponse({ type: EventStreamResponseDto })
  getEventStream(
    @Param('workspaceId') workspaceId: string,
    @Query() query: EventStreamQueryDto,
  ): Promise<EventStreamResponseDto> {
    return this.eventStream.getEvents(workspaceId, {
      cursor: query.cursor,
      eventType: query.eventType,
      limit: query.limit,
    });
  }
}
