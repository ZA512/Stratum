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
      <div className="flex items-stretch gap-0">
        <input
          value={title}
          disabled={disabled||submitting}
          onChange={e=>setTitle(e.target.value)}
          placeholder={tBoard('addCard.placeholder')}
          className="flex-1 rounded-l-xl border border-r-0 border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:relative focus:z-10"
        />
        <button 
          disabled={disabled||submitting} 
          className="flex items-center justify-center w-10 rounded-r-xl border border-white/10 bg-accent text-background font-bold text-lg disabled:opacity-60 hover:bg-accent/90 transition"
          title={tBoard('addCard.buttonTitle')}
        >
          +
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </form>
  );
}
