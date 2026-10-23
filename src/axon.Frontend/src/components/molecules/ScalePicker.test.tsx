import type { Scale } from '@axon/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScalePicker } from './ScalePicker';

function renderPicker(value: Scale = 'fibonacci', onChange = vi.fn(), disabled = false) {
  render(<ScalePicker value={value} onChange={onChange} disabled={disabled} />);
  return onChange;
}

describe('ScalePicker', () => {
  it('is a radio group "Voting scale" with the three scales and their deck descriptions', () => {
    renderPicker();

    expect(screen.getByRole('group', { name: 'Voting scale' })).toBeVisible();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'fibonacci',
      'incremental',
      'tshirt',
    ]);
    expect(screen.getByRole('radio', { name: /Fibonacci/ })).toBeVisible();
    expect(screen.getByText('1, 2, 3, 5, 8, 13, 21')).toBeVisible();
    expect(screen.getByText('1 to 10')).toBeVisible();
    expect(screen.getByText('XS, S, M, L, XL')).toBeVisible();
  });

  it.each<[Scale, string]>([
    ['fibonacci', 'Fibonacci'],
    ['incremental', 'Incremental'],
    ['tshirt', 'T-shirt sizes'],
  ])('shows %s as the selected scale', (value, label) => {
    renderPicker(value);

    expect(screen.getByRole('radio', { name: new RegExp(label) })).toBeChecked();
    expect(
      screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked),
    ).toHaveLength(1);
  });

  it('reports the chosen scale on a click', async () => {
    const onChange = renderPicker();

    await userEvent.click(screen.getByRole('radio', { name: /T-shirt sizes/ }));

    expect(onChange).toHaveBeenCalledWith('tshirt');
  });

  it('is operable by keyboard: arrows move between scales', async () => {
    const onChange = renderPicker();
    await userEvent.tab();

    await userEvent.keyboard('{ArrowDown}');

    expect(onChange).toHaveBeenCalledWith('incremental');
  });

  it('cannot be changed while disabled', async () => {
    const onChange = renderPicker('fibonacci', vi.fn(), true);

    await userEvent.click(screen.getByRole('radio', { name: /Incremental/ }));

    expect(onChange).not.toHaveBeenCalled();
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
  });
});
