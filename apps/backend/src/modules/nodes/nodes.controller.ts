import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Patch,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateNodeDto } from './dto/create-node.dto';
import { NodeDto } from './dto/node.dto';
import { NodeBreadcrumbDto } from './dto/node-breadcrumb.dto';
import { NodeChildBoardDto } from './dto/node-child-board.dto';
import { NodeDetailDto } from './dto/node-detail.dto';
import { NodeSummaryOnlyDto } from './dto/node-summary-only.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { CreateChildNodeDto } from './dto/create-child-node.dto';
import { UpdateChildNodeDto } from './dto/update-child-node.dto';
import { MoveChildNodeDto } from './dto/move-child-node.dto';
import { ReorderChildrenDto } from './dto/reorder-children.dto';
import {
  InviteNodeCollaboratorDto,
  NodeShareSummaryDto,
} from './dto/node-share.dto';
import { NodesService } from './nodes.service';
import { NodeDeletePreviewDto } from './dto/node-delete-preview.dto';

@ApiTags('Nodes')
@Controller('nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get(':nodeId')
  @ApiOperation({
    summary:
      'Récupère un noeud (tâche). Si des sous-tâches existent, un board implicite peut être associé.',
  })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeDto })
  getNode(@Param('nodeId') nodeId: string): Promise<NodeDto> {
    return this.nodesService.getNode(nodeId);
  }

  @Get(':nodeId/breadcrumb')
  @ApiOperation({
    summary: 'Récupère le breadcrumb hiérarchique du noeud (fractal kanban)',
  })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeBreadcrumbDto })
  getBreadcrumb(@Param('nodeId') nodeId: string): Promise<NodeBreadcrumbDto> {
    return this.nodesService.getBreadcrumb(nodeId);
  }

  @Get(':nodeId/children')
  @ApiOperation({
    summary:
      'Liste les sous-boards (un par sous-projet) basés sur la présence de boards enfants',
  })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeChildBoardDto, isArray: true })
  listChildBoards(
    @Param('nodeId') nodeId: string,
  ): Promise<NodeChildBoardDto[]> {
    return this.nodesService.listChildBoards(nodeId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Crée un noeud racine ou enfant (le type est implicite, board créé seulement quand des sous-tâches apparaissent)',
  })
  @ApiCreatedResponse({ type: NodeDto })
  createNode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNodeDto,
  ): Promise<NodeDto> {
    return this.nodesService.createNode(dto, user.id);
  }

  @Get(':nodeId/detail')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Récupère le détail complet du noeud (assignations, sous-tâches, board + summary).',
  })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeDetailDto })
  getNodeDetail(@Param('nodeId') nodeId: string): Promise<NodeDetailDto> {
    return this.nodesService.getNodeDetail(nodeId);
  }

  @Get(':nodeId/summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Récupère uniquement le résumé (counts + présence board)',
  })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeSummaryOnlyDto })
  getNodeSummary(@Param('nodeId') nodeId: string): Promise<NodeSummaryOnlyDto> {
    return this.nodesService.getNodeSummary(nodeId);
  }

  @Get(':nodeId/delete-preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Calcule l’impact potentiel de la suppression (directs + descendants par colonne)',
  })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeDeletePreviewDto })
  getDeletePreview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
  ): Promise<NodeDeletePreviewDto> {
    return this.nodesService.getDeletePreview(nodeId, user.id);
  }

  @Get(':nodeId/collaborators')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste les collaborateurs d\'une tâche (directs + hérités)' })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeShareSummaryDto })
  listCollaborators(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
  ): Promise<NodeShareSummaryDto> {
    return this.nodesService.listNodeCollaborators(nodeId, user.id);
  }

  @Post(':nodeId/collaborators')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ajoute un collaborateur direct sur la tâche' })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeShareSummaryDto })
  inviteCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Body() dto: InviteNodeCollaboratorDto,
  ): Promise<NodeShareSummaryDto> {
    return this.nodesService.addNodeCollaborator(nodeId, dto, user.id);
  }

  @Delete(':nodeId/collaborators/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retire un collaborateur direct de la tâche' })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiParam({ name: 'userId', example: 'user_guest' })
  @ApiOkResponse({ type: NodeShareSummaryDto })
  removeCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Param('userId') targetUserId: string,
  ): Promise<NodeShareSummaryDto> {
    return this.nodesService.removeNodeCollaborator(nodeId, targetUserId, user.id);
  }

  @Patch(':nodeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Met a jour les meta-donnees du noeud' })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeDto })
  updateNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto,
  ): Promise<NodeDto> {
    return this.nodesService.updateNode(nodeId, dto, user.id);
  }

  @Delete(':nodeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Supprime une tâche (optionnellement de manière récursive)',
  })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  async deleteNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Query('recursive') recursiveRaw?: string,
  ): Promise<void> {
    const recursive = recursiveRaw === 'true' || recursiveRaw === '1';
    await this.nodesService.deleteNode(nodeId, recursive, user.id);
  }

  // Endpoints checklist legacy supprimes

  @Post(':nodeId/children')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Crée une sous-tâche dans le backlog. Crée automatiquement le board + colonnes standard si absent.',
  })
  @ApiParam({ name: 'nodeId', example: 'node_parent' })
  @ApiCreatedResponse({ type: NodeDetailDto })
  createChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Body() dto: CreateChildNodeDto,
  ): Promise<NodeDetailDto> {
    return this.nodesService.createChildNode(nodeId, dto, user.id);
  }

  @Post(':nodeId/children/:childId/toggle-done')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Alterne une sous-tâche entre BACKLOG et DONE (déplacement de colonne)',
  })
  @ApiParam({ name: 'nodeId', example: 'node_parent' })
  @ApiParam({ name: 'childId', example: 'node_child' })
  @ApiOkResponse({ type: NodeDetailDto })
  toggleChildDone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Param('childId') childId: string,
  ): Promise<NodeDetailDto> {
    return this.nodesService.toggleChildDone(nodeId, childId, user.id);
  }

  @Patch(':nodeId/children/:childId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Met à jour une sous-tâche (titre / description / dueAt)',
  })
  @ApiParam({ name: 'nodeId', example: 'node_parent' })
  @ApiParam({ name: 'childId', example: 'node_child' })
  @ApiOkResponse({ type: NodeDetailDto })
  updateChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Param('childId') childId: string,
    @Body() dto: UpdateChildNodeDto,
  ): Promise<NodeDetailDto> {
    return this.nodesService.updateChildNode(nodeId, childId, dto, user.id);
  }

  @Post(':nodeId/children/:childId/move')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Déplace une sous-tâche vers une autre colonne et position',
  })
  @ApiParam({ name: 'nodeId', example: 'node_parent' })
  @ApiParam({ name: 'childId', example: 'node_child' })
  @ApiOkResponse({ type: NodeDetailDto })
  moveChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Param('childId') childId: string,
    @Body() dto: MoveChildNodeDto,
  ): Promise<NodeDetailDto> {
    return this.nodesService.moveChildNode(nodeId, childId, dto, user.id);
  }

  @Post(':nodeId/children/reorder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Réordonne toutes les sous-tâches d'une colonne" })
  @ApiParam({ name: 'nodeId', example: 'node_parent' })
  @ApiOkResponse({ type: NodeDetailDto })
  reorderChildren(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Body() dto: ReorderChildrenDto,
  ): Promise<NodeDetailDto> {
    return this.nodesService.reorderChildren(nodeId, dto, user.id);
  }

  @Post(':nodeId/ensure-board')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crée le board et ses colonnes par défaut si absent (sans créer de sous-tâche)' })
  @ApiParam({ name: 'nodeId', example: 'node_parent' })
  @ApiOkResponse({ schema: { properties: { boardId: { type: 'string' } } } })
  ensureBoard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
  ): Promise<{ boardId: string }> {
    return this.nodesService.ensureBoardOnly(nodeId, user.id);
  }
}
