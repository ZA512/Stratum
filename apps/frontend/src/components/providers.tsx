"use client";

import { AuthProvider } from "@/features/auth/auth-provider";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { I18nProvider } from "@/i18n";
import { HelpModeProvider } from "@/contexts/HelpModeContext";
import { ThemeProvider } from "@/themes/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <HelpModeProvider>
          <ThemeProvider>
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
        </HelpModeProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
