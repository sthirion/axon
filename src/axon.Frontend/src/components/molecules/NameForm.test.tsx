import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NameForm } from './NameForm';

const INVALID_NAME = 'Enter a name of 1 to 30 characters.';

function renderForm(props: Partial<ComponentProps<typeof NameForm>> = {}) {
  const onSubmit = vi.fn();
  render(<NameForm submitLabel="Join" submitting={false} onSubmit={onSubmit} {...props} />);
  return { onSubmit, input: screen.getByLabelText('Your name') as HTMLInputElement };
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe('NameForm', () => {
  it('has a labelled field and a submit button', () => {
    const { input } = renderForm();

    expect(input).toHaveAccessibleName('Your name');
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('submits the trimmed name when it is valid', () => {
    const { onSubmit, input } = renderForm();

    type(input, '  Anna  ');
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Anna');
  });

  it('accepts a name of exactly 30 characters', () => {
    const { onSubmit, input } = renderForm();

    type(input, 'a'.repeat(30));
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(onSubmit).toHaveBeenCalledWith('a'.repeat(30));
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '    '],
    ['31 characters', 'a'.repeat(31)],
    ['containing a control character', 'a\u0007b'],
  ])('shows the validation error and sends nothing when the name is %s', (_label, value) => {
    const { onSubmit, input } = renderForm();

    type(input, value);
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(INVALID_NAME)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(INVALID_NAME);
    expect(input).toHaveFocus();
  });

  it('returns focus to the field when the invalid submit is repeated', () => {
    const { input } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    screen.getByRole('button', { name: 'Join' }).focus();

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(input).toHaveFocus();
  });

  it('clears the validation error when the visitor edits the field', () => {
    const { input } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    type(input, 'A');

    expect(screen.queryByText(INVALID_NAME)).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('disables the button and ignores submits while submitting', () => {
    const { onSubmit, input } = renderForm({ submitting: true });

    type(input, 'Anna');
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server field error, links it to the field and moves focus there', () => {
    const { input } = renderForm({
      fieldError: 'That name is already taken in this session. Choose another.',
    });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'That name is already taken in this session. Choose another.',
    );
    expect(input).toHaveFocus();
  });

  it('keeps the entered value when a field error arrives', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <NameForm submitLabel="Join" submitting={false} onSubmit={onSubmit} />,
    );
    type(screen.getByLabelText('Your name') as HTMLInputElement, 'anna');

    rerender(
      <NameForm submitLabel="Join" submitting={false} onSubmit={onSubmit} fieldError="Taken" />,
    );

    expect(screen.getByLabelText('Your name')).toHaveValue('anna');
  });

  it('announces a form error as an alert without marking the field invalid', () => {
    const { input } = renderForm({ formError: 'Something went wrong. Try again.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});
