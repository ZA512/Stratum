import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import { mockUsePathname, mockUseRouter, mockUseSearchParams } from './test/mocks/next-navigation';

// Définir React globalement pour les composants JSX
globalThis.React = React;

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: mockUseRouter,
  usePathname: mockUsePathname,
  useSearchParams: mockUseSearchParams,
}));

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
  headers: () => new Map(),
}));
