import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import { screen } from '@testing-library/react';
import { DashboardWidgetCard } from '../DashboardWidgetCard';

describe('DashboardWidgetCard', () => {
  it('affiche un message pédagogique pour une couverture insuffisante', () => {
    renderWithProviders(
      <DashboardWidgetCard
        widget={{
          id: 'progress.effortWeighted',
          label: 'Progression pondérée',
          description: 'Test coverage widget',
          status: 'insufficient-coverage',
          reason: 'Couverture insuffisante pour effort (<0.4)',
          payload: null,
          durationMs: 12,
        }}
      />,
    );

    expect(
      screen.getByText(/insufficient data coverage/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Couverture insuffisante pour effort/i),
    ).toBeInTheDocument();
  });
});
