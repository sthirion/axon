import { Link } from 'react-router';

interface GameEndedProps {
  readonly message: string;
}

export function GameEnded({ message }: GameEndedProps) {
  return (
    <>
      <h1 className="text-2xl font-semibold sm:text-3xl">Game ended</h1>
      <p role="status">{message}</p>
      <Link
        to="/"
        className="inline-block text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:text-slate-100 dark:focus-visible:outline-slate-100"
      >
        Create a new game
      </Link>
    </>
  );
}
