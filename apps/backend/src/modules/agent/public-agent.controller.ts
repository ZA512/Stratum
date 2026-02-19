import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentService } from './agent.service';
import {
  AgentCommandResponseDto,
} from './dto/agent-command.dto';
import { AgentChatResponseDto } from './dto/agent-chat.dto';
import {
  PublicAgentChatRequestDto,
  PublicAgentCommandRequestDto,
} from './dto/public-agent.dto';
import { PublicAgentGuard } from './public-agent.guard';
import { RequirePublicAgentScope } from './public-agent-scope.decorator';

interface PublicAgentRequest {
  publicAgentAuth: {
    tokenId: string;
  };
}

@ApiTags('Public Agent')
@Controller('public/agent')
@UseGuards(PublicAgentGuard)
export class PublicAgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('command')
  @RequirePublicAgentScope('agent:command')
  @ApiOperation({ summary: 'Public command endpoint (scoped token)' })
  @ApiBody({ type: PublicAgentCommandRequestDto })
  @ApiOkResponse({ type: AgentCommandResponseDto })
  command(
    @Body() dto: PublicAgentCommandRequestDto,
    @Req() req: PublicAgentRequest,
  ): Promise<AgentCommandResponseDto> {
    return this.agentService.commandFromPublicToken(
      dto.workspaceId,
      req.publicAgentAuth.tokenId,
      {
        intent: dto.intent,
        context: dto.context,
        sessionId: dto.sessionId,
      },
    );
  }

  @Post('chat')
  @RequirePublicAgentScope('agent:chat')
  @ApiOperation({ summary: 'Public chat endpoint (scoped token)' })
  @ApiBody({ type: PublicAgentChatRequestDto })
  @ApiOkResponse({ type: AgentChatResponseDto })
  chat(
    @Body() dto: PublicAgentChatRequestDto,
    @Req() req: PublicAgentRequest,
  ): Promise<AgentChatResponseDto> {
    return this.agentService.chatFromPublicToken(
      dto.workspaceId,
      req.publicAgentAuth.tokenId,
      {
        message: dto.message,
        context: dto.context,
        sessionId: dto.sessionId,
      },
    );
  }
}