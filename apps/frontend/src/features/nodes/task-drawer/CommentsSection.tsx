"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTaskDrawer } from './TaskDrawerContext';
import { useAuth } from '@/features/auth/auth-provider';
import {
  createNodeComment,
  deleteNodeComment,
  fetchNodeComments,
  updateNodeComment,
} from '../node-comments-api';
import type { NodeComment } from '../types';
import type { TeamMember } from '@/features/teams/team-members-api';

const FIELD_INPUT_BASE =
  'rounded border border-border/60 bg-input text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-colors';

type CommentsSectionProps = {
  members: TeamMember[];
  membersLoading: boolean;
  membersError: string | null;
};

type NotifyKey = 'R' | 'A' | 'C' | 'I' | 'P' | 'U';

const notifyDefault: Record<NotifyKey, boolean> = {
  R: true,
  A: true,
  C: true,
  I: true,
  P: false,
  U: false,
};

const notifyLabels: Record<NotifyKey, string> = {
  R: 'Responsables',
  A: 'Accountables',
  C: 'Consultés',
  I: 'Informés',
  P: 'Projet',
  U: 'Sous-projet',
};

const notifyOrder: NotifyKey[] = ['R', 'A', 'C', 'I', 'P', 'U'];

const mentionRegex = /@([\p{L}\p{N}_.-]*)$/u;

