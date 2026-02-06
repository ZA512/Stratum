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
import { AttachQuickNoteDto } from './dto/attach-quick-note.dto';
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

const MAX_ACTIONS_PER_REQUEST = 25;
const DEFAULT_MAX_SUGGESTIONS = 3;
const MAX_SUGGESTIONS = 10;
const ACTION_TYPE_SET = new Set<string>(QUICK_NOTE_AI_ACTION_TYPES);
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
};

@Injectable()
export class QuickNotesAiService {
  private readonly logger = new Logger(QuickNotesAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodesService: NodesService,
    private readonly quickNotesService: QuickNotesService,
    private readonly config: ConfigService,
  ) {}

  async suggest(
    userId: string,
    noteId: string,
    dto: QuickNoteAiSuggestRequestDto,
  ): Promise<QuickNoteAiSuggestResponseDto> {
    const context = await this.loadContext(userId, noteId);
    const maxSuggestions = this.normalizeMaxSuggestions(dto?.maxSuggestions);
    const instructions = this.normalizeText(dto?.instructions);

    const heuristicResult = this.buildHeuristicSuggestions(
      context,
      { instructions, feedback: null },
      maxSuggestions,
    );

    const llmResult = await this.tryGenerateWithLlm(
      context,
      { instructions, feedback: null },
      maxSuggestions,
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

    const heuristicResult = this.buildHeuristicSuggestions(
      context,
      { instructions, feedback },
      maxSuggestions,
    );

    const llmResult = await this.tryGenerateWithLlm(
      context,
      { instructions, feedback },
      maxSuggestions,
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
        if (action.type === 'TREAT_QUICK_NOTE') {
          treated = true;
        }
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
        results.push({
          index: results.length,
          type: 'TREAT_QUICK_NOTE',
          success: false,
          message:
            error instanceof Error
              ? error.message
              : 'Impossible de traiter la note.',
        });
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

      case 'ATTACH_QUICK_NOTE_TO_KANBAN': {
        const kanbanReference = this.readOptionalString(
          action.params,
          'kanbanId',
        );
        const kanbanId = await this.resolveBoardReference(
          userId,
          kanbanReference,
        );
        const payload: AttachQuickNoteDto = { kanbanId };
        await this.quickNotesService.attach(userId, noteId, payload);
        return kanbanId
          ? 'Quick note rattachée au kanban.'
          : 'Lien kanban retiré de la quick note.';
      }

      case 'TREAT_QUICK_NOTE': {
        await this.quickNotesService.treat(userId, noteId);
        return 'Quick note traitée.';
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
        const nodes = await this.prisma.node.findMany({
          where: {
            archivedAt: null,
            parentId: boardRecord.node.id,
            columnId: { in: columnIds },
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
          },
          orderBy: [{ position: 'asc' }],
          take: 200,
        });

        const nodeIds = nodes.map((node) => node.id);
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
    };
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
    const backlogColumn = context.board?.columns.find(
      (column) => column.behaviorKey === ColumnBehaviorKey.BACKLOG,
    );

    const progressOverride = this.extractProgressOverride(options.feedback);
    const boardHint = this.extractQuotedValue(options.feedback, 'kanban');
    const hintedBoard = boardHint
      ? context.availableBoards.find((board) =>
          board.name.toLowerCase().includes(boardHint.toLowerCase()),
        )
      : null;

    if (!context.note.kanbanId && hintedBoard) {
      suggestions.push({
        id: `sug_${suggestions.length + 1}`,
        title: `Rattacher la note au kanban "${hintedBoard.name}"`,
        why: 'Le feedback mentionne explicitement ce kanban.',
        confidence: 0.86,
        actions: [
          {
            type: 'ATTACH_QUICK_NOTE_TO_KANBAN',
            params: { kanbanId: hintedBoard.id },
          },
        ],
      });
    }

    if (
      !context.note.kanbanId &&
      !hintedBoard &&
      context.availableBoards.length
    ) {
      const topBoard = context.availableBoards[0];
      suggestions.push({
        id: `sug_${suggestions.length + 1}`,
        title: `Rattacher la note au kanban "${topBoard.name}"`,
        why: "La note n'est liée à aucun kanban, le rattachement accélère le traitement.",
        confidence: 0.55,
        actions: [
          {
            type: 'ATTACH_QUICK_NOTE_TO_KANBAN',
            params: { kanbanId: topBoard.id },
          },
        ],
      });
    }

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
        {
          type: 'UPDATE_NODE_FIELDS',
          params: {
            nodeId: primaryNode.node.id,
            fields: {
              blockedReason: noteText,
              isBlockResolved: false,
            },
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

    if (context.board?.nodeId) {
      const preferredColumn =
        backlogColumn ??
        context.board.columns.find(
          (column) => column.behaviorKey !== ColumnBehaviorKey.DONE,
        ) ??
        context.board.columns[0] ??
        null;
      const taskTitle = this.deriveTaskTitle(noteText);
      const actionList: QuickNoteAiActionDto[] = [
        {
          type: 'CREATE_CHILD_TASK',
          params: {
            parentNodeId: context.board.nodeId,
            title: taskTitle,
            description: noteText,
          },
        },
      ];
      if (preferredColumn) {
        actionList.push({
          type: 'ADD_COMMENT',
          params: {
            nodeId: context.board.nodeId,
            body: `Création d'une tâche issue de Quick Note dans "${preferredColumn.name}".`,
          },
        });
      }
      suggestions.push({
        id: `sug_${suggestions.length + 1}`,
        title: `Créer une nouvelle carte à partir de la note`,
        why: "Aucune correspondance fiable n'est garantie, création d'une carte dédiée.",
        confidence: 0.61,
        actions: actionList,
      });
    }

    if (!suggestions.length) {
      suggestions.push({
        id: 'sug_1',
        title: 'Marquer la quick note comme traitée',
        why: 'Fallback: pas assez de contexte pour proposer une action plus ciblée.',
        confidence: 0.3,
        actions: [
          {
            type: 'TREAT_QUICK_NOTE',
            params: {},
          },
        ],
      });
      warnings.push('Contexte limité, suggestion générique utilisée.');
    }

    const filtered = suggestions
      .slice(0, maxSuggestions)
      .map((suggestion, index) => ({
        ...suggestion,
        id: `sug_${index + 1}`,
      }));

    return {
      provider: 'heuristic',
      model: SUGGESTION_MODEL_HEURISTIC,
      warnings,
      suggestions: filtered,
    };
  }

  private async tryGenerateWithLlm(
    context: NoteContext,
    options: { instructions: string | null; feedback: string | null },
    maxSuggestions: number,
  ): Promise<SuggestionGenerationResult | null> {
    const provider = this.normalizeText(this.config.get<string>('AI_PROVIDER'));
    if (!provider || provider.toLowerCase() === 'heuristic') {
      return null;
    }

    const lowerProvider = provider.toLowerCase();
    const model =
      this.normalizeText(this.config.get<string>('AI_MODEL')) ??
      (lowerProvider === 'anthropic'
        ? 'claude-3-5-sonnet-latest'
        : lowerProvider === 'ollama'
          ? 'llama3.1'
          : 'gpt-4.1-mini');

    const promptPayload = {
      note: context.note,
      board: context.board
        ? {
            id: context.board.id,
            nodeId: context.board.nodeId,
            name: context.board.name,
            columns: context.board.columns,
            nodes: context.board.nodes.slice(0, 60),
            recentComments: context.board.recentComments.slice(0, 60),
            recentActivity: context.board.recentActivity.slice(0, 60),
          }
        : null,
      availableBoards: context.availableBoards.slice(0, 20),
      instructions: options.instructions,
      feedback: options.feedback,
      maxSuggestions,
    };

    try {
      let rawText: string | null = null;
      if (lowerProvider === 'anthropic') {
        rawText = await this.callAnthropic(model, promptPayload);
      } else if (lowerProvider === 'ollama') {
        rawText = await this.callOllama(model, promptPayload);
      } else {
        rawText = await this.callOpenAiCompatible(
          lowerProvider,
          model,
          promptPayload,
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
        .filter((item): item is QuickNoteAiSuggestionDto => Boolean(item))
        .slice(0, maxSuggestions);

      return {
        provider: lowerProvider,
        model,
        warnings: [],
        suggestions,
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
  ): Promise<string | null> {
    const apiKey = this.normalizeText(this.config.get<string>('AI_API_KEY'));
    const configuredBaseUrl = this.normalizeText(
      this.config.get<string>('AI_BASE_URL'),
    );

    const baseUrl =
      configuredBaseUrl ??
      (provider === 'openai'
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
    const response = await this.postJson(url, {
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
    });

    const content =
      response?.choices?.[0]?.message?.content ??
      response?.choices?.[0]?.text ??
      null;
    return typeof content === 'string' ? content : null;
  }

  private async callAnthropic(
    model: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    const apiKey = this.normalizeText(this.config.get<string>('AI_API_KEY'));
    const baseUrl =
      this.normalizeText(this.config.get<string>('AI_BASE_URL')) ??
      'https://api.anthropic.com/v1';
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
    );

    const content = Array.isArray(response?.content)
      ? response.content.find((part: any) => part?.type === 'text')?.text
      : null;
    return typeof content === 'string' ? content : null;
  }

  private async callOllama(
    model: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    const baseUrl =
      this.normalizeText(this.config.get<string>('AI_BASE_URL')) ??
      'http://localhost:11434';

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
    );

    const content = response?.message?.content ?? null;
    return typeof content === 'string' ? content : null;
  }

  private async postJson(
    url: string,
    init: Record<string, unknown>,
  ): Promise<any> {
    const fetchFn = (globalThis as any).fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error('Fetch non disponible dans cet environnement.');
    }

    const timeoutMsRaw =
      Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 15_000) || 15_000;
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
      `Types d'action autorisés: ${QUICK_NOTE_AI_ACTION_TYPES.join(', ')}`,
      "N'utilise aucun autre type.",
      'Ne propose que des actions concrètes et exécutables.',
      'confidence doit être entre 0 et 1.',
      'Ne dépasse pas le nombre demandé de suggestions.',
    ].join(' ');
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

      case 'ATTACH_QUICK_NOTE_TO_KANBAN': {
        const kanbanIdRaw =
          params.kanbanId ?? params.kanbanName ?? params.boardName;
        const kanbanId =
          typeof kanbanIdRaw === 'string'
            ? kanbanIdRaw.trim() || null
            : kanbanIdRaw === null
              ? null
              : null;
        return {
          type: 'ATTACH_QUICK_NOTE_TO_KANBAN',
          params: { kanbanId },
        };
      }

      case 'TREAT_QUICK_NOTE':
        return {
          type: 'TREAT_QUICK_NOTE',
          params: {},
        };

      default:
        return null;
    }
  }

  private sanitizeUpdateFields(
    fields: Record<string, unknown>,
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {};

    const title = this.normalizeText(fields.title);
    if (title) patch.title = title.slice(0, 200);

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

    if (fields.blockedReason === null) patch.blockedReason = null;
    else {
      const blockedReason = this.normalizeText(fields.blockedReason);
      if (blockedReason) patch.blockedReason = blockedReason.slice(0, 5000);
    }

    if (typeof fields.isBlockResolved === 'boolean') {
      patch.isBlockResolved = fields.isBlockResolved;
    }

    if (fields.blockedExpectedUnblockAt === null) {
      patch.blockedExpectedUnblockAt = null;
    } else {
      const blockedExpectedUnblockAt = this.normalizeText(
        fields.blockedExpectedUnblockAt,
      );
      if (blockedExpectedUnblockAt) {
        patch.blockedExpectedUnblockAt = blockedExpectedUnblockAt;
      }
    }

    if (fields.backlogHiddenUntil === null) patch.backlogHiddenUntil = null;
    else {
      const backlogHiddenUntil = this.normalizeText(fields.backlogHiddenUntil);
      if (backlogHiddenUntil) patch.backlogHiddenUntil = backlogHiddenUntil;
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

    if (fields.effort === null) {
      patch.effort = null;
    } else if (typeof fields.effort === 'string') {
      const candidate = fields.effort.trim().toUpperCase();
      if (['UNDER2MIN', 'XS', 'S', 'M', 'L', 'XL', 'XXL'].includes(candidate)) {
        patch.effort = candidate;
      }
    }

    if (Array.isArray(fields.tags)) {
      const tags = Array.from(
        new Set(
          fields.tags
            .map((entry) => this.normalizeText(entry))
            .filter((entry): entry is string => Boolean(entry))
            .map((entry) => entry.slice(0, 32)),
        ),
      ).slice(0, 20);
      patch.tags = tags;
    }

    if (Array.isArray(fields.blockedReminderEmails)) {
      const emails = Array.from(
        new Set(
          fields.blockedReminderEmails
            .map((entry) => this.normalizeText(entry))
            .filter((entry): entry is string => Boolean(entry))
            .map((entry) => entry.toLowerCase()),
        ),
      );
      patch.blockedReminderEmails = emails;
    }

    if (
      typeof fields.blockedReminderIntervalDays === 'number' &&
      Number.isFinite(fields.blockedReminderIntervalDays)
    ) {
      patch.blockedReminderIntervalDays = Math.max(
        1,
        Math.round(fields.blockedReminderIntervalDays),
      );
    } else if (fields.blockedReminderIntervalDays === null) {
      patch.blockedReminderIntervalDays = null;
    }

    return patch;
  }

  private async resolveBoardReference(
    userId: string,
    reference: string | null,
  ): Promise<string | null> {
    if (!reference) {
      return null;
    }

    const byId = await this.prisma.board.findFirst({
      where: {
        id: reference,
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
                behavior: {
                  key: { not: ColumnBehaviorKey.DONE },
                },
              },
            },
          ],
        },
      },
      select: { id: true },
    });
    if (byId) {
      return byId.id;
    }

    const exactMatches = await this.prisma.board.findMany({
      where: {
        node: {
          title: { equals: reference, mode: 'insensitive' },
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
                behavior: {
                  key: { not: ColumnBehaviorKey.DONE },
                },
              },
            },
          ],
        },
      },
      select: { id: true },
      take: 2,
    });
    if (exactMatches.length === 1) {
      return exactMatches[0].id;
    }
    if (exactMatches.length > 1) {
      throw new BadRequestException(
        `Plusieurs kanbans correspondent au nom "${reference}". Préciser l'ID.`,
      );
    }

    const partialMatches = await this.prisma.board.findMany({
      where: {
        node: {
          title: { contains: reference, mode: 'insensitive' },
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
                behavior: {
                  key: { not: ColumnBehaviorKey.DONE },
                },
              },
            },
          ],
        },
      },
      select: { id: true },
      take: 2,
    });

    if (partialMatches.length === 1) {
      return partialMatches[0].id;
    }
    if (partialMatches.length > 1) {
      throw new BadRequestException(
        `Le nom "${reference}" est ambigu. Préciser l'ID du kanban.`,
      );
    }

    throw new NotFoundException(`Kanban introuvable: "${reference}".`);
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
