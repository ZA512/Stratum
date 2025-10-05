import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';

const shellSpy = vi.fn((props: Record<string, unknown>) => (
  <div data-testid="dashboard-shell" data-props={JSON.stringify(props)} />
));

vi.mock('@/features/dashboards/DashboardPageShell', () => ({
  DashboardPageShell: shellSpy,
}));

import ExecutionDashboardPage from '../execution/page';
import ProgressDashboardPage from '../progress/page';
import RiskDashboardPage from '../risk/page';

describe('Dashboard page shells', () => {
  beforeEach(() => {
    shellSpy.mockClear();
  });

  it('renders execution dashboard shell with expected props', () => {
    renderWithProviders(<ExecutionDashboardPage />);
    expect(shellSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard: 'EXECUTION',
        supportedModes: ['AGGREGATED'],
      }),
      {},
    );
  });

  it('renders progress dashboard shell with expected props', () => {
    renderWithProviders(<ProgressDashboardPage />);
    expect(shellSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard: 'PROGRESS',
        supportedModes: ['AGGREGATED', 'COMPARISON'],
      }),
      {},
    );
  });

  it('renders risk dashboard shell with expected props', () => {
    renderWithProviders(<RiskDashboardPage />);
    expect(shellSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard: 'RISK',
        supportedModes: ['AGGREGATED', 'COMPARISON'],
      }),
      {},
    );
  });
});
