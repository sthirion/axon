import { ERROR_MESSAGES } from '@axon/shared';
import { Link } from 'react-router';

export function GameNotFound() {
  return (
    <>
      <h1 className="type-title">Session not found</h1>
      <p>{ERROR_MESSAGES.GAME_NOT_FOUND}</p>
      <Link
        to="/"
        className="inline-block text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:text-slate-100 dark:focus-visible:outline-slate-100"
      >
        Create a new session
      </Link>
    </>
  );
}
