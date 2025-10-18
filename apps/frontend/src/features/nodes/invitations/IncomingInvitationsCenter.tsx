'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/features/auth/auth-provider';
import { useTranslation } from '@/i18n';
import { useToast } from '@/components/toast/ToastProvider';
import { useBoardData } from '@/features/boards/board-data-provider';
import {
  fetchIncomingInvitations,
  respondToInvitation,
  type NodeShareIncomingInvitation,
} from './node-share-invitations-api';

type ActionState = {
  invitationId: string;
  action: 'accept' | 'decline';
};

export function IncomingInvitationsCenter() {
  const { accessToken, logout } = useAuth();
  const { t, locale } = useTranslation('board');
  const { success, error: toastError } = useToast();
  const { refreshActiveBoard } = useBoardData();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState<NodeShareIncomingInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const pendingCount = useMemo(
    () => invitations.filter(invite => invite.status === 'PENDING').length,
    [invitations],
  );

  const closePanel = useCallback(() => setOpen(false), []);

  const loadInvitations = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIncomingInvitations(accessToken);
      setInvitations(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Non authentifie') {
        void logout();
        return;
      }
      setError(message || t('invitationCenter.error'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, logout, t]);

  useEffect(() => {
    if (!accessToken) {
      setInvitations([]);
      setError(null);
      setLoading(false);
      return;
    }
    void loadInvitations();
  }, [accessToken, loadInvitations]);

  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
    }

    function handleClick(event: MouseEvent) {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target as Node)) return;
      closePanel();
    }

    document.addEventListener('keydown', handleKey);
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('click', handleClick);
    };
  }, [open, closePanel]);

  const handleAction = useCallback(async (invitationId: string, action: 'accept' | 'decline') => {
    if (!accessToken) return;
    setActionState({ invitationId, action });
    try {
      const result = await respondToInvitation(invitationId, action, accessToken);
      setInvitations(prev => prev.map(invite => (
        invite.id === invitationId
          ? { ...invite, status: result.status }
          : invite
      )));
      if (action === 'accept') {
        success(t('invitationCenter.toast.accepted', { title: result.nodeTitle }));
        // Rafraîchir le board immédiatement pour afficher la tâche partagée avec son placement personnel
        await refreshActiveBoard();
      } else {
        success(t('invitationCenter.toast.declined', { title: result.nodeTitle }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Non authentifie') {
        void logout();
        return;
      }
      toastError(message || t('invitationCenter.error'));
    } finally {
      setActionState(null);
      void loadInvitations();
    }
  }, [accessToken, loadInvitations, logout, refreshActiveBoard, success, t, toastError]);

  if (!accessToken) return null;

  return (
    <div className="pointer-events-none">
      <div className="pointer-events-auto absolute top-6 right-6 z-40 flex flex-col items-end gap-3">
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="relative inline-flex items-center gap-2 rounded-full border border-white/15 bg-background/80 px-4 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur transition hover:border-accent"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">mail</span>
          <span>{t('invitationCenter.badge')}</span>
          {pendingCount > 0 ? (
            <span className="absolute -top-2 -right-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold text-background">
              {pendingCount}
            </span>
          ) : null}
          <span className="sr-only">{t('invitationCenter.badgeAria', { count: pendingCount })}</span>
        </button>
        {open ? (
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby="incoming-invitations-title"
            className="w-[320px] max-w-[90vw] rounded-2xl border border-white/10 bg-background/95 p-4 shadow-2xl outline outline-1 outline-white/5 backdrop-blur"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="incoming-invitations-title" className="text-base font-semibold">
                {t('invitationCenter.title')}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadInvitations()}
                  disabled={loading}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-xs text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>
                  <span className="sr-only">{t('invitationCenter.refresh')}</span>
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-xs text-muted transition hover:border-accent hover:text-foreground"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">close</span>
                  <span className="sr-only">{t('invitationCenter.close')}</span>
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-3">
              {error ? (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" aria-live="polite">
                  {error}
                </div>
              ) : null}
              {loading ? (
                <p className="text-sm text-muted">{t('invitationCenter.loading')}</p>
              ) : null}
              {!loading && !error && pendingCount === 0 ? (
                <p className="text-sm text-muted">{t('invitationCenter.empty')}</p>
              ) : null}
              {invitations.filter(item => item.status === 'PENDING').map(item => (
                <article key={item.id} className="rounded-xl border border-white/10 bg-surface/80 p-3 shadow-inner">
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{item.nodeTitle}</h3>
                      <p className="text-xs text-muted">
                        {item.inviterDisplayName
                          ? t('invitationCenter.invitedBy', { name: item.inviterDisplayName })
                          : t('invitationCenter.invitedByEmail', { email: item.inviterEmail })}
                      </p>
                    </div>
                  </header>
                  <p className="mt-2 text-xs text-muted">
                    {t('invitationCenter.receivedAt', {
                      value: new Date(item.invitedAt).toLocaleString(locale),
                    })}
                  </p>
                  <p className="text-xs text-muted">
                    {t('invitationCenter.expiresAt', {
                      value: new Date(item.expiresAt).toLocaleString(locale),
                    })}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleAction(item.id, 'accept')}
                      disabled={actionState?.invitationId === item.id && actionState.action === 'accept'}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-3 py-2 text-xs font-semibold text-background transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden="true">check</span>
                      {actionState?.invitationId === item.id && actionState.action === 'accept'
                        ? t('invitationCenter.accepting')
                        : t('invitationCenter.accept')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAction(item.id, 'decline')}
                      disabled={actionState?.invitationId === item.id && actionState.action === 'decline'}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-muted transition hover:border-red-400/60 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden="true">close</span>
                      {actionState?.invitationId === item.id && actionState.action === 'decline'
                        ? t('invitationCenter.declining')
                        : t('invitationCenter.decline')}
                    </button>
                  </div>
                  <footer className="mt-2 text-right text-[11px] text-muted">
                    <Link
                      href={`/boards/${item.teamId}`}
                      onClick={closePanel}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:text-accent-strong"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">open_in_new</span>
                      {t('invitationCenter.openTeam')}
                    </Link>
                  </footer>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
