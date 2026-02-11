"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import {
  fetchBoardDetail,
  fetchRootBoard,
  fetchChildBoards,
  ensureChildBoard,
  type BoardColumn,
  type BoardNode,
} from '@/features/boards/boards-api';
import { moveNodeToBoard } from '@/features/nodes/nodes-api';
import { useToast } from '@/components/toast/ToastProvider';
import { ChevronRight, ChevronDown, Search } from 'lucide-react';
import { useTranslation } from '@/i18n';

type MoveConfirmAction = 'stay' | 'open';

interface MoveCardDialogProps {
  teamId: string;
  node: BoardNode;
  currentBoardId: string;
  onClose?: () => void;
  onSuccess: (payload: { boardId: string; boardName: string }) => Promise<void> | void;
  variant?: 'modal' | 'inline';
  confirmActions?: Array<{ id: MoveConfirmAction; label: string }>;
  onAction?: (payload: { boardId: string; boardName: string }, action: MoveConfirmAction) => Promise<void> | void;
}

type NodeOption = {
  nodeId: string;
  boardId: string | null;
  name: string;
  depth: number;
  hasChildren: boolean;
  columnName?: string;
  behaviorKey?: string;
  parentId: string | null;
  children: NodeOption[];
};

export function MoveCardDialog({
  teamId,
  node,
  currentBoardId,
  onClose,
  onSuccess,
  variant = 'modal',
  confirmActions,
  onAction,
}: MoveCardDialogProps) {
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();
  const { t: tBoard } = useTranslation('board');

  const [nodeOptions, setNodeOptions] = useState<NodeOption[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [nodesLoading, setNodesLoading] = useState(true);
  const [nodesError, setNodesError] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [columnsMap, setColumnsMap] = useState<Record<string, BoardColumn[]>>({});
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Charger la hiérarchie complète des tâches
  useEffect(() => {
    if (!accessToken) {
      setNodesLoading(false);
      setNodesError(tBoard('moveDialog.errors.sessionInvalid'));
      return;
    }

    let cancelled = false;
    setNodesLoading(true);
    setNodesError(null);

    (async () => {
      try {
        const root = await fetchRootBoard(teamId, accessToken);
        if (cancelled) return;

        // Fonction récursive pour charger toute la hiérarchie
        const loadNodeHierarchy = async (
          boardId: string,
          nodeId: string,
          name: string,
          depth: number,
          parentId: string | null,
        ): Promise<NodeOption | null> => {
          try {
            const detail = await fetchBoardDetail(boardId, accessToken);
            if (cancelled) return null;

            // Collecter tous les nodes de toutes les colonnes
            const allNodes = detail.columns.flatMap(col => col.nodes || []);

            // Créer l'option pour ce noeud
            const option: NodeOption = {
              nodeId,
              boardId,
              name,
              depth,
              hasChildren: allNodes.length > 0,
              parentId,
              children: [],
            };

            // Charger récursivement les enfants qui ont des boards (via fetchChildBoards)
            const childBoards = await fetchChildBoards(nodeId, accessToken);
            for (const childBoard of childBoards) {
              // Trouver le node correspondant pour obtenir sa colonne
              // const childNodeInfo = allNodes.find(n => n.id === childBoard.nodeId);
              const column = detail.columns.find(col => 
                col.nodes?.some(n => n.id === childBoard.nodeId)
              );
              
              // Filtrer les nodes DONE
              const isDone = column?.behaviorKey === 'DONE';
              if (!isDone) {
                const childOption = await loadNodeHierarchy(
                  childBoard.boardId,
                  childBoard.nodeId,
                  childBoard.name,
                  depth + 1,
                  nodeId,
                );
                if (childOption && !cancelled) {
                  childOption.columnName = column?.name;
                  childOption.behaviorKey = column?.behaviorKey;
                  option.children.push(childOption);
                }
              }
            }

            // Ajouter aussi les nodes feuilles (sans board) qui ne sont pas DONE
            for (const column of detail.columns) {
              const isDone = column.behaviorKey === 'DONE';
              if (!isDone) {
                const columnNodes = column.nodes || [];
                for (const childNode of columnNodes) {
                  // Seulement si ce node n'a PAS de board (pas dans childBoards)
                  if (!childBoards.some(cb => cb.nodeId === childNode.id)) {
                    option.children.push({
                      nodeId: childNode.id,
                      boardId: null,
                      name: childNode.title,
                      depth: depth + 1,
                      hasChildren: false,
                      columnName: column.name,
                      behaviorKey: column.behaviorKey,
                      parentId: nodeId,
                      children: [],
                    });
                  }
                }
              }
            }

            return option;
          } catch (error) {
            console.error(`Erreur lors du chargement de la hiérarchie pour ${nodeId}:`, error);
            return null;
          }
        };

        const rootOption = await loadNodeHierarchy(root.id, root.nodeId, root.name, 0, null);
        if (!cancelled && rootOption) {
          setNodeOptions([rootOption]);
          // Auto-expand le noeud racine
          setExpandedNodes(new Set([rootOption.nodeId]));
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setNodesError(message || tBoard('moveDialog.errors.hierarchyLoad'));
        }
      } finally {
        if (!cancelled) setNodesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, accessToken, tBoard]);

  // Filtrer les noeuds selon la recherche
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodeOptions;

    const search = searchQuery.toLowerCase();
    
    const filterNode = (option: NodeOption): NodeOption | null => {
      const matches = option.name.toLowerCase().includes(search);
      const filteredChildren = option.children
        .map(child => filterNode(child))
        .filter((child): child is NodeOption => child !== null);

      if (matches || filteredChildren.length > 0) {
        return {
          ...option,
          children: filteredChildren,
        };
      }
      return null;
    };

    return nodeOptions
      .map(option => filterNode(option))
      .filter((option): option is NodeOption => option !== null);
  }, [nodeOptions, searchQuery]);

  // Auto-expand lors de la recherche
  useEffect(() => {
    if (searchQuery.trim()) {
      const collectNodeIds = (option: NodeOption): string[] => {
        return [
          option.nodeId,
          ...option.children.flatMap(child => collectNodeIds(child)),
        ];
      };
      const allIds = filteredNodes.flatMap(option => collectNodeIds(option));
      setExpandedNodes(new Set(allIds));
    }
  }, [searchQuery, filteredNodes]);

  const selectedNode = useMemo(() => {
    const findNode = (options: NodeOption[]): NodeOption | null => {
      for (const option of options) {
        if (option.nodeId === selectedNodeId) return option;
        const found = findNode(option.children);
        if (found) return found;
      }
      return null;
    };
    return selectedNodeId ? findNode(nodeOptions) : null;
  }, [nodeOptions, selectedNodeId]);

  // Utiliser le boardId existant ou préparer les colonnes par défaut
  const selectedBoardId = selectedNode?.boardId || null;
  const selectedColumns = selectedBoardId ? columnsMap[selectedBoardId] : undefined;

  // Charger ou créer le board pour la tâche sélectionnée
  useEffect(() => {
    if (!selectedNodeId || !accessToken) return;

    // Si la tâche a déjà un boardId, charger ses colonnes
    if (selectedBoardId) {
      if (selectedColumns) {
        setSelectedColumnId((prev) => {
          if (prev && selectedColumns.some((column) => column.id === prev)) {
            return prev;
          }
          if (selectedBoardId === currentBoardId && node.columnId) {
            const existing = selectedColumns.find((column) => column.id === node.columnId);
            if (existing) return existing.id;
          }
          return selectedColumns[0]?.id ?? null;
        });
        return;
      }

      let cancelled = false;
      setColumnsLoading(true);
      setColumnsError(null);

      (async () => {
        try {
          const detail = await fetchBoardDetail(selectedBoardId, accessToken);
          if (cancelled) return;
          setColumnsMap((prev) => ({ ...prev, [selectedBoardId]: detail.columns }));
          setSelectedColumnId((prev) => {
            if (prev && detail.columns.some((column) => column.id === prev)) {
              return prev;
            }
            if (selectedBoardId === currentBoardId && node.columnId) {
              const existing = detail.columns.find((column) => column.id === node.columnId);
              if (existing) return existing.id;
            }
            return detail.columns[0]?.id ?? null;
          });
        } catch (err) {
          if (!cancelled) {
            const message = err instanceof Error ? err.message : String(err);
            setColumnsError(message || tBoard('moveDialog.errors.columnsLoad'));
          }
        } finally {
          if (!cancelled) setColumnsLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    } else {
      // Si la tâche n'a pas de board, le créer immédiatement pour afficher les colonnes
      let cancelled = false;
      setColumnsLoading(true);
      setColumnsError(null);

      (async () => {
        try {
          // Créer le board avec les colonnes par défaut
          const newBoardId = await ensureChildBoard(selectedNodeId, accessToken);
          if (cancelled) return;
          
          // Charger les colonnes du nouveau board
          const detail = await fetchBoardDetail(newBoardId, accessToken);
          if (cancelled) return;
          
          // Mettre à jour le node dans l'arbre avec son nouveau boardId
          setNodeOptions(prevOptions => {
            const updateNodeBoardId = (options: NodeOption[]): NodeOption[] => {
              return options.map(option => {
                if (option.nodeId === selectedNodeId) {
                  return { ...option, boardId: newBoardId };
                }
                return {
                  ...option,
                  children: updateNodeBoardId(option.children),
                };
              });
            };
            return updateNodeBoardId(prevOptions);
          });
          
          setColumnsMap((prev) => ({ ...prev, [newBoardId]: detail.columns }));
          setSelectedColumnId(detail.columns[0]?.id ?? null);
        } catch (err) {
          if (!cancelled) {
            const message = err instanceof Error ? err.message : String(err);
            setColumnsError(message || tBoard('moveDialog.errors.boardCreationFailed'));
          }
        } finally {
          if (!cancelled) setColumnsLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }
  }, [
    selectedNodeId,
    selectedBoardId,
    accessToken,
    selectedColumns,
    currentBoardId,
    node.columnId,
    tBoard,
  ]);

  const handleToggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleConfirm = async (action: MoveConfirmAction = 'stay') => {
    if (!accessToken) {
      setFormError(tBoard('moveDialog.errors.sessionInvalid'));
      return;
    }
    if (!selectedNodeId || !selectedColumnId) {
      setFormError(tBoard('moveDialog.errors.selectNodeAndColumn'));
      return;
    }

    // À ce stade, le board a déjà été créé si nécessaire dans le useEffect
    const targetBoardId = selectedNode?.boardId;
    if (!targetBoardId) {
      setFormError(tBoard('moveDialog.errors.boardCreationFailed'));
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await moveNodeToBoard(
        node.id,
        { targetBoardId, targetColumnId: selectedColumnId },
        accessToken,
      );
      const nodeName = selectedNode?.name ?? tBoard('moveDialog.fallbackTaskName');
      success(tBoard('moveDialog.success', { title: node.title, destination: nodeName }));
      try {
        window.dispatchEvent(new CustomEvent('nodeMoved', {
          detail: { nodeId: node.id, targetColumnId: selectedColumnId },
        }));
      } catch { /* no-op */ }
      const payload = { boardId: targetBoardId, boardName: nodeName };
      if (onAction) {
        await onAction(payload, action);
      } else {
        await onSuccess(payload);
      }
      if (variant !== 'inline') {
        onClose?.();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : tBoard('moveDialog.errors.moveFailed');
      setFormError(message);
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const disableConfirm =
    submitting ||
    nodesLoading ||
    !selectedNodeId ||
    !selectedColumnId ||
    !!nodesError;

  // Composant récursif pour afficher l'arbre
  const NodeTreeItem = ({ option, level = 0 }: { option: NodeOption; level?: number }) => {
    const isExpanded = expandedNodes.has(option.nodeId);
    const isSelected = option.nodeId === selectedNodeId;
    
    // Vérifier si ce node est la tâche à déplacer ou un de ses descendants
    const isNodeToMove = option.nodeId === node.id;
    const isDescendantOfNodeToMove = useMemo(() => {
      const checkDescendant = (opt: NodeOption): boolean => {
        if (opt.nodeId === node.id) return true;
        return opt.children.some(child => checkDescendant(child));
      };
      return option.children.some(child => checkDescendant(child)) || option.nodeId === node.id;
    }, [option]);
    
    // Permettre la sélection de toutes les tâches sauf:
    // - la racine (depth === 0)
    // - la tâche elle-même
    // - les descendants de la tâche (pour éviter les boucles)
    const canSelect = option.depth > 0 && !isNodeToMove && !isDescendantOfNodeToMove;

    return (
      <div>
        <button
          type="button"
          onClick={() => {
            if (option.hasChildren) {
              handleToggleExpand(option.nodeId);
            }
            if (canSelect) {
              setSelectedNodeId(option.nodeId);
              setColumnsError(null);
            }
          }}
          disabled={!canSelect}
          className={`flex w-full items-center gap-2 rounded-lg py-1.5 px-2 text-left text-sm transition ${
            isSelected
              ? 'bg-accent/20 text-foreground font-medium'
              : canSelect
              ? 'text-foreground hover:bg-white/5'
              : 'text-muted/60 cursor-not-allowed'
          }`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
        >
          {option.hasChildren ? (
            <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>
          ) : (
            <span className="flex-shrink-0 w-4" />
          )}
          <span className="truncate flex-1">{option.name}</span>
          {option.columnName && (
            <span className="flex-shrink-0 text-[10px] text-muted uppercase tracking-wide">
              {option.columnName}
            </span>
          )}
        </button>
        {isExpanded && option.children.length > 0 && (
          <div className="mt-0.5">
            {option.children.map((child) => (
              <NodeTreeItem key={child.nodeId} option={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const content = (
    <div className={variant === 'modal' ? 'w-full max-w-4xl rounded-2xl border border-white/10 bg-surface/95 p-6 shadow-2xl' : 'rounded-2xl border border-white/10 bg-surface/70 p-6'}>
      <h2 id="move-dialog-title" className="text-lg font-semibold">
        {tBoard('moveDialog.title', { title: node.title })}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {tBoard('moveDialog.description')}
      </p>

      {nodesLoading ? (
        <p className="mt-6 text-sm text-accent">{tBoard('moveDialog.loadingHierarchy')}</p>
      ) : nodesError ? (
        <p className="mt-6 text-sm text-rose-300">{nodesError}</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_minmax(0,200px)]">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder={tBoard('moveDialog.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              {tBoard('moveDialog.availableTasks')}
            </p>
            <div className="max-h-96 overflow-y-auto pr-1 space-y-0.5">
              {filteredNodes.length > 0 ? (
                filteredNodes.map((option) => (
                  <NodeTreeItem key={option.nodeId} option={option} />
                ))
              ) : (
                <p className="text-sm text-muted py-4 text-center">
                  {searchQuery.trim()
                    ? tBoard('moveDialog.noTasksFound')
                    : tBoard('moveDialog.noTasksAvailable')}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              {tBoard('moveDialog.targetColumn')}
            </p>
            {columnsLoading ? (
              <p className="mt-3 text-sm text-accent">{tBoard('moveDialog.columnsLoading')}</p>
            ) : selectedNodeId ? (
              selectedColumns && selectedColumns.length > 0 ? (
                <ul className="space-y-2">
                  {selectedColumns.map((column) => {
                    const isSelected = column.id === selectedColumnId;
                    return (
                      <li key={column.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedColumnId(column.id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm transition ${
                            isSelected
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-white/10 text-muted hover:border-accent/60 hover:text-foreground'
                          }`}
                        >
                          <span className="truncate text-xs">{column.name}</span>
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">
                            {tBoard(`behaviors.${column.behaviorKey}`)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted">{tBoard('moveDialog.columnsEmpty')}</p>
              )
            ) : (
              <p className="mt-3 text-xs text-muted">{tBoard('moveDialog.selectTaskFirst')}</p>
            )}
            {columnsError && (
              <p className="mt-3 text-xs text-rose-300">{columnsError}</p>
            )}
          </div>
        </div>
      )}

      {formError && !nodesError && (
        <p className="mt-4 text-sm text-rose-300">{formError}</p>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {variant === 'modal' && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-foreground"
          >
            {tBoard('moveDialog.cancel')}
          </button>
        )}
        {confirmActions && confirmActions.length > 0 ? (
          confirmActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleConfirm(action.id)}
              disabled={disableConfirm}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                disableConfirm
                  ? 'cursor-not-allowed border-white/10 bg-white/5 text-muted'
                  : 'border-accent/60 bg-accent/20 text-foreground hover:border-accent hover:bg-accent/30'
              }`}
            >
              {submitting ? tBoard('moveDialog.confirmLoading') : action.label}
            </button>
          ))
        ) : (
          <button
            type="button"
            onClick={() => handleConfirm('stay')}
            disabled={disableConfirm}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              disableConfirm
                ? 'cursor-not-allowed border-white/10 bg-white/5 text-muted'
                : 'border-accent/60 bg-accent/20 text-foreground hover:border-accent hover:bg-accent/30'
            }`}
          >
            {submitting ? tBoard('moveDialog.confirmLoading') : tBoard('moveDialog.confirm')}
          </button>
        )}
      </div>
    </div>
  );

  if (variant === 'inline') {
    return content;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-dialog-title"
    >
      {content}
    </div>
  );
}
