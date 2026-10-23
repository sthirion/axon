import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { DEFAULT_SCALE, ERROR_MESSAGES, type Scale } from '@axon/shared';
import { NameForm } from '../components/molecules/NameForm';
import { ScalePicker } from '../components/molecules/ScalePicker';
import { PageLayout } from '../components/templates/PageLayout';
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from '../lib/brand';
import { createGame } from '../services/gameApiService';
import { writePlayerToken } from '../services/playerTokenStorage';

export const CREATE_ERROR_MESSAGE = 'Could not create the session. Try again.';

export function CreateGamePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [scale, setScale] = useState<Scale>(DEFAULT_SCALE);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (name: string) => {
      setSubmitting(true);
      setFieldError(null);
      setFormError(null);
      void createGame(name, scale).then((result) => {
        if (result.ok) {
          writePlayerToken(result.gameId, result.token);
          void navigate(`/g/${result.gameId}`);
          return;
        }
        setSubmitting(false);
        if (result.reason === 'invalid-name') setFieldError(ERROR_MESSAGES.INVALID_NAME);
        else setFormError(CREATE_ERROR_MESSAGE);
      });
    },
    [navigate, scale],
  );

  return (
    <PageLayout brand={false}>
      <div className="space-y-1">
        <h1 className="type-display">{PRODUCT_NAME}</h1>
        <p className="type-body text-slate-600 dark:text-slate-400">{PRODUCT_SUBTITLE}</p>
      </div>
      <NameForm
        submitLabel="Create session"
        submitting={submitting}
        onSubmit={handleSubmit}
        fieldError={fieldError}
        formError={formError}
      >
        <ScalePicker value={scale} onChange={setScale} disabled={submitting} />
      </NameForm>
    </PageLayout>
  );
}
