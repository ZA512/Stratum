"use client";

import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/components/toast/ToastProvider';
import {
  sendAgentChat,
  sendAgentCommand,
  type AgentMode,
} from './agent-api';
import { AgentSlaIndicator } from './AgentSlaIndicator';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode: AgentMode;
  proposalId?: string;
  suggestCommand?: boolean;
  suggestedPrompt?: string | null;
  timestamp: number;
};

type AgentChatPanelProps = {
  workspaceId: string;
  onOpenProposal: (proposalId: string) => void;
  onClose: () => void;
};

let messageCounter = 0;
function nextId() {
  return `msg_${Date.now()}_${++messageCounter}`;
}

export function AgentChatPanel({
  workspaceId,
  onOpenProposal,
  onClose,
}: AgentChatPanelProps) {
  const { error: toastError } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<AgentMode>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, []);

  const chatMutation = useMutation({
    mutationFn: (message: string) => sendAgentChat(workspaceId, message),
    onSuccess: (response) => {
      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: response.answer,
        mode: 'chat',
        suggestCommand: Boolean(response.suggestedCommandPayload?.intent),
        suggestedPrompt: response.suggestedCommandPayload?.intent ?? null,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      scrollToBottom();
    },
    onError: (err) => {
      toastError(err instanceof Error ? err.message : 'Erreur chat');
    },
  });

  const commandMutation = useMutation({
    mutationFn: (intent: string) => sendAgentCommand(workspaceId, intent),
    onSuccess: (response) => {
      const topAlternative = response.alternatives[0];
      const confidence = topAlternative?.confidenceScore ?? 0;
      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: `Proposal creee (${topAlternative?.actions?.length ?? 0} action(s), confiance ${Math.round(confidence * 100)}%)`,
        mode: 'command',
        proposalId: response.proposalId,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      scrollToBottom();
    },
    onError: (err) => {
      toastError(err instanceof Error ? err.message : 'Erreur commande');
    },
  });

  const isLoading = chatMutation.isPending || commandMutation.isPending;

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: text,
      mode,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    scrollToBottom();

    if (mode === 'command') {
      commandMutation.mutate(text);
    } else {
      chatMutation.mutate(text);
    }
  };

  const handleSwitchToCommand = (prompt: string) => {
    setMode('command');
    setInput(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-stretch">
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        aria-label="Fermer le chat agent"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[70vh] w-full max-w-md flex-col rounded-2xl border border-white/10 bg-surface shadow-2xl sm:h-full sm:max-h-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Agent IA</h3>
            <div className="flex rounded-full border border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setMode('chat')}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                  mode === 'chat'
                    ? 'bg-white/10 text-foreground'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setMode('command')}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                  mode === 'command'
                    ? 'bg-accent/20 text-accent'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                Command
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AgentSlaIndicator loading={isLoading} thresholdMs={3_000} />
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-muted transition hover:text-foreground"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-xs text-muted">
                {mode === 'chat'
                  ? 'Posez une question exploratoire...'
                  : 'Donnez une instruction pour creer une proposal...'}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent/20 text-foreground'
                    : 'bg-white/5 text-foreground/90'
                }`}
              >
                {msg.mode === 'command' && msg.role === 'user' && (
                  <span className="mb-1 block text-[10px] font-medium text-accent">
                    COMMAND
                  </span>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Proposal link */}
                {msg.proposalId && (
                  <button
                    type="button"
                    onClick={() => onOpenProposal(msg.proposalId!)}
                    className="mt-1.5 text-[11px] text-accent underline-offset-2 hover:underline"
                  >
                    Voir la proposal
                  </button>
                )}

                {/* Chat → Command transition */}
                {msg.suggestCommand && msg.suggestedPrompt && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSwitchToCommand(msg.suggestedPrompt!)
                    }
                    className="mt-2 block rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-accent transition hover:bg-accent/20"
                  >
                    Passer en mode command: &quot;{msg.suggestedPrompt}&quot;
                  </button>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl bg-white/5 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60 [animation-delay:0ms]" />
                  <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60 [animation-delay:150ms]" />
                  <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                mode === 'chat'
                  ? 'Posez une question...'
                  : 'Decrivez une action...'
              }
              className="flex-1 resize-none rounded-lg border border-white/10 bg-surface/70 px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === 'command' ? '/' : '↑'}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted">
            {mode === 'chat'
              ? 'Mode exploratoire — pas de mutation'
              : 'Mode command — genere une proposal'}
          </p>
        </div>
      </div>
    </div>
  );
}
