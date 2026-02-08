import path from 'node:path';
import { appendFile } from 'node:fs/promises';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ColumnBehaviorKey,
  MembershipStatus,
  Priority,
  QuickNoteType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NodesService } from '../nodes/nodes.service';
import {
  QUICK_NOTE_AI_ACTION_TYPES,
  QuickNoteAiActionDto,
  QuickNoteAiActionType,
  QuickNoteAiExecuteRequestDto,
  QuickNoteAiExecuteResponseDto,
  QuickNoteAiExecutionResultDto,
  QuickNoteAiRefineRequestDto,
  QuickNoteAiSuggestRequestDto,
  QuickNoteAiSuggestResponseDto,
  QuickNoteAiSuggestionDto,
} from './dto/quick-note-ai.dto';
import { QuickNotesService } from './quick-notes.service';
import { UsersService } from '../users/users.service';

const MAX_ACTIONS_PER_REQUEST = 25;
const DEFAULT_MAX_SUGGESTIONS = 3;
const MAX_SUGGESTIONS = 10;
const ACTION_TYPE_SET = new Set<string>(QUICK_NOTE_AI_ACTION_TYPES);
const AI_ALLOWED_ACTION_TYPES = QUICK_NOTE_AI_ACTION_TYPES;
const SUGGESTION_MODEL_HEURISTIC = 'heuristic-v1';

type NormalizedAction = {
  type: QuickNoteAiActionType;
  params: Record<string, unknown>;
};

type SuggestionGenerationResult = {
  provider: string;
  model: string;
  warnings: string[];
  suggestions: QuickNoteAiSuggestionDto[];
};

type AiRuntimeSettings = {
  provider: string | null;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  timeoutMs: number | null;
};

type NoteContext = {
  note: {
    id: string;
    text: string;
    type: QuickNoteType;
    kanbanId: string | null;
    kanbanName: string | null;
    createdAt: string;
  };
  board: {
    id: string;
    nodeId: string;
    name: string;
    hierarchy: Array<{
      id: string;
      parentId: string | null;
      title: string;
      depth: number;
    }>;
    columns: Array<{
      id: string;
      name: string;
      behaviorKey: ColumnBehaviorKey;
      position: number;
    }>;
    nodes: Array<{
      id: string;
      parentId: string | null;
      title: string;
      description: string | null;
      columnId: string | null;
      progress: number;
      dueAt: string | null;
      priority: Priority;
      tags: string[];
    }>;
    recentComments: Array<{
      nodeId: string;
      body: string;
      createdAt: string;
      author: string;
    }>;
    recentActivity: Array<{
      nodeId: string;
      type: string;
      createdAt: string;
    }>;
  } | null;
  availableBoards: Array<{
    id: string;
    name: string;
    teamId: string;
    teamName: string;
  }>;
  boardsIndex?: Array<{
    id: string;
    nodeId: string;
    name: string;
    teamId: string;
    teamName: string;
    columns: Array<{
      id: string;
      name: string;
      behaviorKey: ColumnBehaviorKey;
      position: number;
    }>;
  }>;
};

