// Pas de "use client" ici: ce layout est neutre, le layout parent gère provider + breadcrumb.
import React from "react";

export default function BoardsDeepLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
