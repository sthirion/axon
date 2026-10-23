import { ERROR_MESSAGES } from '@axon/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LINK_ERROR_MESSAGE, StoryForm, TITLE_ERROR_MESSAGE } from './StoryForm';
import type { ActionResult } from '../../types/game.types';

const OK: ActionResult = { ok: true };
const LINK = 'https://example.com/1';

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

async function fill(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) {
  await user.click(field);
  await user.paste(value);
}

describe('StoryForm', () => {
  it('renders a "Story" form with an optional Title and a required Link', () => {
    setup();

    expect(screen.getByRole('form', { name: 'Story' })).toBeInTheDocument();
    expect(title()).not.toHaveAttribute('aria-required');
    expect(link()).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('The link is required. The title is optional.')).toBeVisible();
    expect(title()).toHaveAccessibleDescription('The link is required. The title is optional.');
    expect(link()).toHaveAccessibleDescription('The link is required. The title is optional.');
    expect(submit()).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('prefills the fields from the initial story, an empty title included', () => {
    setup({ initialStory: { title: 'Login', url: LINK } });
    expect(title()).toHaveValue('Login');
    expect(link()).toHaveValue(LINK);
  });

  it('prefills a link-only story with an empty title and the link', () => {
    setup({ initialStory: { title: '', url: LINK } });

    expect(title()).toHaveValue('');
    expect(link()).toHaveValue(LINK);
  });

  it('focuses the title on mount when asked to', () => {
    setup({ focusOnMount: true });

    expect(title()).toHaveFocus();
  });

  it('sends the trimmed title and the trimmed link', async () => {
    const { user, onSubmit } = setup();

    await user.type(title(), '  Login page  ');
    await fill(user, link(), `  ${LINK}  `);
    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ title: 'Login page', url: LINK });
  });

  it('sends a link-only story with an empty title', async () => {
    const { user, onSubmit } = setup();
    await fill(user, link(), LINK);

    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ title: '', url: LINK });
  });

  it('submits on Enter in the link field', async () => {
    const { user, onSubmit } = setup();
    await user.type(title(), 'Login');
    await user.click(link());
    await user.paste(LINK);

    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ title: 'Login', url: LINK });
  });

  it.each([
    ['no link', ''],
    ['a whitespace-only link', '   '],
  ])('rejects %s before sending, flags the Link field and focuses it', async (_name, value) => {
    const { user, onSubmit } = setup();
    await user.type(title(), 'Login');
    if (value) await fill(user, link(), value);

    await user.click(submit());

    const error = screen.getByText(LINK_ERROR_MESSAGE);
    expect(LINK_ERROR_MESSAGE).toBe('Enter a full link starting with http:// or https://.');
    expect(link()).toHaveAttribute('aria-invalid', 'true');
    expect(link()).toHaveAttribute('aria-describedby', error.id);
    expect(link()).toHaveFocus();
    expect(title()).not.toHaveAttribute('aria-invalid');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a title-only story: the link is required', async () => {
    const { user, onSubmit } = setup();
    await user.type(title(), 'Login{Enter}');

    expect(screen.getByText(LINK_ERROR_MESSAGE)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an empty form with the link error only and focuses the link', async () => {
    const { user, onSubmit } = setup();

    await user.click(submit());

    expect(screen.getByText(LINK_ERROR_MESSAGE)).toBeInTheDocument();
    expect(title()).not.toHaveAttribute('aria-invalid');
    expect(link()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '/relative/path',
    '//evil.example/x',
    'https://',
    'ftp://host/x',
    'example.com',
    'not a url',
    `https://example.com/${'a'.repeat(2048)}`,
  ])(
    'rejects the non-URL or unsafe link %# before sending and focuses the Link field',
    async (value) => {
      const { user, onSubmit } = setup();
      await user.type(title(), 'Login');
      await fill(user, link(), value);

      await user.click(submit());

      expect(screen.getByText(LINK_ERROR_MESSAGE)).toBeInTheDocument();
      expect(link()).toHaveAttribute('aria-invalid', 'true');
      expect(link()).toHaveFocus();
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('rejects a bad link even when there is no title', async () => {
    const { user, onSubmit } = setup();
    await fill(user, link(), 'javascript:alert(1)');

    await user.click(submit());

    expect(screen.getByText(LINK_ERROR_MESSAGE)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a 201-character title, flags the Title field and focuses it', async () => {
    const { user, onSubmit } = setup();
    await fill(user, title(), 'x'.repeat(201));
    await fill(user, link(), LINK);

    await user.click(submit());

    const error = screen.getByText(TITLE_ERROR_MESSAGE);
    expect(TITLE_ERROR_MESSAGE).toBe('Enter a title of up to 200 characters.');
    expect(title()).toHaveAttribute('aria-invalid', 'true');
    expect(title()).toHaveAttribute('aria-describedby', error.id);
    expect(title()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts a 200-character title', async () => {
    const { user, onSubmit } = setup();
    await fill(user, title(), 'x'.repeat(200));
    await fill(user, link(), LINK);

    await user.click(submit());

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows both errors and focuses the title when both fields are invalid', async () => {
    const { user, onSubmit } = setup();
    await fill(user, title(), 'x'.repeat(201));
    await fill(user, link(), 'nope');

    await user.click(submit());

    expect(screen.getByText(TITLE_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(LINK_ERROR_MESSAGE)).toBeInTheDocument();
    expect(title()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the field is edited', async () => {
    const { user } = setup();
    await user.click(submit());

    await user.type(link(), 'h');

    expect(screen.queryByText(LINK_ERROR_MESSAGE)).not.toBeInTheDocument();
    expect(link()).not.toHaveAttribute('aria-invalid');
    expect(link()).toHaveAccessibleDescription('The link is required. The title is optional.');
  });

  it('disables the button and shows "Saving…" while the ack is pending, then closes via onSaved', async () => {
    let settle: (result: ActionResult) => void = () => {};
    const onSubmit = vi.fn(() => new Promise<ActionResult>((resolve) => (settle = resolve)));
    const onSaved = vi.fn();
    const { user } = setup({ onSubmit, onSaved });
    await fill(user, link(), LINK);

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
    ['INVALID_STORY', ERROR_MESSAGES.INVALID_STORY],
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
      await fill(user, link(), LINK);

      await user.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(title()).toHaveValue('Login');
      expect(link()).toHaveValue(LINK);
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
    await fill(user, link(), LINK);
    await user.click(submit());
    await screen.findByRole('alert');

    await user.click(submit());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the submit button disabled and sends nothing while disabled', async () => {
    const { user, onSubmit } = setup({ disabled: true });
    await fill(user, link(), LINK);
    await user.keyboard('{Enter}');

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
