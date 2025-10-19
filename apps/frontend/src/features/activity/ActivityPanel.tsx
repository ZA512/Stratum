"use client";
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBoardActivityLogs } from './useActivityLogs';
import { formatActivityMessage, formatTimeAgo, groupActivitiesByPeriod } from './activity-formatter';
import { useTranslation } from '@/i18n';

interface ActivityPanelProps {
  boardId: string;
  accessToken: string;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTask?: (nodeId: string) => void;
}

export function ActivityPanel({
  boardId,
  accessToken,
  isOpen,
  onClose,
  onNavigateToTask,
}: ActivityPanelProps) {
  const { t } = useTranslation();
  const { t: tActivity } = useTranslation('activity');
  const { t: tBoard } = useTranslation('board');
  const { data: logs, isLoading, error, refetch } = useBoardActivityLogs(boardId, accessToken, 50);

  // Fermer le panneau avec Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const groupedLogs = logs ? groupActivitiesByPeriod(logs) : [];

  const handleActivityClick = (nodeId: string) => {
    if (onNavigateToTask) {
      onNavigateToTask(nodeId);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-surface/95 backdrop-blur shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-panel-title"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-surface/95 px-6 py-4 backdrop-blur">
              <h2 id="activity-panel-title" className="text-lg font-semibold text-foreground">
                {tActivity('title')}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-muted transition hover:border-accent hover:text-foreground"
                  title={t('common.actions.refresh')}
                  aria-label={t('common.actions.refresh')}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-muted transition hover:border-accent hover:text-foreground"
                  aria-label={t('common.actions.close')}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <span className="sr-only">{tActivity('loading')}</span>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {!isLoading && !error && groupedLogs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg
                    className="mb-3 h-12 w-12 text-muted/40"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-sm text-muted">{tActivity('empty')}</p>
                </div>
              )}

              {!isLoading && !error && groupedLogs.length > 0 && (
                <div className="space-y-6">
                  {groupedLogs.map((group) => (
                    <div key={group.label} className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {group.label}
                      </h3>
                      <ul className="space-y-2">
                        {group.logs.map((log) => {
                          const message = formatActivityMessage(log, tActivity, tBoard);
                          const timeAgo = formatTimeAgo(log.createdAt, tActivity);
                          const isClickable = Boolean(log.nodeId && onNavigateToTask);

                          return (
                            <li key={log.id}>
                              <button
                                type="button"
                                onClick={() => log.nodeId && handleActivityClick(log.nodeId)}
                                disabled={!isClickable}
                                className={`w-full rounded-lg border border-white/10 bg-card/40 px-4 py-3 text-left transition ${
                                  isClickable
                                    ? 'cursor-pointer hover:border-accent hover:bg-card/60'
                                    : 'cursor-default'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  {/* Avatar placeholder */}
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
                                    {log.userDisplayName?.charAt(0).toUpperCase() ?? '?'}
                                  </div>

                                  <div className="flex-1 space-y-1">
                                    <p className="text-sm text-foreground">{message}</p>
                                    <p className="text-xs text-muted">{timeAgo}</p>
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
