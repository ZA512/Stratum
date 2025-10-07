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
      <div className="flex items-stretch gap-0">
        <input
          value={title}
          disabled={disabled||submitting}
          onChange={e=>setTitle(e.target.value)}
          placeholder="Nouvelle tâche"
          className="flex-1 rounded-l-xl border border-r-0 border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:relative focus:z-10"
        />
        <button 
          disabled={disabled||submitting} 
          className="flex items-center justify-center w-10 rounded-r-xl border border-white/10 bg-accent text-background font-bold text-lg disabled:opacity-60 hover:bg-accent/90 transition"
          title="Ajouter une tâche"
        >
          +
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </form>
  );
}
