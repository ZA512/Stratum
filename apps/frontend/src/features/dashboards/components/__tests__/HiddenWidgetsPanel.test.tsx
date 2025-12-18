import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@test/test-utils';
import { screen } from '@testing-library/react';
import { HiddenWidgetsPanel } from '../HiddenWidgetsPanel';

describe('HiddenWidgetsPanel', () => {
  it('affiche les widgets masqués et permet la fermeture', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <HiddenWidgetsPanel
        open
        onClose={onClose}
        widgets={[
          {
            id: 'progress.effortWeighted',
            label: 'Progression pondérée',
            description: 'Requiert plus de couverture',
            status: 'insufficient-coverage',
            reason: 'Couverture effort < 0.4',
            payload: null,
            durationMs: 10,
          },
        ]}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(/Effort-weighted progress/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /fermer|close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
