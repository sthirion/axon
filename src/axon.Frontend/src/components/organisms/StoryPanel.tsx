import type { PlayerRole, Story } from '@axon/shared';
import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';
import { Panel } from '../atoms/Panel';
import { StoryTitle } from '../atoms/StoryTitle';
import { StoryForm } from '../molecules/StoryForm';

export const WAITING_MESSAGE = 'Waiting for the facilitator to set the story.';

interface StoryPanelProps {
  readonly story: Story | null;
  readonly role: PlayerRole | null;
  readonly disabled: boolean;
  // The story is frozen once votes are revealed.
  readonly locked?: boolean;
  readonly onSetStory: (story: Story) => Promise<ActionResult>;
  // Facilitator buttons shown after "Edit story" while the story can still change.
  readonly actions?: ReactNode;
}

function StoryDetails({ story }: { readonly story: Story }) {
  return (
    <p className="min-w-0">
      <StoryTitle title={story.title} url={story.url} />
    </p>
  );
}

export const StoryPanel = memo(function StoryPanel({
  story,
  role,
  disabled,
  locked = false,
  onSetStory,
  actions,
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
          <div className="flex flex-wrap items-start gap-2">
            <Button ref={editButtonRef} disabled={disabled} onClick={() => setEditing(true)}>
              Edit story
            </Button>
            {actions}
          </div>
        )}
      </>
    );
  }

  return (
    <Panel aria-labelledby={headingId}>
      <h2 id={headingId} className="type-section">
        Story
      </h2>
      {renderBody()}
    </Panel>
  );
});
StoryPanel.displayName = 'StoryPanel';
