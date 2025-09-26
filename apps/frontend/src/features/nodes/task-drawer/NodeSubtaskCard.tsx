"use client";
import React from "react";
import TaskCard, { TaskCardProps } from "@/components/task/task-card";
import type { NodeChild } from "../types";

export interface NodeSubtaskCardProps {
  child: NodeChild;
  onToggle: (id: string) => void;
  onEdit: (id: string, title: string) => void;
  editing: boolean;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  saveEdit: () => void;
}

// Mapping très léger: pour l'instant on se sert de TaskCard en variant compact
// En attendant un modèle complet (priority, lateness, etc.) on fixe des valeurs neutres.
export const NodeSubtaskCard: React.FC<NodeSubtaskCardProps> = ({
  child,
  onToggle,
  onEdit,
  editing,
  editingTitle,
  setEditingTitle,
  saveEdit,
}) => {
  // Détermination 'complexity' ou pseudo badge selon behaviorKey
  const complexity = child.behaviorKey === 'DONE' ? '✓' : undefined;
  const priority: TaskCardProps['priority'] = 'Low';

  return (
    <div className="relative">
      <TaskCard
        id={child.id}
        priority={priority}
        title={editing ? '' : child.title}
        assignees={[]}
        variant="compact"
        complexity={complexity}
        fractalPath={undefined}
        className={child.behaviorKey === 'DONE' ? 'opacity-70 line-through' : ''}
      />
      {/* Overlay contenu interactif spécifique sous-tâche */}
      <div className="absolute inset-0 px-4 py-2 flex items-start gap-2 pointer-events-none">
        <button
          type="button"
          onClick={(e)=>{ e.stopPropagation(); onToggle(child.id); }}
          className={"pointer-events-auto mt-0.5 h-4 w-4 flex-shrink-0 rounded flex items-center justify-center text-[10px] transition " + (child.behaviorKey === 'DONE' ? 'border border-green-500 bg-green-500 text-white' : 'border border-slate-400 dark:border-slate-500 hover:border-slate-500')}
          title={child.behaviorKey === 'DONE'? 'Remettre en Backlog':'Marquer terminé'}
        >
          {child.behaviorKey === 'DONE' ? '✓' : ''}
        </button>
        {editing ? (
          <input
            className="pointer-events-auto flex-1 border-b border-blue-500 focus:outline-none bg-transparent dark:placeholder-slate-400 text-sm"
            autoFocus
            value={editingTitle}
            onChange={e=>setEditingTitle(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault(); saveEdit();} if(e.key==='Escape'){ onEdit(child.id, child.title);} }}
          />
        ) : (
          <span
            className="pointer-events-auto flex-1 text-sm leading-5 select-text cursor-text"
            onDoubleClick={()=>onEdit(child.id, child.title)}
          >{child.title}</span>
        )}
      </div>
    </div>
  );
};

export default NodeSubtaskCard;
