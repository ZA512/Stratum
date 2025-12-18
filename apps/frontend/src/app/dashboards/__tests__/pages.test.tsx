import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderWithProviders } from '@test/test-utils';

const shellSpy = vi.hoisted(() =>
  vi.fn((props: Record<string, unknown>) => (
    <div data-testid="dashboard-shell" data-props={JSON.stringify(props)} />
  )),
);

vi.mock('@/features/dashboards/DashboardPageShell', () => ({
  DashboardPageShell: (props: Record<string, unknown>) => shellSpy(props),
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
        titleKey: 'dashboard.execution.title',
        descriptionKey: 'dashboard.execution.description',
        supportedModes: ['AGGREGATED'],
      }),
    );
  });

  it('renders progress dashboard shell with expected props', () => {
    renderWithProviders(<ProgressDashboardPage />);
    expect(shellSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard: 'PROGRESS',
        titleKey: 'dashboard.progress.title',
        descriptionKey: 'dashboard.progress.description',
        supportedModes: ['AGGREGATED'],
      }),
    );
  });

  it('renders risk dashboard shell with expected props', () => {
    renderWithProviders(<RiskDashboardPage />);
    expect(shellSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard: 'RISK',
        titleKey: 'dashboard.risk.title',
        descriptionKey: 'dashboard.risk.description',
        supportedModes: ['AGGREGATED', 'COMPARISON'],
      }),
    );
  });
});