export const CommentsSection: React.FC<CommentsSectionProps> = ({ members, membersLoading, membersError }) => {
  const { detail, applyDetail } = useTaskDrawer();
  const { accessToken, user } = useAuth();
  const [comments, setComments] = useState<NodeComment[]>(detail?.comments ?? []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [notify, setNotify] = useState<Record<NotifyKey, boolean>>(notifyDefault);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  const [editingError, setEditingError] = useState<string | null>(null);
  const [editingBusy, setEditingBusy] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<Map<string, string>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const detailRef = useRef(detail);
  const commentsRef = useRef<NodeComment[]>(detail?.comments ?? []);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    const nextComments = detail?.comments ?? [];
    commentsRef.current = nextComments;
    setComments(nextComments);
  }, [detail?.comments]);

  const syncComments = (nextComments: NodeComment[]) => {
    commentsRef.current = nextComments;
    setComments(nextComments);
  };

  const syncDetailComments = (nextComments: NodeComment[]) => {
    const currentDetail = detailRef.current;
    if (!currentDetail) {
      return;
    }
    applyDetail({ ...currentDetail, comments: nextComments });
  };

  const nodeId = detail?.id ?? null;

  useEffect(() => {
    if (!nodeId || !accessToken) {
      setComments([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchNodeComments(nodeId, accessToken)
      .then((data) => {
        if (cancelled) return;
        syncComments(data);
        const currentDetail = detailRef.current;
        if (currentDetail && currentDetail.id === nodeId) {
          applyDetail({ ...currentDetail, comments: data });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : 'Impossible de charger les commentaires';
        setLoadError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, accessToken, applyDetail]);

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setMessage(value);
    const caret = event.target.selectionStart ?? value.length;
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(mentionRegex);
    if (match) {
      setMentionQuery(match[1]?.toLowerCase() ?? '');
    } else {
      setMentionQuery(null);
    }
    setSelectedMentions((previous) => {
      if (previous.size === 0) return previous;
      const next = new Map(previous);
      for (const [userId, displayName] of previous.entries()) {
        if (!value.includes(`@${displayName}`)) {
          next.delete(userId);
        }
      }
      return next;
    });
  };

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const normalized = mentionQuery.trim().toLowerCase();
    return members
      .filter((member) => {
        if (!normalized) return true;
        const display = member.displayName.toLowerCase();
        const email = member.email.toLowerCase();
        return display.includes(normalized) || email.includes(normalized);
      })
      .slice(0, 6);
  }, [mentionQuery, members]);

  const handleSelectMention = (member: TeamMember) => {
    if (!textareaRef.current) return;
    const currentValue = message;
    const caret = textareaRef.current.selectionStart ?? currentValue.length;
    const beforeCaret = currentValue.slice(0, caret);
    const afterCaret = currentValue.slice(caret);
    const match = beforeCaret.match(mentionRegex);
    let replacementStart = beforeCaret;
    if (match) {
      replacementStart = beforeCaret.slice(0, beforeCaret.length - match[0].length);
    }
    const insertion = `@${member.displayName} `;
    const nextValue = `${replacementStart}${insertion}${afterCaret}`;
    setMessage(nextValue);
    setMentionQuery(null);
    setSelectedMentions((prev) => {
      const next = new Map(prev);
      next.set(member.id, member.displayName);
      return next;
    });

    requestAnimationFrame(() => {
      const nextCaret = (replacementStart + insertion).length;
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
      textareaRef.current?.focus();
    });
  };

  const toggleNotify = (key: NotifyKey) => {
    setNotify((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail?.id || !accessToken) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setSubmitError('Le commentaire ne peut pas être vide');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const validMentions = Array.from(selectedMentions.entries())
        .filter(([, displayName]) => message.includes(`@${displayName}`))
        .map(([userId]) => userId);

      const created = await createNodeComment(
        detail.id,
        {
          body: trimmed,
          notifyResponsible: notify.R,
          notifyAccountable: notify.A,
          notifyConsulted: notify.C,
          notifyInformed: notify.I,
          notifyProject: notify.P,
          notifySubProject: notify.U,
          mentions: validMentions,
        },
        accessToken,
      );

      const nextComments = [...commentsRef.current, created];
      syncComments(nextComments);
      syncDetailComments(nextComments);
      setMessage('');
      setNotify({ ...notifyDefault });
      setSelectedMentions(new Map());
      setMentionQuery(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Impossible d'ajouter le commentaire";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderFlags = (comment: NodeComment) => {
    const letters: string[] = [];
    if (comment.notify.responsible) letters.push('R');
    if (comment.notify.accountable) letters.push('A');
    if (comment.notify.consulted) letters.push('C');
    if (comment.notify.informed) letters.push('I');
    if (comment.notify.project) letters.push('P');
    if (comment.notify.subProject) letters.push('U');
    return letters.join('') || '—';
  };

  const startEditing = (comment: NodeComment) => {
    setEditingCommentId(comment.id);
    setEditingMessage(comment.body);
    setEditingError(null);
  };

  const cancelEditing = () => {
    setEditingCommentId(null);
    setEditingMessage('');
    setEditingError(null);
  };

  const handleUpdateComment = async (comment: NodeComment) => {
    if (!detail?.id || !accessToken) return;
    const trimmed = editingMessage.trim();
    if (!trimmed) {
      setEditingError('Le commentaire ne peut pas être vide');
      return;
    }
    setEditingBusy(true);
    setEditingError(null);
    try {
      const updated = await updateNodeComment(
        detail.id,
        comment.id,
        {
          body: trimmed,
          notifyResponsible: comment.notify.responsible,
          notifyAccountable: comment.notify.accountable,
          notifyConsulted: comment.notify.consulted,
          notifyInformed: comment.notify.informed,
          notifyProject: comment.notify.project,
          notifySubProject: comment.notify.subProject,
          mentions: comment.mentions.map((mention) => mention.userId),
        },
        accessToken,
      );
      const nextComments = commentsRef.current.map((entry) =>
        entry.id === comment.id ? updated : entry,
      );
      syncComments(nextComments);
      syncDetailComments(nextComments);
      cancelEditing();
    } catch (error) {
      setEditingError(error instanceof Error ? error.message : 'Impossible de modifier le commentaire');
    } finally {
      setEditingBusy(false);
    }
  };

  const handleDeleteComment = async (comment: NodeComment) => {
    if (!detail?.id || !accessToken) return;
    if (!window.confirm('Supprimer ce commentaire ?')) return;
    setDeletingCommentId(comment.id);
    try {
      await deleteNodeComment(detail.id, comment.id, accessToken);
      const nextComments = commentsRef.current.filter(
        (entry) => entry.id !== comment.id,
      );
      syncComments(nextComments);
      syncDetailComments(nextComments);
      if (editingCommentId === comment.id) {
        cancelEditing();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Impossible de supprimer le commentaire');
    } finally {
      setDeletingCommentId(null);
    }
  };

  return (
    <section className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-white/10 bg-card/70 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg">✏️</span>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--color-task-heading)]">
            Nouveau commentaire
          </h3>
        </div>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            rows={4}
            className={`w-full resize-y ${FIELD_INPUT_BASE} px-3 py-2 text-sm`}
            placeholder="Saisir votre message, utilisez @ pour mentionner quelqu'un"
            disabled={submitting}
          />
          {mentionQuery !== null && (
            <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border/50 bg-card shadow-lg">
              {mentionSuggestions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[color:var(--color-task-label)]">Aucun résultat</div>
              ) : (
                mentionSuggestions.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/40"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelectMention(member);
                    }}
                  >
                    <span className="font-medium text-[color:var(--color-task-heading)]">{member.displayName}</span>
                    <span className="text-[11px] text-[color:var(--color-task-label)]">{member.email}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-[color:var(--color-task-tab)]">
          {notifyOrder.map((key) => (
            <label key={key} className="inline-flex items-center gap-1 rounded border border-border/50 px-2 py-1">
              <input
                type="checkbox"
                checked={notify[key]}
                onChange={() => toggleNotify(key)}
                className="h-3.5 w-3.5 accent-emerald-600"
              />
              <span className="font-medium">{key}</span>
              <span className="text-[11px] text-[color:var(--color-task-label)]">{notifyLabels[key]}</span>
            </label>
          ))}
        </div>

        {submitError && <p className="text-xs text-red-500">{submitError}</p>}

        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Envoi…' : 'Publier le commentaire'}
          </button>
        </div>
      </form>

      <div className="space-y-2 rounded-lg border border-white/10 bg-card/70 p-4 shadow-sm">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--color-task-heading)]">
              Discussion & journal
            </h3>
          </div>
          <p className="text-xs text-[color:var(--color-task-label)]">
            Mentionnez vos collègues avec @nom et choisissez qui sera notifié via les options RACI / Projet.
          </p>
        </header>

        {membersLoading && (
          <p className="text-xs text-[color:var(--color-task-label)]">Chargement des membres connus…</p>
        )}
        {membersError && (
          <p className="text-xs text-red-500">{membersError}</p>
        )}
        {loadError && (
          <p className="text-xs text-red-500">{loadError}</p>
        )}

        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              <div className="h-16 w-full animate-pulse rounded bg-card/40" />
              <div className="h-16 w-full animate-pulse rounded bg-card/40" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-[color:var(--color-task-label)]">Aucun commentaire pour le moment.</p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {[...comments].reverse().map((comment) => {
                const timestamp = new Date(comment.createdAt);
                const formatted = Number.isNaN(timestamp.getTime())
                  ? comment.createdAt
                  : timestamp.toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    });
                const updatedTimestamp = new Date(comment.updatedAt);
                const updatedFormatted = Number.isNaN(updatedTimestamp.getTime())
                  ? null
                  : updatedTimestamp.toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    });
                const initials = comment.author.displayName
                  .split(' ')
                  .map((word) => word.charAt(0).toUpperCase())
                  .slice(0, 2)
                  .join('');
                return (
                  <article
                    key={comment.id}
                    className="space-y-2 rounded border border-border/40 bg-card/70 p-3 text-sm shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600/80 text-sm font-semibold text-white">
                          {initials || '•'}
                        </div>
                        <div>
                          <p className="font-semibold text-[color:var(--color-task-heading)]">{comment.author.displayName}</p>
                          <p className="text-xs text-[color:var(--color-task-label)]">{formatted}</p>
                          {updatedFormatted && updatedFormatted !== formatted ? (
                            <p className="text-[11px] text-[color:var(--color-task-label)]">Modifié le {updatedFormatted}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="rounded bg-card/50 px-2 py-1 text-[10px] font-semibold tracking-wider text-muted">
                          {renderFlags(comment)}
                        </span>
                        {user?.id === comment.author.id ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => startEditing(comment)}
                              className="rounded border border-border/40 px-2 py-1 text-[10px] font-semibold text-[color:var(--color-task-label)] hover:text-[color:var(--color-task-heading)]"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment)}
                              disabled={deletingCommentId === comment.id}
                              className="rounded border border-red-400/30 px-2 py-1 text-[10px] font-semibold text-red-500 hover:text-red-400 disabled:opacity-50"
                            >
                              {deletingCommentId === comment.id ? 'Suppression…' : 'Supprimer'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {editingCommentId === comment.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingMessage}
                          onChange={(event) => setEditingMessage(event.target.value)}
                          rows={4}
                          className={`w-full resize-y ${FIELD_INPUT_BASE} px-3 py-2 text-sm`}
                          disabled={editingBusy}
                        />
                        {editingError ? <p className="text-xs text-red-500">{editingError}</p> : null}
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="rounded border border-border/50 px-3 py-1.5 text-xs font-medium text-[color:var(--color-task-label)]"
                            disabled={editingBusy}
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateComment(comment)}
                            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                            disabled={editingBusy}
                          >
                            {editingBusy ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-[color:var(--color-task-tab)]">{comment.body}</p>
                    )}
                    {comment.mentions.length > 0 && (
                      <div className="text-xs text-[color:var(--color-task-label)]">
                        Mentionnés&nbsp;:
                        {comment.mentions.map((mention) => (
                          <span key={mention.userId} className="ml-1 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                            @{mention.displayName}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
