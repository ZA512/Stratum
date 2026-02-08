import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const QUICK_NOTE_AI_ACTION_TYPES = [
  'MOVE_NODE_TO_COLUMN',
  'UPDATE_NODE_FIELDS',
  'APPEND_NODE_DESCRIPTION',
  'ADD_COMMENT',
  'CREATE_CHILD_TASK',
] as const;

export type QuickNoteAiActionType = (typeof QUICK_NOTE_AI_ACTION_TYPES)[number];

export class QuickNoteAiActionDto {
  @ApiProperty({ enum: QUICK_NOTE_AI_ACTION_TYPES })
  type!: QuickNoteAiActionType;

  @ApiProperty({
    description: "Paramètres de l'action (varie selon le type)",
    type: 'object',
    additionalProperties: true,
  })
  params!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Libellés enrichis pour affichage (optionnel)',
    type: 'object',
    additionalProperties: true,
  })
  labels?: Record<string, string>;
}

export class QuickNoteAiSuggestionDto {
  @ApiProperty({ example: 'sug_01' })
  id!: string;

  @ApiProperty({ example: 'Déplacer la carte "Budget Q1" en Terminé' })
  title!: string;

  @ApiProperty({
    example: 'La note est de type FAIT et la carte associée semble finalisée.',
  })
  why!: string;

  @ApiProperty({ example: 0.82, minimum: 0, maximum: 1 })
  confidence!: number;

  @ApiProperty({ type: QuickNoteAiActionDto, isArray: true })
  actions!: QuickNoteAiActionDto[];
}

export class QuickNoteAiSuggestRequestDto {
  @ApiPropertyOptional({
    example:
      'Concentre-toi sur les cartes bloquées et privilégie une action simple.',
  })
  instructions?: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Nombre maximal de propositions',
    minimum: 1,
    maximum: 10,
  })
  maxSuggestions?: number;
}

export class QuickNoteAiRefineRequestDto {
  @ApiProperty({
    example:
      'La proposition 2 est presque bonne, mais il faut appliquer sur le kanban hhhh et mettre 45%.',
  })
  feedback!: string;

  @ApiPropertyOptional({
    example:
      'Conserve les actions simples et évite les créations de nouvelles tâches.',
  })
  instructions?: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Nombre maximal de propositions',
    minimum: 1,
    maximum: 10,
  })
  maxSuggestions?: number;
}

export class QuickNoteAiSuggestResponseDto {
  @ApiProperty({ example: 'note_123' })
  noteId!: string;

  @ApiProperty({
    example: 'heuristic',
    description: 'Source utilisée (heuristic, openai, anthropic, ollama...)',
  })
  provider!: string;

  @ApiProperty({
    example: 'gpt-4.1-mini',
    description: 'Modèle utilisé quand applicable',
  })
  model!: string;

  @ApiProperty({ type: QuickNoteAiSuggestionDto, isArray: true })
  suggestions!: QuickNoteAiSuggestionDto[];

  @ApiProperty({ isArray: true, type: String })
  warnings!: string[];
}

export class QuickNoteAiExecuteRequestDto {
  @ApiProperty({ type: QuickNoteAiActionDto, isArray: true })
  actions!: QuickNoteAiActionDto[];

  @ApiPropertyOptional({
    example: true,
    description:
      'Traiter automatiquement la quick note à la fin si toutes les actions réussissent',
  })
  treatQuickNoteOnSuccess?: boolean;
}

export class QuickNoteAiExecutionResultDto {
  @ApiProperty({ example: 0 })
  index!: number;

  @ApiProperty({ enum: QUICK_NOTE_AI_ACTION_TYPES })
  type!: QuickNoteAiActionType;

  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    example: 'Carte déplacée vers la colonne Terminé',
    description: "Message d'exécution",
  })
  message!: string;
}

export class QuickNoteAiExecuteResponseDto {
  @ApiProperty({ example: 'note_123' })
  noteId!: string;

  @ApiProperty({ example: 4 })
  totalActions!: number;

  @ApiProperty({ example: 3 })
  succeeded!: number;

  @ApiProperty({ example: 1 })
  failed!: number;

  @ApiProperty({ example: false })
  treated!: boolean;

  @ApiProperty({ type: QuickNoteAiExecutionResultDto, isArray: true })
  results!: QuickNoteAiExecutionResultDto[];
}
