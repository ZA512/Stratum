"use client";

import React, { createContext, useContext } from "react";
import type { ColumnBehaviorKey } from "@/features/boards/boards-api";

// Duplication légère des options de comportement afin d'éviter la dépendance circulaire.
// TODO: factoriser dans un module partagé (ex: @/features/boards/behaviors).
const BEHAVIOR_OPTIONS: Array<{ value: ColumnBehaviorKey; label: string }> = [
	{ value: "BACKLOG", label: "Backlog" },
	{ value: "IN_PROGRESS", label: "En cours" },
	{ value: "BLOCKED", label: "Bloqué" },
	{ value: "DONE", label: "Terminé" },
	{ value: "CUSTOM", label: "Custom" },
];

const BEHAVIOR_LABELS = Object.fromEntries(
	BEHAVIOR_OPTIONS.map(o => [o.value, o.label] as const),
) as Record<ColumnBehaviorKey, string>;

type BoardContextValue = {
	// Etat principal (placeholders si provider non monté)
	board: any;
	loading: boolean;
	error: string | null;
	breadcrumb: any[];
	childBoards: Record<string, any>;
	// Actions (no-op par défaut)
	handleCreateCard: (columnId: string, title: string) => Promise<void> | void;
	handleOpenChildBoard: (boardId: string) => void;
	handleConvertNode: (nodeId: string, target: string, options?: any) => Promise<void> | void;
	handleOpenColumnEditor: (column: any) => void;
	handleDeleteColumn: (column: any) => void;
	handleMoveColumn: (column: any, direction: -1 | 1, index: number) => void;
	handleUpdateColumn: (...args: any[]) => void;
	handleSubmitColumn: (...args: any[]) => void;
	BEHAVIOR_OPTIONS: typeof BEHAVIOR_OPTIONS;
	BEHAVIOR_LABELS: typeof BEHAVIOR_LABELS;
};

const noopAsync = async () => { /* no-op */ };
const noop = () => { /* no-op */ };

const defaultValue: BoardContextValue = {
	board: null,
	loading: false,
	error: null,
	breadcrumb: [],
	childBoards: {},
	handleCreateCard: noopAsync,
	handleOpenChildBoard: noop,
	handleConvertNode: noopAsync,
	handleOpenColumnEditor: noop,
	handleDeleteColumn: noop,
	handleMoveColumn: noop,
	handleUpdateColumn: noop,
	handleSubmitColumn: noop,
	BEHAVIOR_OPTIONS,
	BEHAVIOR_LABELS,
};

const BoardContext = createContext<BoardContextValue>(defaultValue);

export function BoardProvider({ value, children }: { value: Partial<BoardContextValue>; children: React.ReactNode }) {
	// Fusionne avec valeurs par défaut pour éviter propriétés manquantes.
	const merged: BoardContextValue = { ...defaultValue, ...value };
	return <BoardContext.Provider value={merged}>{children}</BoardContext.Provider>;
}

export function useBoard(): BoardContextValue {
	return useContext(BoardContext);
}

export { BEHAVIOR_OPTIONS, BEHAVIOR_LABELS };

