import type { PlayerRole, Story } from '@axon/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StoryPanel, WAITING_MESSAGE } from './StoryPanel';
import type { ActionResult } from '../../types/game.types';

const STORY: Story = { title: 'Login page', url: 'https://example.com/1' };

function setup(role: PlayerRole | null, story: Story | null, disabled = false) {
  const onSetStory = vi.fn<(story: Story) => Promise<ActionResult>>(() =>
    Promise.resolve({ ok: true }),
  );
  const user = userEvent.setup();
  const view = render(
    <StoryPanel story={story} role={role} disabled={disabled} onSetStory={onSetStory} />,
  );
  return { user, onSetStory, ...view };
}

describe('StoryPanel as facilitator', () => {
  it('shows the empty "Story" form with a required Title, a Link and "Start voting" while waiting', () => {
    setup('facilitator', null);

    const form = screen.getByRole('form', { name: 'Story' });
    expect(within(form).getByLabelText('Title')).toHaveValue('');
    expect(within(form).getByLabelText('Link')).toHaveValue('');
    expect(within(form).getByRole('button', { name: 'Start voting' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Edit story' })).not.toBeInTheDocument();
    expect(screen.queryByText(WAITING_MESSAGE)).not.toBeInTheDocument();
  });

  it('sends the story from the form', async () => {
    const { user, onSetStory } = setup('facilitator', null);

    await user.type(screen.getByLabelText('Title'), 'Login page');
    await user.type(screen.getByLabelText('Link'), 'https://example.com/1');
    await user.click(screen.getByRole('button', { name: 'Start voting' }));

    expect(onSetStory).toHaveBeenCalledExactlyOnceWith(STORY);
  });

  it('shows the story read-only with "Edit story" once voting is open', () => {
    setup('facilitator', STORY);

    expect(
      screen.getByRole('link', { name: 'Login page (opens in a new tab)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit story' })).toBeEnabled();
    expect(screen.queryByRole('form', { name: 'Story' })).not.toBeInTheDocument();
  });

  it('opens a prefilled form with Save and Cancel from "Edit story"', async () => {
    const { user } = setup('facilitator', STORY);

    await user.click(screen.getByRole('button', { name: 'Edit story' }));

    expect(screen.getByLabelText('Title')).toHaveValue('Login page');
    expect(screen.getByLabelText('Title')).toHaveFocus();
    expect(screen.getByLabelText('Link')).toHaveValue('https://example.com/1');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Edit story' })).not.toBeInTheDocument();
  });

  it('restores the read-only view and the focus on Cancel without sending', async () => {
    const { user, onSetStory } = setup('facilitator', STORY);
    await user.click(screen.getByRole('button', { name: 'Edit story' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Changed');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Changed')).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Story' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit story' })).toHaveFocus();
    expect(onSetStory).not.toHaveBeenCalled();
  });

  it('sends the full edited story on Save and closes the form on success', async () => {
    const { user, onSetStory } = setup('facilitator', STORY);
    await user.click(screen.getByRole('button', { name: 'Edit story' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Checkout');
    await user.clear(screen.getByLabelText('Link'));
    await user.type(screen.getByLabelText('Link'), 'https://example.com/2');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSetStory).toHaveBeenCalledExactlyOnceWith({
      title: 'Checkout',
      url: 'https://example.com/2',
    });
    expect(await screen.findByRole('button', { name: 'Edit story' })).toHaveFocus();
    expect(screen.queryByRole('form', { name: 'Story' })).not.toBeInTheDocument();
  });

  it('keeps the edit form open and shows the alert when Save fails', async () => {
    const { user, onSetStory } = setup('facilitator', STORY);
    onSetStory.mockResolvedValueOnce({ ok: false, code: 'INVALID_STORY' });
    await user.click(screen.getByRole('button', { name: 'Edit story' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a link starting with http:// or https://, and an optional title of up to 200 characters.',
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Login page');
  });

  it('disables "Edit story" while reconnecting', () => {
    setup('facilitator', STORY, true);

    expect(screen.getByRole('button', { name: 'Edit story' })).toBeDisabled();
  });

  it('disables "Start voting" while reconnecting', () => {
    setup('facilitator', null, true);

    expect(screen.getByRole('button', { name: 'Start voting' })).toBeDisabled();
  });

  it('disables Save while reconnecting during an edit', async () => {
    const { user, rerender, onSetStory } = setup('facilitator', STORY);
    await user.click(screen.getByRole('button', { name: 'Edit story' }));

    rerender(<StoryPanel story={STORY} role="facilitator" disabled onSetStory={onSetStory} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('StoryPanel as voter', () => {
  it('shows the waiting message and no form while no story is set', () => {
    setup('voter', null);

    expect(screen.getByText('Waiting for the facilitator to set the story.')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the title read-only with no form and no "Edit story" button', () => {
    setup('voter', STORY);

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(WAITING_MESSAGE)).not.toBeInTheDocument();
  });

  it('makes the title the safe new-tab link and does not show the address', () => {
    setup('voter', STORY);

    const anchor = screen.getByRole('link', { name: /^Login page.*\(opens in a new tab\)$/ });
    expect(anchor).toHaveAttribute('href', 'https://example.com/1');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(anchor).toHaveTextContent('Login page');
    expect(screen.queryByText(/example\.com/)).toBeNull();
  });

  it('renders no anchor when the story has no link', () => {
    setup('voter', { title: 'Login page' });

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a markup title literally and injects no element', () => {
    const title = '<img src=x onerror=alert(1)>';
    const { container } = setup('voter', { title });

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows a 200-character title as the link text and never the 2048-character address', () => {
    const url = `https://example.com/${'a'.repeat(2028)}`;
    setup('voter', { title: 'T'.repeat(200), url });

    expect(screen.getByRole('link')).toHaveTextContent('T'.repeat(200));
    expect(screen.getByRole('link')).toHaveAttribute('href', url);
    expect(document.body).not.toHaveTextContent('aaaaaaaaaa');
  });
});

describe('StoryPanel without a known role', () => {
  it('is read-only', () => {
    setup(null, STORY);

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('StoryPanel with a link-only story', () => {
  it.each(['voter', 'facilitator'] as const)(
    'shows the link as the clickable text to a %s',
    (role) => {
      setup(role, { title: '', url: 'https://example.com/1' });

      const link = screen.getByRole('link', { name: 'https://example.com/1 (opens in a new tab)' });
      expect(link).toHaveAttribute('href', 'https://example.com/1');
      expect(screen.getAllByRole('link')).toHaveLength(1);
    },
  );

  it('prefills Edit story with an empty title and the link', async () => {
    const { user } = setup('facilitator', { title: '', url: 'https://example.com/1' });

    await user.click(screen.getByRole('button', { name: 'Edit story' }));

    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Link')).toHaveValue('https://example.com/1');
  });
});
