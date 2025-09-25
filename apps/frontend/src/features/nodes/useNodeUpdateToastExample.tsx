"use client";
import { useToast } from "@/components/toast/ToastProvider";

// Petit exemple (à supprimer ou adapter) montrant comment utiliser le hook.
export function NodeUpdateToastExample() {
  const { success, error } = useToast();
  return (
    <div className="hidden">
      <button
        onClick={() => success("Tâche mise à jour")}
        className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
      >Trigger success</button>
      <button
        onClick={() => error("Erreur de mise à jour")}
        className="rounded bg-rose-600 px-2 py-1 text-xs text-white"
      >Trigger error</button>
    </div>
  );
}
