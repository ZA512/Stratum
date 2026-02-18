"use client";

import { useEffect, useRef, useState } from 'react';

type AgentSlaIndicatorProps = {
  /** true while the agent request is in-flight */
  loading: boolean;
  /** SLA threshold in ms — switches to warning above this */
  thresholdMs?: number;
};

/**
 * AN-P1-11 — SLA latence percue.
 *
 * Composant qui affiche un indicateur de temps ecoule pendant une
 * requete agent IA. Change de couleur si le SLA est depasse.
 *
 * Usage:
 * ```tsx
 * <AgentSlaIndicator loading={mutation.isPending} thresholdMs={3000} />
 * ```
 */
export function AgentSlaIndicator({
  loading,
  thresholdMs = 3_000,
}: AgentSlaIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (loading) {
      startRef.current = Date.now();
      setElapsed(0);

      const tick = () => {
        setElapsed(Date.now() - startRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      return () => cancelAnimationFrame(rafRef.current);
    }
    // Keep last elapsed visible when loading stops
    cancelAnimationFrame(rafRef.current);
  }, [loading]);

  if (!loading && elapsed === 0) return null;

  const seconds = (elapsed / 1000).toFixed(1);
  const overSla = elapsed > thresholdMs;

  return (
    <div className="inline-flex items-center gap-1.5">
      {loading && (
        <span
          className={`inline-block h-2 w-2 rounded-full ${overSla ? 'bg-amber-400 animate-pulse' : 'bg-accent animate-pulse'}`}
        />
      )}
      <span
        className={`text-[11px] font-mono tabular-nums ${
          overSla ? 'text-amber-400' : 'text-muted'
        }`}
      >
        {seconds}s
      </span>
      {loading && overSla && (
        <span className="text-[10px] text-amber-400">SLA</span>
      )}
      {!loading && (
        <span
          className={`text-[10px] ${overSla ? 'text-amber-400' : 'text-green-400'}`}
        >
          {overSla ? 'lent' : 'OK'}
        </span>
      )}
    </div>
  );
}
