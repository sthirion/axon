import type { Card, PlayerRole, PublicGameState, Story } from '@axon/shared';
import type { ActionResult } from '../../types/game.types';
import { JoinLink } from '../molecules/JoinLink';
import { PlayerRow } from '../molecules/PlayerRow';
import { ReconnectingBanner } from '../molecules/ReconnectingBanner';
import { CardDeck } from './CardDeck';
import { StoryPanel } from './StoryPanel';

export const NO_VOTERS_MESSAGE = 'No voters yet. Share the link to invite your team.';

interface GameTableProps {
  readonly game: PublicGameState;
  readonly reconnecting: boolean;
  readonly role: PlayerRole | null;
  readonly myCard: Card | null;
  readonly announcement: string;
  readonly onSetStory: (story: Story) => Promise<ActionResult>;
  readonly onCastVote: (card: Card | null) => Promise<ActionResult>;
}

export function GameTable({
  game,
  reconnecting,
  role,
  myCard,
  announcement,
  onSetStory,
  onCastVote,
}: GameTableProps) {
  const joinLink = `${window.location.origin}/g/${game.gameId}`;
  const voting = game.phase === 'voting';

  return (
    <>
      <h1 className="text-2xl font-semibold sm:text-3xl">Game table</h1>
      <ReconnectingBanner visible={reconnecting} />
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <StoryPanel story={game.story} role={role} disabled={reconnecting} onSetStory={onSetStory} />
      {role === 'voter' && (
        <CardDeck selected={myCard} disabled={reconnecting || !voting} onCast={onCastVote} />
      )}
      <section aria-labelledby="facilitator-heading" className="space-y-2">
        <h2 id="facilitator-heading" className="text-lg font-semibold">
          Facilitator
        </h2>
        <PlayerRow name={game.facilitator.name} connected={game.facilitator.connected} />
      </section>
      <section aria-labelledby="voters-heading" className="space-y-2">
        <h2 id="voters-heading" className="text-lg font-semibold">
          Voters
        </h2>
        {game.voters.length === 0 ? (
          <p>{NO_VOTERS_MESSAGE}</p>
        ) : (
          <ul className="space-y-1">
            {game.voters.map((voter) => (
              <li key={voter.id}>
                <PlayerRow
                  name={voter.name}
                  connected={voter.connected}
                  hasVoted={voting ? voter.hasVoted : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="join-link-heading" className="space-y-2">
        <h2 id="join-link-heading" className="text-lg font-semibold">
          Join link
        </h2>
        <JoinLink link={joinLink} />
      </section>
    </>
  );
}
