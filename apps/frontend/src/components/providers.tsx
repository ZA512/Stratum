"use client";

import { AuthProvider } from "@/features/auth/auth-provider";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { I18nProvider } from "@/i18n";
import { HelpModeProvider } from "@/contexts/HelpModeContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <HelpModeProvider>
          <ToastProvider>{children}</ToastProvider>
        </HelpModeProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
