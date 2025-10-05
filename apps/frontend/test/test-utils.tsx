import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { I18nProvider } from '@/i18n/index';
import {
  mockUsePathname,
  mockUseRouter,
  mockUseSearchParams,
} from './mocks/next-navigation';

export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions,
) {
  return render(<I18nProvider>{ui}</I18nProvider>, options);
}

export const nextNavigationMocks = {
  useRouter: mockUseRouter,
  usePathname: mockUsePathname,
  useSearchParams: mockUseSearchParams,
};
