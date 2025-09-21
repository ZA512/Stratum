"use client";

import React from "react";

// Layout minimal pour la route imbriquée des boards.
// Next.js attend un export par défaut qui soit un composant React.
// On se contente ici de rendre les children. Si on souhaite plus tard
// persister un état ou ajouter un wrapper commun (animations, breadcrumb persistant, etc.)
// on pourra étendre ce layout.

export default function BoardsNestedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}

