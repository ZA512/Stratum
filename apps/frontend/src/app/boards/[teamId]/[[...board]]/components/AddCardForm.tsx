"use client";
import React, { useState, FormEvent } from 'react';
import { useTranslation } from '@/i18n';

interface AddCardFormProps {
  onCreate: (title: string) => Promise<void> | void;
  disabled?: boolean;
}

export function AddCardForm({ onCreate, disabled }: AddCardFormProps){
  const [title,setTitle] = useState('');
  const [error,setError] = useState<string|null>(null);
  const [submitting,setSubmitting] = useState(false);
  const { t: tBoard } = useTranslation("board");

  const submit = async (e:FormEvent) => {
    e.preventDefault();
    if(!title.trim()){ setError(tBoard('addCard.errors.required')); return; }
    setSubmitting(true); setError(null);
    try {
      await onCreate(title.trim());
      setTitle('');
    } catch(e: unknown){
      const msg = e instanceof Error ? e.message : tBoard('addCard.errors.generic');
      setError(msg);
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="app-toolbar flex items-stretch gap-0 rounded-xl p-1">
        <input
          value={title}
          disabled={disabled||submitting}
          onChange={e=>setTitle(e.target.value)}
          placeholder={tBoard('addCard.placeholder')}
          className="app-input flex-1 rounded-l-xl border-r-0 px-3 py-2 text-sm"
        />
        <button 
          disabled={disabled||submitting} 
          className="flex w-10 items-center justify-center rounded-r-xl font-bold text-lg transition disabled:opacity-60"
          style={{ background: 'var(--color-accent)', color: 'var(--color-accent-foreground)' }}
          title={tBoard('addCard.buttonTitle')}
        >
          +
        </button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    </form>
  );
}
