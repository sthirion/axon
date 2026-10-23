import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LINK_ERROR_MESSAGE, StoryForm, TITLE_ERROR_MESSAGE } from './StoryForm';
import type { ActionResult } from '../../types/game.types';

const OK: ActionResult = { ok: true };

function setup(overrides: Partial<Parameters<typeof StoryForm>[0]> = {}) {
  const onSubmit = vi.fn<(story: unknown) => Promise<ActionResult>>(() => Promise.resolve(OK));
  const user = userEvent.setup();
  render(
    <StoryForm submitLabel="Start voting" disabled={false} onSubmit={onSubmit} {...overrides} />,
  );
  return { user, onSubmit };
}

const title = () => screen.getByLabelText('Title');
const link = () => screen.getByLabelText('Link');
const submit = () => screen.getByRole('button', { name: /Start voting|Saving…/ });

describe('StoryForm', () => {
  it('renders a "Story" form with a required Title, an optional Link and the submit button', () => {
    setup();

    expect(screen.getByRole('form', { name: 'Story' })).toBeInTheDocument();
    expect(title()).toHaveAttribute('aria-required', 'true');
    expect(link()).not.toHaveAttribute('aria-required');
    expect(submit()).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('prefills the fields from the initial story', () => {
    setup({ initialStory: { title: 'Login', url: 'https://example.com/1' } });

    expect(title()).toHaveValue('Login');
    expect(link()).toHaveValue('https://example.com/1');
  });

  it('focuses the title on mount when asked to', () => {
    setup({ focusOnMount: true });

    expect(title()).toHaveFocus();
  });

  it('sends the trimmed title and the link', async () => {
    const { user, onSubmit } = setup();

    await user.type(title(), '  Login page  ');
    await user.type(link(), 'https://example.com/1');
    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      title: 'Login page',
      url: 'https://example.com/1',
    });
  });

  it('omits the url key when the link is blank', async () => {
    const { user, onSubmit } = setup();

    await user.type(title(), 'Login page');
    await user.type(link(), '   ');
    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ title: 'Login page' });
  });

  it('submits on Enter in the title field', async () => {
    const { user, onSubmit } = setup();

    await user.type(title(), 'Login{Enter}');

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ title: 'Login' });
  });

  it.each([
    ['an empty title', ''],
    ['a whitespace-only title', '   '],
    ['a 201-character title', 'x'.repeat(201)],
  ])('rejects %s before sending, flags the field and moves focus to it', async (_name, value) => {
    const { user, onSubmit } = setup();
    if (value) {
      await user.click(title());
      await user.paste(value);
    }

    await user.click(submit());

    const error = screen.getByText(TITLE_ERROR_MESSAGE);
    expect(TITLE_ERROR_MESSAGE).toBe('Enter a title of 1 to 200 characters.');
    expect(title()).toHaveAttribute('aria-invalid', 'true');
    expect(title()).toHaveAttribute('aria-describedby', error.id);
    expect(title()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts a 200-character title', async () => {
    const { user, onSubmit } = setup();
    await user.click(title());
    await user.paste('x'.repeat(200));

    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '/relative/path',
    '//evil.example/x',
    'https://',
    'ftp://host/x',
    `https://example.com/${'a'.repeat(2048)}`,
  ])('rejects the link %# before sending and focuses the Link field', async (value) => {
    const { user, onSubmit } = setup();
    await user.type(title(), 'Login');
    await user.click(link());
    await user.paste(value);

    await user.click(submit());

    const error = screen.getByText(LINK_ERROR_MESSAGE);
    expect(LINK_ERROR_MESSAGE).toBe('Enter a full link starting with http:// or https://.');
    expect(link()).toHaveAttribute('aria-invalid', 'true');
    expect(link()).toHaveAttribute('aria-describedby', error.id);
    expect(link()).toHaveFocus();
    expect(title()).not.toHaveAttribute('aria-invalid');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows both errors and focuses the title when both fields are invalid', async () => {
    const { user, onSubmit } = setup();
    await user.type(link(), 'nope');

    await user.click(submit());

    expect(screen.getByText(TITLE_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(LINK_ERROR_MESSAGE)).toBeInTheDocument();
    expect(title()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the field is edited', async () => {
    const { user } = setup();
    await user.click(submit());

    await user.type(title(), 'a');

    expect(screen.queryByText(TITLE_ERROR_MESSAGE)).not.toBeInTheDocument();
    expect(title()).not.toHaveAttribute('aria-invalid');
    expect(title()).not.toHaveAttribute('aria-describedby');
  });

  it('disables the button and shows "Saving…" while the ack is pending, then closes via onSaved', async () => {
    let settle: (result: ActionResult) => void = () => {};
    const onSubmit = vi.fn(() => new Promise<ActionResult>((resolve) => (settle = resolve)));
    const onSaved = vi.fn();
    const { user } = setup({ onSubmit, onSaved });
    await user.type(title(), 'Login');

    await user.click(submit());

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();

    settle(OK);

    expect(await screen.findByRole('button', { name: 'Start voting' })).toBeEnabled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['INVALID_STORY', 'Enter a title of 1 to 200 characters and an optional http or https link.'],
    ['FORBIDDEN', 'You are not allowed to do that.'],
    ['WRONG_PHASE', 'That action is not available right now.'],
    ['SOMETHING_NEW', 'Something went wrong. Try again.'],
    ['TIMEOUT', 'Something went wrong. Try again.'],
  ])(
    'shows the %s failure in an alert, keeps the input and re-enables the button',
    async (code, message) => {
      const onSaved = vi.fn();
      const { user } = setup({
        onSubmit: () => Promise.resolve({ ok: false, code }),
        onSaved,
      });
      await user.type(title(), 'Login');
      await user.type(link(), 'https://example.com/1');

      await user.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(title()).toHaveValue('Login');
      expect(link()).toHaveValue('https://example.com/1');
      expect(submit()).toBeEnabled();
      expect(onSaved).not.toHaveBeenCalled();
    },
  );

  it('clears the previous server error on the next submit', async () => {
    const onSubmit = vi
      .fn<(story: unknown) => Promise<ActionResult>>()
      .mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' })
      .mockResolvedValueOnce(OK);
    const { user } = setup({ onSubmit });
    await user.type(title(), 'Login');
    await user.click(submit());
    await screen.findByRole('alert');

    await user.click(submit());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the submit button disabled and sends nothing while disabled', async () => {
    const { user, onSubmit } = setup({ disabled: true });
    await user.type(title(), 'Login{Enter}');

    expect(submit()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel without sending', async () => {
    const onCancel = vi.fn();
    const { user, onSubmit } = setup({ submitLabel: 'Save', onCancel });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
