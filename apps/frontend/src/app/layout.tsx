/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { DEFAULT_THEME } from "@/themes";
import { QuickNotesRadar } from "@/features/quick-notes/QuickNotesRadar";
import { QuickNotesDock } from "@/features/quick-notes/QuickNotesDock";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stratum Kanban",
  description: "Pilotage fractal des equipes produit",
  // Favicon automatiquement géré par la présence de /src/app/favicon.ico
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME.id}
      className={DEFAULT_THEME.tone === "dark" ? "dark" : undefined}
    >
      <head>
        {/* Pré-chargement pour fiabiliser le rendu des icônes */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Feuille officielle Material Icons Outlined (ligatures .material-icons-outlined) */}
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined&display=swap"
          rel="stylesheet"
        />
        {/* Material Symbols (variable) pour classes .material-symbols-outlined */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />
  {/* Favicon: inutile d'ajouter <link> car app/favicon.ico est détecté automatiquement */}
      </head>
      <body
        data-theme={DEFAULT_THEME.id}
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-surface text-foreground`}
        suppressHydrationWarning
      >
        <Providers>
          <QuickNotesRadar />
          <QuickNotesDock />
          {children}
        </Providers>
      </body>
    </html>
  );
}
