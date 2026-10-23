import {
  SCALE_LABELS,
  type Card,
  type PlayerRole,
  type PublicGameState,
  type RoundFinishPayload,
  type Story,
} from '@axon/shared';
import type { ActionResult } from '../../types/game.types';
import { JoinLink } from '../molecules/JoinLink';
import { PlayerRow } from '../molecules/PlayerRow';
import { ReconnectingBanner } from '../molecules/ReconnectingBanner';
import { FacilitatorOfflineBanner } from '../molecules/FacilitatorOfflineBanner';
import { FacilitatorControls } from '../molecules/FacilitatorControls';
import { RemovePlayerButton } from '../molecules/RemovePlayerButton';
import { RevealButton } from '../molecules/RevealButton';
import { CardDeck } from './CardDeck';
import { ResultsPanel } from './ResultsPanel';
import { SessionSummary } from './SessionSummary';
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
  readonly onReveal: () => Promise<ActionResult>;
  readonly onRevote: () => Promise<ActionResult>;
  readonly onFinish: (payload: RoundFinishPayload) => Promise<ActionResult>;
  readonly onRemovePlayer: (playerId: string) => Promise<ActionResult>;
}

export function GameTable({
  game,
  reconnecting,
  role,
  myCard,
  announcement,
  onSetStory,
  onCastVote,
  onReveal,
  onRevote,
  onFinish,
  onRemovePlayer,
}: GameTableProps) {
  const joinLink = `${window.location.origin}/g/${game.gameId}`;
  const voting = game.phase === 'voting';
  const revealed = game.phase === 'revealed';
  const outlierIds = new Set(game.results?.outlierIds);
  const outlierNames = game.voters
    .filter((voter) => outlierIds.has(voter.id))
    .map((voter) => voter.name);

  return (
    <>
      <h1 className="type-title">Story Estimation</h1>
      <p className="type-meta text-slate-600 dark:text-slate-400">
        Voting scale: {SCALE_LABELS[game.scale]}
      </p>
      <ReconnectingBanner visible={reconnecting} />
      <FacilitatorOfflineBanner visible={role === 'voter' && !game.facilitator.connected} />
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <StoryPanel
            story={game.story}
            role={role}
            disabled={reconnecting}
            locked={revealed}
            onSetStory={onSetStory}
          />
          {role === 'voter' && (
            <CardDeck
              scale={game.scale}
              selected={myCard}
              disabled={reconnecting || !voting}
              onCast={onCastVote}
            />
          )}
          {role === 'facilitator' && voting && (
            <RevealButton
              hasVotes={game.voters.some((voter) => voter.hasVoted)}
              disabled={reconnecting}
              onReveal={onReveal}
            />
          )}
          {role === 'facilitator' && (voting || revealed) && (
            <FacilitatorControls
              scale={game.scale}
              revealed={revealed}
              suggestedEstimate={game.results?.suggestedEstimate ?? null}
              disabled={reconnecting}
              onRevote={onRevote}
              onFinish={onFinish}
            />
          )}
          {game.results && (
            <ResultsPanel scale={game.scale} results={game.results} outlierNames={outlierNames} />
          )}
        </div>
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="facilitator-heading" className="space-y-2">
            <h2 id="facilitator-heading" className="type-section">
              Facilitator
            </h2>
            <PlayerRow name={game.facilitator.name} connected={game.facilitator.connected} />
          </section>
          <section aria-labelledby="voters-heading" className="space-y-2">
            <h2 id="voters-heading" className="type-section">
              Voters
            </h2>
            {game.voters.length === 0 ? (
              <p>{NO_VOTERS_MESSAGE}</p>
            ) : (
              <ul className="space-y-2">
                {game.voters.map((voter) => (
                  <li key={voter.id}>
                    <PlayerRow
                      name={voter.name}
                      connected={voter.connected}
                      hasVoted={voting ? voter.hasVoted : undefined}
                      revealedCard={revealed ? (voter.card ?? null) : undefined}
                      outlier={outlierIds.has(voter.id)}
                      action={
                        role === 'facilitator' ? (
                          <RemovePlayerButton
                            name={voter.name}
                            disabled={reconnecting}
                            onRemove={() => onRemovePlayer(voter.id)}
                          />
                        ) : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <SessionSummary history={game.history} total={game.total} />
          <section aria-labelledby="join-link-heading" className="space-y-2">
            <h2 id="join-link-heading" className="type-section">
              Join link
            </h2>
            <JoinLink link={joinLink} />
          </section>
        </div>
      </div>
    </>
  );
}
