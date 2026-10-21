import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { ERROR_MESSAGES } from '@axon/shared';
import { NameForm } from '../components/molecules/NameForm';
import { PageLayout } from '../components/templates/PageLayout';
import { createGame } from '../services/gameApiService';
import { writePlayerToken } from '../services/playerTokenStorage';

export const CREATE_ERROR_MESSAGE = 'Could not create the game. Try again.';

export function CreateGamePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (name: string) => {
      setSubmitting(true);
      setFieldError(null);
      setFormError(null);
      void createGame(name).then((result) => {
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
    [navigate],
  );

  return (
    <PageLayout>
      <h1 className="text-2xl font-semibold sm:text-3xl">Axon</h1>
      <NameForm
        submitLabel="Create game"
        submitting={submitting}
        onSubmit={handleSubmit}
        fieldError={fieldError}
        formError={formError}
      />
    </PageLayout>
  );
}
