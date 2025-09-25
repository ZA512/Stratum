"use client";

import { AuthProvider } from "@/features/auth/auth-provider";
import { ToastProvider } from "@/components/toast/ToastProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
