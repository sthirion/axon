import { ERROR_MESSAGES } from '@axon/shared';
import { Link } from 'react-router';

export function GameNotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold sm:text-3xl">Game not found</h1>
      <p>{ERROR_MESSAGES.GAME_NOT_FOUND}</p>
      <Link to="/" className="inline-block text-slate-900 underline">
        Create a new game
      </Link>
    </>
  );
}
