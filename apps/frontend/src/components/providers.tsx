"use client";

import { AuthProvider } from "@/features/auth/auth-provider";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { I18nProvider } from "@/i18n";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
