import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
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
import { ConvertNodeDto } from './dto/convert-node.dto';
import { NodeDto } from './dto/node.dto';
import { NodeBreadcrumbDto } from './dto/node-breadcrumb.dto';
import { NodeChildBoardDto } from './dto/node-child-board.dto';
import { NodesService } from './nodes.service';

@ApiTags('Nodes')
@Controller('nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get(':nodeId')
  @ApiOperation({ summary: 'Recupere un noeud (tache / sous-projet)' })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeDto })
  getNode(@Param('nodeId') nodeId: string): Promise<NodeDto> {
    return this.nodesService.getNode(nodeId);
  }

  @Get(':nodeId/breadcrumb')
  @ApiOperation({ summary: 'Retrieve breadcrumb chain for a node' })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeBreadcrumbDto })
  getBreadcrumb(@Param('nodeId') nodeId: string): Promise<NodeBreadcrumbDto> {
    return this.nodesService.getBreadcrumb(nodeId);
  }

  @Get(':nodeId/children')
  @ApiOperation({ summary: 'List child boards for a complex node' })
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
  @ApiOperation({ summary: 'Cree un noeud (simple, moyen ou complexe)' })
  @ApiCreatedResponse({ type: NodeDto })
  createNode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNodeDto,
  ): Promise<NodeDto> {
    return this.nodesService.createNode(dto, user.id);
  }

  @Post(':nodeId/convert')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Convertit un noeud vers un autre type (simple/moyen/complexe)',
  })
  @ApiParam({ name: 'nodeId', example: 'node_123' })
  @ApiOkResponse({ type: NodeDto })
  convertNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
    @Body() dto: ConvertNodeDto,
  ): Promise<NodeDto> {
    return this.nodesService.convertNode(nodeId, dto, user.id);
  }
}
