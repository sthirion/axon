import { storySchema, type Story } from '@axon/shared';
import { memo, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { actionErrorMessage } from '../../lib/actionErrors';
import type { ActionResult } from '../../types/game.types';
import { Button } from '../atoms/Button';

export const TITLE_ERROR_MESSAGE = 'Enter a title of 1 to 200 characters.';
export const LINK_ERROR_MESSAGE = 'Enter a full link starting with http:// or https://.';

const INPUT_CLASS =
  'block min-h-11 w-full min-w-0 rounded-md border border-slate-500 dark:border-slate-400 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-slate-100';

interface StoryFormProps {
  readonly submitLabel: string;
  readonly initialStory?: Story;
  readonly disabled: boolean;
  readonly focusOnMount?: boolean;
  readonly onSubmit: (story: Story) => Promise<ActionResult>;
  readonly onSaved?: () => void;
  readonly onCancel?: () => void;
}

export const StoryForm = memo(function StoryForm({
  submitLabel,
  initialStory,
  disabled,
  focusOnMount = false,
  onSubmit,
  onSaved,
  onCancel,
}: StoryFormProps) {
  const id = useId();
  const titleErrorId = `${id}-title-error`;
  const linkErrorId = `${id}-link-error`;
  const titleRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialStory?.title ?? '');
  const [link, setLink] = useState(initialStory?.url ?? '');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    setServerError(null);
    const parsed = storySchema.safeParse({ title, url: link });
    if (!parsed.success) {
      const titleInvalid = parsed.error.issues.some((issue) => issue.path[0] === 'title');
      const linkInvalid = parsed.error.issues.some((issue) => issue.path[0] === 'url');
      setTitleError(titleInvalid ? TITLE_ERROR_MESSAGE : null);
      setLinkError(linkInvalid ? LINK_ERROR_MESSAGE : null);
      (titleInvalid ? titleRef : linkRef).current?.focus();
      return;
    }
    setTitleError(null);
    setLinkError(null);
    setPending(true);
    const result = await onSubmit(parsed.data);
    setPending(false);
    if (result.ok) onSaved?.();
    else setServerError(actionErrorMessage(result.code));
  }

  return (
    <form
      aria-label="Story"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="space-y-4"
    >
      <div className="space-y-1">
        <label htmlFor={`${id}-title`} className="block type-body font-medium">
          Title
        </label>
        <input
          ref={titleRef}
          id={`${id}-title`}
          type="text"
          autoComplete="off"
          aria-required="true"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError(null);
          }}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? titleErrorId : undefined}
          className={INPUT_CLASS}
        />
        {titleError && (
          <p id={titleErrorId} className="type-meta text-red-700 dark:text-red-400">
            {titleError}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-link`} className="block type-body font-medium">
          Link
        </label>
        <input
          ref={linkRef}
          id={`${id}-link`}
          type="text"
          inputMode="url"
          autoComplete="off"
          value={link}
          onChange={(event) => {
            setLink(event.target.value);
            setLinkError(null);
          }}
          aria-invalid={linkError ? true : undefined}
          aria-describedby={linkError ? linkErrorId : undefined}
          className={INPUT_CLASS}
        />
        {linkError && (
          <p id={linkErrorId} className="type-meta text-red-700 dark:text-red-400">
            {linkError}
          </p>
        )}
      </div>
      {serverError && (
        <p role="alert" className="type-meta text-red-700 dark:text-red-400">
          {serverError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={disabled || pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" onClick={onCancel} className="bg-slate-600 dark:bg-slate-400">
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
});
StoryForm.displayName = 'StoryForm';
