import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApplyProposalDto,
  ApproveProposalDto,
  ProposalStateResponseDto,
  RejectProposalDto,
  RollbackProposalDto,
  ValidateProposalDto,
} from './dto/proposal.dto';
import { ProposalService } from './proposal.service';
import { ProposalExplainService } from './proposal-explain.service';

@ApiTags('Proposals')
@Controller('workspaces/:workspaceId/proposals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProposalController {
  constructor(
    private readonly proposalService: ProposalService,
    private readonly explainService: ProposalExplainService,
  ) {}

  @Get(':proposalId')
  @ApiOperation({ summary: 'Consulter une proposal' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'proposalId' })
  @ApiOkResponse({ type: ProposalStateResponseDto })
  get(
    @Param('workspaceId') workspaceId: string,
    @Param('proposalId') proposalId: string,
  ): Promise<ProposalStateResponseDto> {
    return this.proposalService.getProposal(workspaceId, proposalId);
  }

  @Post(':proposalId/validate')
  @ApiOperation({ summary: 'Valider une proposal (DRAFT -> VALIDATED)' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'proposalId' })
  @ApiBody({ type: ValidateProposalDto })
  @ApiOkResponse({ type: ProposalStateResponseDto })
  validate(
    @Param('workspaceId') workspaceId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateProposalDto,
  ): Promise<ProposalStateResponseDto> {
    return this.proposalService.validate(
      workspaceId,
      proposalId,
      user.id,
      dto,
    );
  }

  @Post(':proposalId/approve')
  @ApiOperation({ summary: 'Approuver une proposal (VALIDATED -> APPROVED)' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'proposalId' })
  @ApiBody({ type: ApproveProposalDto })
  @ApiOkResponse({ type: ProposalStateResponseDto })
  approve(
    @Param('workspaceId') workspaceId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApproveProposalDto,
  ): Promise<ProposalStateResponseDto> {
    return this.proposalService.approve(
      workspaceId,
      proposalId,
      user.id,
      dto,
    );
  }

  @Post(':proposalId/reject')
  @ApiOperation({ summary: 'Rejeter une proposal' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'proposalId' })
  @ApiBody({ type: RejectProposalDto })
  @ApiOkResponse({ type: ProposalStateResponseDto })
  reject(
    @Param('workspaceId') workspaceId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectProposalDto,
  ): Promise<ProposalStateResponseDto> {
    return this.proposalService.reject(
      workspaceId,
      proposalId,
      user.id,
      dto,
    );
  }

  @Post(':proposalId/apply')
  @ApiOperation({
    summary: 'Appliquer une proposal approuvee (APPROVED -> APPLIED)',
  })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'proposalId' })
  @ApiBody({ type: ApplyProposalDto })
  @ApiOkResponse({ type: ProposalStateResponseDto })
  apply(
    @Param('workspaceId') workspaceId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApplyProposalDto,
  ): Promise<ProposalStateResponseDto> {
    return this.proposalService.apply(
      workspaceId,
      proposalId,
      user.id,
      dto,
    );
  }

  @Post(':proposalId/rollback')
  @ApiOperation({
    summary: "Rollback logique d'une proposal appliquee (APPLIED -> ROLLED_BACK)",
  })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'proposalId' })
  @ApiBody({ type: RollbackProposalDto })
  @ApiOkResponse({ type: ProposalStateResponseDto })
  rollback(
    @Param('workspaceId') workspaceId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RollbackProposalDto,
  ): Promise<ProposalStateResponseDto> {
    return this.proposalService.rollback(
      workspaceId,
      proposalId,
      user.id,
      dto,
    );
  }

  @Get(':proposalId/explain')
  @ApiOperation({ summary: 'Obtenir l\'explication d\'une proposal' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'proposalId' })
  explain(
    @Param('proposalId') proposalId: string,
  ) {
    return this.explainService.get(proposalId);
  }

  @Post(':proposalId/explain/build')
  @ApiOperation({ summary: 'Generer une explication a partir des donnees du proposal' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'proposalId' })
  buildExplanation(
    @Param('proposalId') proposalId: string,
  ) {
    return this.explainService.buildFromProposal(proposalId);
  }
}
