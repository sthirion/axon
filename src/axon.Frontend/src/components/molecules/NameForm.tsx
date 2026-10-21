import { ERROR_MESSAGES, playerNameSchema } from '@axon/shared';
import { memo, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '../atoms/Button';

interface NameFormProps {
  readonly submitLabel: string;
  readonly submitting: boolean;
  readonly onSubmit: (name: string) => void;
  readonly fieldError?: string | null;
  readonly formError?: string | null;
}

export const NameForm = memo(function NameForm({
  submitLabel,
  submitting,
  onSubmit,
  fieldError,
  formError,
}: NameFormProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const error = clientError ?? fieldError ?? null;

  useEffect(() => {
    if (fieldError) inputRef.current?.focus();
  }, [fieldError]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const parsed = playerNameSchema.safeParse(value);
    if (!parsed.success) {
      setClientError(ERROR_MESSAGES.INVALID_NAME);
      inputRef.current?.focus();
      return;
    }
    setClientError(null);
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1">
        <label htmlFor={inputId} className="block text-sm font-medium">
          Your name
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          autoComplete="off"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setClientError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="block w-full min-w-0 rounded-md border border-slate-500 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        />
        {error && (
          <p id={errorId} className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      {formError && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
});
NameForm.displayName = 'NameForm';
