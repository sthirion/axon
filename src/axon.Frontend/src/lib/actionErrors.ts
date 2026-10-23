import { ERROR_MESSAGES } from '@axon/shared';

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Try again.';

const SHOWN_CODES = ['INVALID_STORY', 'INVALID_CARD', 'FORBIDDEN', 'WRONG_PHASE'] as const;

// Only codes a story, vote or reveal action can legitimately fail with get their fixed text.
export function actionErrorMessage(code: string): string {
  const known = SHOWN_CODES.find((candidate) => candidate === code);
  return known ? ERROR_MESSAGES[known] : GENERIC_ERROR_MESSAGE;
}
