"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/features/auth/auth-provider";
import { ToastProvider } from "@/components/toast/ToastProvider";
import { I18nProvider } from "@/i18n";
import { HelpModeProvider } from "@/contexts/HelpModeContext";
import { ThemeProvider } from "@/themes/theme-provider";
import { RouteTransition } from "@/components/route-transition";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <I18nProvider>
      <AuthProvider>
        <HelpModeProvider>
          <ThemeProvider>
            <ToastProvider>
              <QueryClientProvider client={queryClient}>
                <RouteTransition>{children}</RouteTransition>
              </QueryClientProvider>
            </ToastProvider>
          </ThemeProvider>
        </HelpModeProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
