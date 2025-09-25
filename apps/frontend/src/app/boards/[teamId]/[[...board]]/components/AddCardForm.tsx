"use client";
import React, { useState, FormEvent } from 'react';

interface AddCardFormProps {
  onCreate: (title: string) => Promise<void> | void;
  disabled?: boolean;
}

export function AddCardForm({ onCreate, disabled }: AddCardFormProps){
  const [title,setTitle] = useState('');
  const [error,setError] = useState<string|null>(null);
  const [submitting,setSubmitting] = useState(false);

  const submit = async (e:FormEvent) => {
    e.preventDefault();
    if(!title.trim()){ setError('Titre obligatoire'); return; }
    setSubmitting(true); setError(null);
    try {
      await onCreate(title.trim());
      setTitle('');
    } catch(e: unknown){
      const msg = e instanceof Error ? e.message : 'Erreur création';
      setError(msg);
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        value={title}
        disabled={disabled||submitting}
        onChange={e=>setTitle(e.target.value)}
        placeholder="Nouvelle tâche"
        className="w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <button disabled={disabled||submitting} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
          {submitting? 'Ajout…':'Ajouter'}
        </button>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </form>
  );
}
