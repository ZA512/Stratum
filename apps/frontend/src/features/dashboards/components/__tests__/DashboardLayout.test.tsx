import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders, nextNavigationMocks } from '@/test/test-utils';
import { DashboardLayout } from '../DashboardLayout';

describe('DashboardLayout', () => {
  it('permet de basculer entre les modes agrégé et comparaison', async () => {
    nextNavigationMocks.usePathname.mockReturnValue('/dashboards/progress');
    const user = userEvent.setup();

    function Wrapper() {
      const [mode, setMode] = useState<'SELF' | 'AGGREGATED' | 'COMPARISON'>(
        'SELF',
      );
      return (
        <DashboardLayout
          dashboard="PROGRESS"
          title="Progression"
          description="Test"
          mode={mode}
          supportedModes={['SELF', 'AGGREGATED', 'COMPARISON']}
          onModeChange={setMode}
          hiddenWidgetsCount={2}
        >
          <div>Contenu</div>
        </DashboardLayout>
      );
    }

    renderWithProviders(<Wrapper />);

    const aggregatedToggle = screen.getByRole('switch', {
      name: /descendants/i,
    });
    const comparisonToggle = screen.getByRole('switch', {
      name: /comparer/i,
    });

    await user.click(aggregatedToggle);
    expect(aggregatedToggle).toHaveAttribute('aria-checked', 'true');

    await user.click(comparisonToggle);
    expect(comparisonToggle).toHaveAttribute('aria-checked', 'true');
    expect(aggregatedToggle).toHaveAttribute('aria-checked', 'false');

    await user.click(comparisonToggle);
    expect(comparisonToggle).toHaveAttribute('aria-checked', 'false');
    expect(aggregatedToggle).toHaveAttribute('aria-checked', 'true');

    nextNavigationMocks.usePathname.mockReturnValue('/dashboards/execution');
  });
});
