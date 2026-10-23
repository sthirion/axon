import type { PlayerRole, Story } from '@axon/shared';
import { memo, useEffect, useId, useRef, useState } from 'react';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';
import { StoryForm } from '../molecules/StoryForm';

export const WAITING_MESSAGE = 'Waiting for the facilitator to set the story.';

interface StoryPanelProps {
  readonly story: Story | null;
  readonly role: PlayerRole | null;
  readonly disabled: boolean;
  // The story is frozen once votes are revealed.
  readonly locked?: boolean;
  readonly onSetStory: (story: Story) => Promise<ActionResult>;
}

function StoryDetails({ story }: { readonly story: Story }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium wrap-anywhere">{story.title}</p>
      {story.url && (
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-blue-800 dark:text-blue-300 underline wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-slate-100"
        >
          {story.url} <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

export const StoryPanel = memo(function StoryPanel({
  story,
  role,
  disabled,
  locked = false,
  onSetStory,
}: StoryPanelProps) {
  const headingId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const [editing, setEditing] = useState(false);

  // Return focus to "Edit story" when the edit form closes.
  useEffect(() => {
    if (wasEditing.current && !editing) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const isFacilitator = role === 'facilitator';
  const closeEditor = () => setEditing(false);

  function renderBody() {
    if (isFacilitator && story === null) {
      return <StoryForm submitLabel="Start voting" disabled={disabled} onSubmit={onSetStory} />;
    }
    if (isFacilitator && editing && !locked && story) {
      return (
        <StoryForm
          submitLabel="Save"
          initialStory={story}
          disabled={disabled}
          focusOnMount
          onSubmit={onSetStory}
          onSaved={closeEditor}
          onCancel={closeEditor}
        />
      );
    }
    if (!story) return <p>{WAITING_MESSAGE}</p>;
    return (
      <>
        <StoryDetails story={story} />
        {isFacilitator && !locked && (
          <Button ref={editButtonRef} disabled={disabled} onClick={() => setEditing(true)}>
            Edit story
          </Button>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2">
      <h2 id={headingId} className="text-lg font-semibold">
        Story
      </h2>
      {renderBody()}
    </section>
  );
});
StoryPanel.displayName = 'StoryPanel';
