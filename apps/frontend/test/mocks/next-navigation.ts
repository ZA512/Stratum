import { vi } from 'vitest';

type Router = {
  replace: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  prefetch: ReturnType<typeof vi.fn>;
  back: ReturnType<typeof vi.fn>;
};

export const mockUseRouter = vi.fn(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
}) as Router);

export const mockUsePathname = vi.fn(() => '/dashboards/execution');

export const mockUseSearchParams = vi.fn(() => new URLSearchParams());