@Injectable()
export class QuickNotesAiService {
  private readonly logger = new Logger(QuickNotesAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodesService: NodesService,
    private readonly quickNotesService: QuickNotesService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async suggest(
    userId: string,
    noteId: string,
    dto: QuickNoteAiSuggestRequestDto,
  ): Promise<QuickNoteAiSuggestResponseDto> {
    const context = await this.loadContext(userId, noteId);
    const maxSuggestions = this.normalizeMaxSuggestions(dto?.maxSuggestions);
    const instructions = this.normalizeText(dto?.instructions);
    const aiSettings = await this.resolveAiSettings(userId);

    await this.logAiContext('suggest', context, maxSuggestions);

    const heuristicResult = this.buildHeuristicSuggestions(
      context,
      { instructions, feedback: null },
      maxSuggestions,
    );

    const llmResult = await this.tryGenerateWithLlm(
      context,
      { instructions, feedback: null },
      maxSuggestions,
      aiSettings,
    );

    const effective =
      llmResult && llmResult.suggestions.length > 0
        ? llmResult
        : {
            provider: heuristicResult.provider,
            model: heuristicResult.model,
            warnings: [
              ...(llmResult?.warnings ?? []),
              ...(llmResult ? ['Fallback heuristique activé.'] : []),
              ...heuristicResult.warnings,
            ],
            suggestions: heuristicResult.suggestions,
          };

    return {
      noteId: context.note.id,
      provider: effective.provider,
      model: effective.model,
      warnings: effective.warnings,
      suggestions: effective.suggestions,
    };
  }

  async refine(
    userId: string,
    noteId: string,
    dto: QuickNoteAiRefineRequestDto,
  ): Promise<QuickNoteAiSuggestResponseDto> {
    const feedback = this.normalizeText(dto?.feedback);
    if (!feedback) {
      throw new BadRequestException('Le feedback est obligatoire.');
    }

    const context = await this.loadContext(userId, noteId);
    const maxSuggestions = this.normalizeMaxSuggestions(dto?.maxSuggestions);
    const instructions = this.normalizeText(dto?.instructions);
    const aiSettings = await this.resolveAiSettings(userId);

    await this.logAiContext('refine', context, maxSuggestions);

    const heuristicResult = this.buildHeuristicSuggestions(
      context,
      { instructions, feedback },
      maxSuggestions,
    );

    const llmResult = await this.tryGenerateWithLlm(
      context,
      { instructions, feedback },
      maxSuggestions,
      aiSettings,
    );

    const effective =
      llmResult && llmResult.suggestions.length > 0
        ? llmResult
        : {
            provider: heuristicResult.provider,
            model: heuristicResult.model,
            warnings: [
              ...(llmResult?.warnings ?? []),
              ...(llmResult ? ['Fallback heuristique activé.'] : []),
              ...heuristicResult.warnings,
            ],
            suggestions: heuristicResult.suggestions,
          };

    return {
      noteId: context.note.id,
      provider: effective.provider,
      model: effective.model,
      warnings: effective.warnings,
      suggestions: effective.suggestions,
    };
  }

  async execute(
    userId: string,
    noteId: string,
    dto: QuickNoteAiExecuteRequestDto,
  ): Promise<QuickNoteAiExecuteResponseDto> {
    const note = await this.prisma.quickNote.findFirst({
      where: { id: noteId, userId, treatedAt: null },
      select: { id: true },
    });

    if (!note) {
      throw new NotFoundException('Note rapide introuvable.');
    }

    if (!Array.isArray(dto?.actions) || dto.actions.length === 0) {
      throw new BadRequestException('Au moins une action est requise.');
    }

    if (dto.actions.length > MAX_ACTIONS_PER_REQUEST) {
      throw new BadRequestException(
        `Maximum ${MAX_ACTIONS_PER_REQUEST} actions par exécution.`,
      );
    }

    const normalizedActions = dto.actions
      .map((action) => this.normalizeAction(action))
      .filter((action): action is NormalizedAction => Boolean(action));

    if (normalizedActions.length === 0) {
      throw new BadRequestException('Aucune action valide à exécuter.');
    }

    const results: QuickNoteAiExecutionResultDto[] = [];
    let succeeded = 0;
    let failed = 0;
    let treated = false;

    for (let index = 0; index < normalizedActions.length; index += 1) {
      const action = normalizedActions[index];
      try {
        const message = await this.executeAction(userId, noteId, action);
        succeeded += 1;
        results.push({
          index,
          type: action.type,
          success: true,
          message,
        });
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : "Erreur d'exécution";
        results.push({
          index,
          type: action.type,
          success: false,
          message,
        });
      }
    }

    if (dto?.treatQuickNoteOnSuccess && failed === 0 && !treated) {
      try {
        await this.quickNotesService.treat(userId, noteId);
        treated = true;
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error
            ? error.message
            : 'Impossible de traiter la note.';
        this.logger.warn(`Auto-traitement quick note échoué: ${message}`);
      }
    }

    return {
      noteId,
      totalActions: normalizedActions.length,
      succeeded,
      failed,
      treated,
      results,
    };
  }

  private async executeAction(
    userId: string,
    noteId: string,
    action: NormalizedAction,
  ): Promise<string> {
    switch (action.type) {
      case 'MOVE_NODE_TO_COLUMN': {
        const nodeId = this.readRequiredString(action.params, 'nodeId');
        const targetColumnId = this.readRequiredString(
          action.params,
          'targetColumnId',
        );
        const requestedPosition = this.readOptionalInteger(
          action.params,
          'position',
        );

        const node = await this.prisma.node.findUnique({
          where: { id: nodeId },
          select: { parentId: true },
        });
        if (!node) {
          throw new NotFoundException('Tâche introuvable.');
        }
        if (!node.parentId) {
          throw new BadRequestException(
            'Déplacement impossible: tâche sans parent.',
          );
        }

        await this.nodesService.moveChildNode(
          node.parentId,
          nodeId,
          {
            targetColumnId,
            ...(requestedPosition !== null
              ? { position: requestedPosition }
              : {}),
          },
          userId,
        );
        return 'Carte déplacée.';
      }

      case 'UPDATE_NODE_FIELDS': {
        const nodeId = this.readRequiredString(action.params, 'nodeId');
        const fields = this.readObject(action.params, 'fields');
        if (!fields) {
          throw new BadRequestException('Champs de mise à jour invalides.');
        }

        const patch = this.sanitizeUpdateFields(fields);
        if (Object.keys(patch).length === 0) {
          throw new BadRequestException(
            'Aucun champ autorisé dans UPDATE_NODE_FIELDS.',
          );
        }

        await this.nodesService.updateNode(nodeId, patch, userId);
        return 'Carte mise à jour.';
      }

      case 'ADD_COMMENT': {
        const nodeId = this.readRequiredString(action.params, 'nodeId');
        const body = this.readRequiredString(action.params, 'body');

        await this.nodesService.createNodeComment(
          nodeId,
          {
            body,
            notifyResponsible: false,
            notifyAccountable: false,
            notifyConsulted: false,
            notifyInformed: false,
            notifyProject: false,
            notifySubProject: false,
          },
          userId,
        );
        return 'Commentaire ajouté.';
      }

      case 'APPEND_NODE_DESCRIPTION': {
        const nodeId = this.readRequiredString(action.params, 'nodeId');
        const text = this.readRequiredString(action.params, 'text');

        const node = await this.prisma.node.findUnique({
          where: { id: nodeId },
          select: { description: true },
        });
        if (!node) {
          throw new NotFoundException('Tâche introuvable.');
        }

        const current = node.description ?? '';
        const nextDescription = current ? `${current}\n\n${text}` : text;

        await this.nodesService.updateNode(
          nodeId,
          { description: nextDescription.slice(0, 50000) },
          userId,
        );
        return 'Description enrichie.';
      }

      case 'CREATE_CHILD_TASK': {
        const parentNodeId = this.readRequiredString(
          action.params,
          'parentNodeId',
        );
        const title = this.readRequiredString(action.params, 'title');
        const description = this.readOptionalString(
          action.params,
          'description',
        );
        const dueAt = this.readOptionalString(action.params, 'dueAt');

        await this.nodesService.createChildNode(
          parentNodeId,
          {
            title,
            ...(description !== null ? { description } : {}),
            ...(dueAt !== null ? { dueAt } : {}),
          },
          userId,
        );
        return 'Sous-tâche créée.';
      }

      default:
        throw new BadRequestException('Action inconnue.');
    }
  }

  private async loadContext(
    userId: string,
    noteId: string,
  ): Promise<NoteContext> {
    const note = await this.prisma.quickNote.findFirst({
      where: { id: noteId, userId, treatedAt: null },
      select: {
        id: true,
        text: true,
        type: true,
        kanbanId: true,
        kanbanName: true,
        createdAt: true,
      },
    });

    if (!note) {
      throw new NotFoundException('Note rapide introuvable.');
    }

    const availableBoards = await this.quickNotesService.listBoards(userId);

    const boardsIndex = await this.prisma.board.findMany({
      where: {
        node: {
          archivedAt: null,
          team: {
            memberships: {
              some: { userId, status: MembershipStatus.ACTIVE },
            },
          },
          OR: [
            { columnId: null },
            {
              column: {
                behavior: { key: { not: ColumnBehaviorKey.DONE } },
              },
            },
          ],
        },
      },
      include: {
        node: {
          select: {
            id: true,
            title: true,
            teamId: true,
            team: { select: { name: true } },
          },
        },
        columns: {
          include: { behavior: true },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    });

    let board: NoteContext['board'] = null;
    if (note.kanbanId) {
      const boardRecord = await this.prisma.board.findFirst({
        where: {
          id: note.kanbanId,
          node: {
            archivedAt: null,
            team: {
              memberships: {
                some: { userId, status: MembershipStatus.ACTIVE },
              },
            },
          },
        },
        include: {
          node: {
            select: {
              id: true,
              title: true,
              path: true,
            },
          },
          columns: {
            include: { behavior: true },
            orderBy: { position: 'asc' },
          },
        },
      });

      if (boardRecord) {
        const columnIds = boardRecord.columns.map((column) => column.id);
        const hierarchyNodes = await this.prisma.node.findMany({
          where: {
            archivedAt: null,
            path: { startsWith: `${boardRecord.node.path}/` },
          },
          select: {
            id: true,
            parentId: true,
            title: true,
            description: true,
            columnId: true,
            progress: true,
            dueAt: true,
            priority: true,
            tags: true,
            depth: true,
          },
          orderBy: [{ depth: 'asc' }, { position: 'asc' }],
          take: 1000,
        });

        const nodes = hierarchyNodes.filter(
          (node) => node.columnId && columnIds.includes(node.columnId),
        );

        const nodeIds = hierarchyNodes.map((node) => node.id);
        const comments =
          nodeIds.length > 0
            ? await this.prisma.comment.findMany({
                where: { nodeId: { in: nodeIds } },
                select: {
                  nodeId: true,
                  body: true,
                  createdAt: true,
                  author: { select: { displayName: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 120,
              })
            : [];

        const activity =
          nodeIds.length > 0
            ? await this.prisma.activityLog.findMany({
                where: { nodeId: { in: nodeIds } },
                select: {
                  nodeId: true,
                  type: true,
                  createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 120,
              })
            : [];

        board = {
          id: boardRecord.id,
          nodeId: boardRecord.node.id,
          name: boardRecord.node.title,
          hierarchy: [
            {
              id: boardRecord.node.id,
              parentId: null,
              title: boardRecord.node.title,
              depth: 0,
            },
            ...hierarchyNodes.map((node) => ({
              id: node.id,
              parentId: node.parentId,
              title: node.title,
              depth: node.depth,
            })),
          ],
          columns: boardRecord.columns.map((column) => ({
            id: column.id,
            name: column.name,
            behaviorKey: column.behavior.key,
            position: column.position,
          })),
          nodes: nodes.map((node) => ({
            id: node.id,
            parentId: node.parentId,
            title: node.title,
            description: node.description ?? null,
            columnId: node.columnId,
            progress: node.progress,
            dueAt: node.dueAt ? node.dueAt.toISOString() : null,
            priority: node.priority,
            tags: Array.isArray(node.tags) ? node.tags : [],
          })),
          recentComments: comments.map((comment) => ({
            nodeId: comment.nodeId,
            body: comment.body,
            createdAt: comment.createdAt.toISOString(),
            author: comment.author.displayName,
          })),
          recentActivity: activity.map((entry) => ({
            nodeId: entry.nodeId,
            type: entry.type,
            createdAt: entry.createdAt.toISOString(),
          })),
        };
      }
    }

    return {
      note: {
        id: note.id,
        text: note.text,
        type: note.type,
        kanbanId: note.kanbanId,
        kanbanName: note.kanbanName,
        createdAt: note.createdAt.toISOString(),
      },
      board,
      availableBoards,
      boardsIndex: boardsIndex.map((entry) => ({
        id: entry.id,
        nodeId: entry.node.id,
        name: entry.node.title,
        teamId: entry.node.teamId,
        teamName: entry.node.team.name,
        columns: entry.columns.map((column) => ({
          id: column.id,
          name: column.name,
          behaviorKey: column.behavior.key,
          position: column.position,
        })),
      })),
    };
  }

  private shouldLogAiContext(): boolean {
    return true;
  }

  private getAiContextLogFilePath(): string | null {
    return path.resolve(process.cwd(), 'quick-notes-ai.log');
  }

  private buildAiContextLogPayload(
    context: NoteContext,
    maxSuggestions: number,
  ) {
    return {
      note: context.note,
      board: context.board
        ? {
            id: context.board.id,
            nodeId: context.board.nodeId,
            name: context.board.name,
            hierarchy: context.board.hierarchy,
            columns: context.board.columns,
            nodes: context.board.nodes.slice(0, 60).map((node) => ({
              id: node.id,
              title: node.title,
              columnId: node.columnId,
              parentId: node.parentId,
            })),
            recentComments: context.board.recentComments
              .slice(0, 60)
              .map((comment) => ({
                nodeId: comment.nodeId,
                createdAt: comment.createdAt,
              })),
            recentActivity: context.board.recentActivity
              .slice(0, 60)
              .map((entry) => ({
                nodeId: entry.nodeId,
                type: entry.type,
                createdAt: entry.createdAt,
              })),
          }
        : null,
      availableBoards: context.availableBoards.slice(0, 20),
      boardsIndex: context.boardsIndex?.slice(0, 40) ?? [],
      maxSuggestions,
    };
  }

  private async logAiContext(
    source: 'suggest' | 'refine',
    context: NoteContext,
    maxSuggestions: number,
  ): Promise<void> {
    if (!this.shouldLogAiContext()) {
      return;
    }

    const payload = this.buildAiContextLogPayload(context, maxSuggestions);
    const logLine = `[QuickNotesAI:${source}] ${JSON.stringify(payload)}`;
    this.logger.log(logLine);

    const logFilePath = this.getAiContextLogFilePath();
    if (!logFilePath) {
      return;
    }

    try {
      await appendFile(logFilePath, `${logLine}\n`, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de log';
      this.logger.warn(`AI context log file failed: ${message}`);
    }
  }

  private buildHeuristicSuggestions(
    context: NoteContext,
    options: { instructions: string | null; feedback: string | null },
    maxSuggestions: number,
  ): SuggestionGenerationResult {
    const suggestions: QuickNoteAiSuggestionDto[] = [];
    const warnings: string[] = [];
    const noteText = context.note.text.trim();

    const columnById = new Map(
      (context.board?.columns ?? []).map((column) => [column.id, column]),
    );

    const rankedNodes = (context.board?.nodes ?? [])
      .map((node) => ({
        node,
        score: this.computeNodeScore(
          noteText,
          context.note.type,
          node.title,
          node.description,
          columnById.get(node.columnId ?? '')?.behaviorKey ?? null,
        ),
      }))
      .sort((a, b) => b.score - a.score);

    const primaryNode = rankedNodes.length > 0 ? rankedNodes[0] : null;
    const doneColumn = context.board?.columns.find(
      (column) => column.behaviorKey === ColumnBehaviorKey.DONE,
    );
    const blockedColumn = context.board?.columns.find(
      (column) => column.behaviorKey === ColumnBehaviorKey.BLOCKED,
    );
    const inProgressColumn = context.board?.columns.find(
      (column) => column.behaviorKey === ColumnBehaviorKey.IN_PROGRESS,
    );

    const progressOverride = this.extractProgressOverride(options.feedback);

    if (progressOverride !== null && primaryNode?.node) {
      suggestions.push({
        id: `sug_${suggestions.length + 1}`,
        title: `Mettre l'avancement de "${primaryNode.node.title}" à ${progressOverride}%`,
        why: 'Le feedback contient une valeur de progression explicite.',
        confidence: 0.8,
        actions: [
          {
            type: 'UPDATE_NODE_FIELDS',
            params: {
              nodeId: primaryNode.node.id,
              fields: { progress: progressOverride },
            },
          },
        ],
      });
    }

    if (
      context.note.type === QuickNoteType.DONE &&
      primaryNode?.node &&
      doneColumn
    ) {
      const currentBehavior =
        columnById.get(primaryNode.node.columnId ?? '')?.behaviorKey ?? null;
      if (currentBehavior !== ColumnBehaviorKey.DONE) {
        suggestions.push({
          id: `sug_${suggestions.length + 1}`,
          title: `Déplacer "${primaryNode.node.title}" vers "${doneColumn.name}"`,
          why: 'La note est marquée FAIT.',
          confidence: 0.78,
          actions: [
            {
              type: 'MOVE_NODE_TO_COLUMN',
              params: {
                nodeId: primaryNode.node.id,
                targetColumnId: doneColumn.id,
              },
            },
            {
              type: 'ADD_COMMENT',
              params: {
                nodeId: primaryNode.node.id,
                body: `Validation depuis Quick Note: ${noteText}`,
              },
            },
          ],
        });
      }
    }

    if (context.note.type === QuickNoteType.WAITING && primaryNode?.node) {
      const targetColumn =
        blockedColumn ??
        inProgressColumn ??
        context.board?.columns.find(
          (column) => column.behaviorKey !== ColumnBehaviorKey.DONE,
        );
      const actions: QuickNoteAiActionDto[] = [
        {
          type: 'ADD_COMMENT',
          params: {
            nodeId: primaryNode.node.id,
            body: `Attente identifiée depuis Quick Note: ${noteText}`,
          },
        },
      ];
      if (
        targetColumn &&
        (columnById.get(primaryNode.node.columnId ?? '')?.behaviorKey ??
          null) !== targetColumn.behaviorKey
      ) {
        actions.unshift({
          type: 'MOVE_NODE_TO_COLUMN',
          params: {
            nodeId: primaryNode.node.id,
            targetColumnId: targetColumn.id,
          },
        });
      }
      suggestions.push({
        id: `sug_${suggestions.length + 1}`,
        title: `Mettre à jour "${primaryNode.node.title}" en mode attente`,
        why: 'La note est de type ATTENTE.',
        confidence: 0.74,
        actions,
      });
    }

    if (
      context.note.type === QuickNoteType.NOTE &&
      primaryNode?.node &&
      primaryNode.score > 0
    ) {
      suggestions.push({
        id: `sug_${suggestions.length + 1}`,
        title: `Ajouter la note en commentaire sur "${primaryNode.node.title}"`,
        why: 'La note ressemble à une information de suivi.',
        confidence: 0.72,
        actions: [
          {
            type: 'ADD_COMMENT',
            params: {
              nodeId: primaryNode.node.id,
              body: `Quick Note: ${noteText}`,
            },
          },
        ],
      });
    }

    const filtered = suggestions
      .slice(0, maxSuggestions)
      .map((suggestion, index) => ({
        ...suggestion,
        id: `sug_${index + 1}`,
      }));

    if (!filtered.length) {
      warnings.push('Aucune action pertinente détectée pour cette note.');
    }

    return {
      provider: 'heuristic',
      model: SUGGESTION_MODEL_HEURISTIC,
      warnings,
      suggestions: this.attachLabels(context, filtered),
    };
  }

  private async tryGenerateWithLlm(
    context: NoteContext,
    options: { instructions: string | null; feedback: string | null },
    maxSuggestions: number,
    aiSettings: AiRuntimeSettings,
  ): Promise<SuggestionGenerationResult | null> {
    const provider = this.normalizeText(aiSettings.provider);
    if (!provider || provider.toLowerCase() === 'heuristic') {
      return null;
    }

    const lowerProvider = provider.toLowerCase();
    const model =
      this.normalizeText(aiSettings.model) ??
      (lowerProvider === 'anthropic'
        ? 'claude-3-5-sonnet-latest'
        : lowerProvider === 'ollama'
          ? 'llama3.1'
          : 'gpt-4.1-mini');

    const promptPayload = {
      note: {
        text: context.note.text,
        type: context.note.type,
        createdAt: context.note.createdAt,
      },
      board: context.board
        ? {
            id: context.board.id,
            nodeId: context.board.nodeId,
            name: context.board.name,
            hierarchy: context.board.hierarchy,
            columns: context.board.columns,
            nodes: context.board.nodes.slice(0, 60),
            recentComments: context.board.recentComments.slice(0, 60),
            recentActivity: context.board.recentActivity.slice(0, 60),
          }
        : null,
      availableBoards: context.availableBoards.slice(0, 20),
      boardsIndex: context.boardsIndex?.slice(0, 40) ?? [],
      actionsCatalog: this.getActionsCatalog(),
      instructions: options.instructions,
      feedback: options.feedback,
      maxSuggestions,
    };

    try {
      let rawText: string | null = null;
      if (lowerProvider === 'anthropic') {
        rawText = await this.callAnthropic(model, promptPayload, aiSettings);
      } else if (lowerProvider === 'ollama') {
        rawText = await this.callOllama(model, promptPayload, aiSettings);
      } else {
        rawText = await this.callOpenAiCompatible(
          lowerProvider,
          model,
          promptPayload,
          aiSettings,
        );
      }

      if (!rawText) {
        return {
          provider: lowerProvider,
          model,
          warnings: ['Le provider IA a répondu sans contenu exploitable.'],
          suggestions: [],
        };
      }

      const parsedPayload = this.parseJsonPayload(rawText);
      if (!parsedPayload) {
        return {
          provider: lowerProvider,
          model,
          warnings: ['Réponse IA non JSON, fallback heuristique.'],
          suggestions: [],
        };
      }

      const suggestionsRaw = Array.isArray((parsedPayload as any).suggestions)
        ? ((parsedPayload as any).suggestions as unknown[])
        : [];

      const suggestions = suggestionsRaw
        .map((item, index) => this.normalizeSuggestion(item, index + 1))
        .filter((item): item is QuickNoteAiSuggestionDto => Boolean(item));

      const validatedSuggestions = this.filterSuggestionsByContext(
        context,
        suggestions,
      ).slice(0, maxSuggestions);

      return {
        provider: lowerProvider,
        model,
        warnings: [],
        suggestions: this.attachLabels(context, validatedSuggestions),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur IA';
      this.logger.warn(`IA provider ${lowerProvider} failed: ${message}`);
      return {
        provider: lowerProvider,
        model,
        warnings: [`Provider IA indisponible (${message}).`],
        suggestions: [],
      };
    }
  }

  private async callOpenAiCompatible(
    provider: string,
    model: string,
    payload: Record<string, unknown>,
    settings: AiRuntimeSettings,
  ): Promise<string | null> {
    const apiKey = this.normalizeText(settings.apiKey);
    const configuredBaseUrl = this.normalizeText(settings.baseUrl);

    const baseUrl =
      configuredBaseUrl ??
      (provider === 'openai' || provider === 'custom'
        ? 'https://api.openai.com/v1'
        : provider === 'mistral'
          ? 'https://api.mistral.ai/v1'
          : provider === 'gemini'
            ? 'https://generativelanguage.googleapis.com/v1beta/openai'
            : null);

    if (!baseUrl) {
      throw new Error(
        'AI_BASE_URL requis pour ce provider (openai-compatible).',
      );
    }

    if (!apiKey) {
      throw new Error('AI_API_KEY manquant.');
    }

    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await this.postJson(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: JSON.stringify(payload),
            },
          ],
        }),
      },
      settings.timeoutMs,
    );

    const content =
      response?.choices?.[0]?.message?.content ??
      response?.choices?.[0]?.text ??
      null;
    return typeof content === 'string' ? content : null;
  }

  private async callAnthropic(
    model: string,
    payload: Record<string, unknown>,
    settings: AiRuntimeSettings,
  ): Promise<string | null> {
    const apiKey = this.normalizeText(settings.apiKey);
    const baseUrl =
      this.normalizeText(settings.baseUrl) ?? 'https://api.anthropic.com/v1';
    if (!apiKey) {
      throw new Error('AI_API_KEY manquant.');
    }

    const response = await this.postJson(
      `${baseUrl.replace(/\/$/, '')}/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1400,
          temperature: 0.2,
          system: this.getSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: JSON.stringify(payload),
            },
          ],
        }),
      },
      settings.timeoutMs,
    );

    const content = Array.isArray(response?.content)
      ? response.content.find((part: any) => part?.type === 'text')?.text
      : null;
    return typeof content === 'string' ? content : null;
  }

  private async callOllama(
    model: string,
    payload: Record<string, unknown>,
    settings: AiRuntimeSettings,
  ): Promise<string | null> {
    const baseUrl =
      this.normalizeText(settings.baseUrl) ?? 'http://localhost:11434';

    const response = await this.postJson(
      `${baseUrl.replace(/\/$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: JSON.stringify(payload),
            },
          ],
        }),
      },
      settings.timeoutMs,
    );

    const content = response?.message?.content ?? null;
    return typeof content === 'string' ? content : null;
  }

  private async postJson(
    url: string,
    init: Record<string, unknown>,
    timeoutOverride?: number | null,
  ): Promise<any> {
    const fetchFn = (globalThis as any).fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error('Fetch non disponible dans cet environnement.');
    }

    const timeoutMsRaw =
      typeof timeoutOverride === 'number'
        ? timeoutOverride
        : Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 15_000) || 15_000;
    const timeoutMs = Math.max(3_000, Math.min(timeoutMsRaw, 120_000));

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetchFn(url, {
        ...(init as object),
        signal: abortController.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
      }
      if (!text.trim()) return {};
      return JSON.parse(text);
    } finally {
      clearTimeout(timeout);
    }
  }

  private getSystemPrompt(): string {
    return [
      "Tu es un assistant d'orchestration Quick Notes pour un kanban.",
      'Tu dois répondre UNIQUEMENT en JSON avec la structure:',
      '{ "suggestions": [ { "title": string, "why": string, "confidence": number, "actions": [ { "type": string, "params": object } ] } ] }',
      `Types d'action autorisés: ${AI_ALLOWED_ACTION_TYPES.join(', ')}`,
      "N'utilise aucun autre type.",
      'La note est informative et temporaire: ne propose aucune action sur la quick note.',
      "La note n'est pas une carte et n'a pas d'ID a utiliser.",
      "N'utilise que des IDs provenant de board/columns/nodes/availableBoards/boardsIndex.",
      "N'invente jamais d'ID. Si tu ne peux pas lier la note a une carte existante, propose seulement un commentaire generique ou aucune suggestion.",
      'Actions autorisees: CREATE_CHILD_TASK, MOVE_NODE_TO_COLUMN, UPDATE_NODE_FIELDS, APPEND_NODE_DESCRIPTION, ADD_COMMENT.',
      'UPDATE_NODE_FIELDS ne peut modifier que description, dueAt, progress, priority.',
      'APPEND_NODE_DESCRIPTION ajoute du texte a la description (ne remplace pas).',
      'Pour CREATE_CHILD_TASK, choisis parentNodeId dans board.hierarchy (taches + sous-taches).',
      'Si board est null, tu peux choisir un kanban dans boardsIndex et utiliser son nodeId comme parentNodeId.',
      'Ne cible jamais la tache principale (board.nodeId).',
      'Si la note mentionne un projet en MAJUSCULES, utilise-le pour choisir la tache mere la plus pertinente.',
      'Ne propose que des actions concrètes et exécutables.',
      'Le payload contient actionsCatalog et boardsIndex pour guider tes choix.',
      'confidence doit être entre 0 et 1.',
      "Il n'y a aucune obligation de proposer 3 suggestions.",
      'Ne dépasse pas le nombre demandé de suggestions.',
    ].join(' ');
  }

  private getActionsCatalog(): Array<{
    type: QuickNoteAiActionType;
    description: string;
    params: Record<string, string>;
  }> {
    return [
      {
        type: 'CREATE_CHILD_TASK',
        description: 'Créer une tâche sous un parent.',
        params: {
          parentNodeId: 'ID du parent (tâche mère ou sous-tâche)',
          title: 'Titre de la tâche',
          description: 'Description optionnelle',
          dueAt: 'Echeance ISO optionnelle',
        },
      },
      {
        type: 'MOVE_NODE_TO_COLUMN',
        description: 'Déplacer une carte vers une autre colonne.',
        params: {
          nodeId: 'ID de la carte',
          targetColumnId: 'ID de la colonne cible',
          position: 'Position optionnelle (entier)',
        },
      },
      {
        type: 'UPDATE_NODE_FIELDS',
        description: 'Mettre à jour les champs autorisés d’une carte.',
        params: {
          nodeId: 'ID de la carte',
          fields: '{ description?, dueAt?, progress?, priority? }',
        },
      },
      {
        type: 'APPEND_NODE_DESCRIPTION',
        description: 'Ajouter du texte a la description d’une carte.',
        params: {
          nodeId: 'ID de la carte',
          text: 'Texte a ajouter a la description',
        },
      },
      {
        type: 'ADD_COMMENT',
        description: 'Ajouter un commentaire à une carte.',
        params: {
          nodeId: 'ID de la carte',
          body: 'Contenu du commentaire',
        },
      },
    ];
  }

  private parseJsonPayload(input: string): Record<string, unknown> | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const candidate = trimmed.slice(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(candidate) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private normalizeSuggestion(
    value: unknown,
    index: number,
  ): QuickNoteAiSuggestionDto | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const raw = value as Record<string, unknown>;
    const title = this.normalizeText(raw.title);
    const why = this.normalizeText(raw.why);
    if (!title || !why) {
      return null;
    }

    const confidenceRaw =
      typeof raw.confidence === 'number' ? raw.confidence : 0.5;
    const confidence = Math.max(0, Math.min(1, confidenceRaw));

    const actionsRaw = Array.isArray(raw.actions) ? raw.actions : [];
    const actions = actionsRaw
      .map((entry) => this.normalizeAction(entry))
      .filter((entry): entry is NormalizedAction => Boolean(entry))
      .map((entry) => ({
        type: entry.type,
        params: entry.params,
      }));

    if (!actions.length) {
      return null;
    }

    return {
      id: `sug_${index}`,
      title,
      why,
      confidence,
      actions,
    };
  }

  private attachLabels(
    context: NoteContext,
    suggestions: QuickNoteAiSuggestionDto[],
  ): QuickNoteAiSuggestionDto[] {
    const nodeById = new Map(
      (context.board?.nodes ?? []).map((node) => [node.id, node.title]),
    );
    for (const node of context.board?.hierarchy ?? []) {
      if (!nodeById.has(node.id)) {
        nodeById.set(node.id, node.title);
      }
    }
    const columnById = new Map(
      (context.board?.columns ?? []).map((column) => [column.id, column.name]),
    );

    for (const board of context.boardsIndex ?? []) {
      for (const column of board.columns ?? []) {
        if (!columnById.has(column.id)) {
          columnById.set(column.id, column.name);
        }
      }
    }

    for (const board of context.boardsIndex ?? []) {
      if (!nodeById.has(board.nodeId)) {
        nodeById.set(board.nodeId, board.name);
      }
    }

    return suggestions.map((suggestion) => ({
      ...suggestion,
      actions: suggestion.actions.map((action) => ({
        ...action,
        labels: this.buildActionLabels(action, nodeById, columnById),
      })),
    }));
  }

  private filterSuggestionsByContext(
    context: NoteContext,
    suggestions: QuickNoteAiSuggestionDto[],
  ): QuickNoteAiSuggestionDto[] {
    const nodeIds = new Set(
      (context.board?.nodes ?? []).map((node) => node.id),
    );
    const rootNodeId = context.board?.nodeId ?? null;
    for (const node of context.board?.hierarchy ?? []) {
      nodeIds.add(node.id);
    }
    for (const board of context.boardsIndex ?? []) {
      nodeIds.add(board.nodeId);
    }
    const columnIds = new Set(
      (context.board?.columns ?? []).map((column) => column.id),
    );

    return suggestions
      .map((suggestion) => {
        const actions = suggestion.actions.filter((action) => {
          if (action.type === 'MOVE_NODE_TO_COLUMN') {
            const nodeId = this.normalizeText(action.params?.nodeId);
            const targetColumnId = this.normalizeText(
              action.params?.targetColumnId,
            );
            return Boolean(
              nodeId &&
                targetColumnId &&
                nodeIds.has(nodeId) &&
                (!rootNodeId || nodeId !== rootNodeId) &&
                columnIds.has(targetColumnId),
            );
          }

          if (
            action.type === 'UPDATE_NODE_FIELDS' ||
            action.type === 'ADD_COMMENT' ||
            action.type === 'APPEND_NODE_DESCRIPTION'
          ) {
            const nodeId = this.normalizeText(action.params?.nodeId);
            return Boolean(
              nodeId &&
                nodeIds.has(nodeId) &&
                (!rootNodeId || nodeId !== rootNodeId),
            );
          }

          if (action.type === 'CREATE_CHILD_TASK') {
            const parentNodeId = this.normalizeText(
              action.params?.parentNodeId,
            );
            return Boolean(parentNodeId && nodeIds.has(parentNodeId));
          }

          return true;
        });

        return actions.length
          ? {
              ...suggestion,
              actions,
            }
          : null;
      })
      .filter((suggestion): suggestion is QuickNoteAiSuggestionDto =>
        Boolean(suggestion),
      );
  }

  private buildActionLabels(
    action: QuickNoteAiActionDto,
    nodeById: Map<string, string>,
    columnById: Map<string, string>,
  ): Record<string, string> | undefined {
    const labels: Record<string, string> = {};
    if (action.type === 'MOVE_NODE_TO_COLUMN') {
      const nodeId = this.normalizeText(action.params?.nodeId);
      const targetColumnId = this.normalizeText(action.params?.targetColumnId);
      if (nodeId && nodeById.has(nodeId)) {
        labels.nodeTitle = nodeById.get(nodeId) as string;
      }
      if (targetColumnId && columnById.has(targetColumnId)) {
        labels.targetColumnName = columnById.get(targetColumnId) as string;
      }
    }

    if (
      action.type === 'UPDATE_NODE_FIELDS' ||
      action.type === 'ADD_COMMENT' ||
      action.type === 'APPEND_NODE_DESCRIPTION'
    ) {
      const nodeId = this.normalizeText(action.params?.nodeId);
      if (nodeId && nodeById.has(nodeId)) {
        labels.nodeTitle = nodeById.get(nodeId) as string;
      }
    }

    if (action.type === 'CREATE_CHILD_TASK') {
      const parentNodeId = this.normalizeText(action.params?.parentNodeId);
      if (parentNodeId && nodeById.has(parentNodeId)) {
        labels.parentTitle = nodeById.get(parentNodeId) as string;
      }
    }

    return Object.keys(labels).length ? labels : undefined;
  }

  private normalizeAction(input: unknown): NormalizedAction | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }

    const action = input as Record<string, unknown>;
    const type =
      typeof action.type === 'string' ? action.type.trim().toUpperCase() : '';
    if (!ACTION_TYPE_SET.has(type)) {
      return null;
    }

    const paramsValue = action.params;
    const params =
      paramsValue &&
      typeof paramsValue === 'object' &&
      !Array.isArray(paramsValue)
        ? { ...(paramsValue as Record<string, unknown>) }
        : {};

    switch (type as QuickNoteAiActionType) {
      case 'MOVE_NODE_TO_COLUMN': {
        const nodeId = this.normalizeText(params.nodeId);
        const targetColumnId = this.normalizeText(params.targetColumnId);
        if (!nodeId || !targetColumnId) {
          return null;
        }
        const out: Record<string, unknown> = {
          nodeId,
          targetColumnId,
        };
        const position = this.readOptionalInteger(params, 'position');
        if (position !== null) {
          out.position = position;
        }
        return {
          type: 'MOVE_NODE_TO_COLUMN',
          params: out,
        };
      }

      case 'UPDATE_NODE_FIELDS': {
        const nodeId = this.normalizeText(params.nodeId);
        if (!nodeId) return null;
        const fields = this.readObject(params, 'fields');
        if (!fields) return null;
        const patch = this.sanitizeUpdateFields(fields);
        if (!Object.keys(patch).length) return null;
        return {
          type: 'UPDATE_NODE_FIELDS',
          params: { nodeId, fields: patch },
        };
      }

      case 'ADD_COMMENT': {
        const nodeId = this.normalizeText(params.nodeId);
        const body = this.normalizeText(params.body);
        if (!nodeId || !body) {
          return null;
        }
        return {
          type: 'ADD_COMMENT',
          params: { nodeId, body: body.slice(0, 5000) },
        };
      }

      case 'CREATE_CHILD_TASK': {
        const parentNodeId = this.normalizeText(params.parentNodeId);
        const title = this.normalizeText(params.title);
        if (!parentNodeId || !title) {
          return null;
        }
        const out: Record<string, unknown> = {
          parentNodeId,
          title: title.slice(0, 200),
        };
        const description = this.normalizeText(params.description);
        const dueAt = this.normalizeText(params.dueAt);
        if (description) out.description = description.slice(0, 50000);
        if (dueAt) out.dueAt = dueAt;
        return {
          type: 'CREATE_CHILD_TASK',
          params: out,
        };
      }

      case 'APPEND_NODE_DESCRIPTION': {
        const nodeId = this.normalizeText(params.nodeId);
        const text = this.normalizeText(params.text);
        if (!nodeId || !text) {
          return null;
        }
        return {
          type: 'APPEND_NODE_DESCRIPTION',
          params: { nodeId, text: text.slice(0, 5000) },
        };
      }

      default:
        return null;
    }
  }

  private sanitizeUpdateFields(
    fields: Record<string, unknown>,
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {};

    if (fields.description === null) patch.description = null;
    else {
      const description = this.normalizeText(fields.description);
      if (description) patch.description = description.slice(0, 50000);
    }

    if (fields.dueAt === null) patch.dueAt = null;
    else {
      const dueAt = this.normalizeText(fields.dueAt);
      if (dueAt) patch.dueAt = dueAt;
    }

    if (
      typeof fields.progress === 'number' &&
      Number.isFinite(fields.progress)
    ) {
      patch.progress = Math.max(0, Math.min(100, Math.round(fields.progress)));
    }

    if (typeof fields.priority === 'string') {
      const candidate = fields.priority.trim().toUpperCase();
      if (
        ['NONE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'].includes(
          candidate,
        )
      ) {
        patch.priority = candidate;
      }
    }

    return patch;
  }

  private deriveTaskTitle(text: string): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (!compact) return 'Action issue de Quick Note';
    if (compact.length <= 80) return compact;
    return `${compact.slice(0, 77)}...`;
  }

  private computeNodeScore(
    noteText: string,
    noteType: QuickNoteType,
    title: string,
    description: string | null,
    behaviorKey: ColumnBehaviorKey | null,
  ): number {
    const normalizedText = noteText.toLowerCase().trim();
    const titleLower = title.toLowerCase();
    const descriptionLower = (description ?? '').toLowerCase();

    let score = 0;
    if (normalizedText && titleLower.includes(normalizedText)) {
      score += 8;
    }
    if (normalizedText && descriptionLower.includes(normalizedText)) {
      score += 5;
    }

    const tokens = normalizedText
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);
    for (const token of tokens) {
      if (titleLower.includes(token)) score += 2;
      if (descriptionLower.includes(token)) score += 1;
    }

    if (
      noteType === QuickNoteType.DONE &&
      behaviorKey !== ColumnBehaviorKey.DONE
    ) {
      score += 2;
    }
    if (noteType === QuickNoteType.WAITING) {
      if (behaviorKey === ColumnBehaviorKey.BLOCKED) score += 3;
      if (behaviorKey === ColumnBehaviorKey.IN_PROGRESS) score += 2;
    }

    return score;
  }

  private extractProgressOverride(text: string | null): number | null {
    if (!text) return null;
    const match = text.match(/(\d{1,3})\s*%/);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(100, value));
  }

  private extractQuotedValue(
    text: string | null,
    keyword: string,
  ): string | null {
    if (!text) return null;
    const pattern = new RegExp(`${keyword}\\s*["“']([^"”']+)["”']`, 'i');
    const match = text.match(pattern);
    return match?.[1]?.trim() || null;
  }

  private normalizeMaxSuggestions(value?: number): number {
    if (!value || !Number.isFinite(value)) {
      return DEFAULT_MAX_SUGGESTIONS;
    }
    const rounded = Math.round(value);
    if (rounded < 1) return 1;
    if (rounded > MAX_SUGGESTIONS) return MAX_SUGGESTIONS;
    return rounded;
  }

  private normalizeText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private async resolveAiSettings(userId: string): Promise<AiRuntimeSettings> {
    const userSettings = await this.usersService.getAiSettings(userId);
    const hasUserSettings = Boolean(userSettings.updatedAt);

    if (hasUserSettings) {
      return {
        provider: userSettings.provider,
        model: userSettings.model,
        baseUrl: userSettings.baseUrl,
        apiKey: userSettings.apiKey,
        timeoutMs: userSettings.timeoutMs,
      };
    }

    return {
      provider: this.normalizeText(this.config.get<string>('AI_PROVIDER')),
      model: this.normalizeText(this.config.get<string>('AI_MODEL')),
      baseUrl: this.normalizeText(this.config.get<string>('AI_BASE_URL')),
      apiKey: this.normalizeText(this.config.get<string>('AI_API_KEY')),
      timeoutMs:
        Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 15_000) || 15_000,
    };
  }

  private readObject(
    source: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> | null {
    const value = source[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readRequiredString(
    source: Record<string, unknown>,
    key: string,
  ): string {
    const value = this.normalizeText(source[key]);
    if (!value) {
      throw new BadRequestException(`Paramètre requis manquant: ${key}`);
    }
    return value;
  }

  private readOptionalString(
    source: Record<string, unknown>,
    key: string,
  ): string | null {
    const raw = source[key];
    if (raw === null || raw === undefined) return null;
    return this.normalizeText(raw);
  }

  private readOptionalInteger(
    source: Record<string, unknown>,
    key: string,
  ): number | null {
    const raw = source[key];
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    const rounded = Math.round(raw);
    if (rounded < 0) return 0;
    return rounded;
  }
}
