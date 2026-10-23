import { describe, expect, it } from 'vitest';
import { actionErrorMessage, GENERIC_ERROR_MESSAGE } from './actionErrors';

describe('actionErrorMessage', () => {
  it.each([
    ['INVALID_STORY', 'Enter a title of 1 to 200 characters and an optional http or https link.'],
    ['INVALID_CARD', 'That card is not in the deck.'],
    ['FORBIDDEN', 'You are not allowed to do that.'],
    ['WRONG_PHASE', 'That action is not available right now.'],
  ])('shows the fixed text for %s', (code, message) => {
    expect(actionErrorMessage(code)).toBe(message);
  });

  it.each(['UNKNOWN', 'TIMEOUT', 'INTERNAL', 'GAME_NOT_FOUND', ''])(
    'shows the generic message for %j',
    (code) => {
      expect(actionErrorMessage(code)).toBe('Something went wrong. Try again.');
      expect(GENERIC_ERROR_MESSAGE).toBe('Something went wrong. Try again.');
    },
  );
});
