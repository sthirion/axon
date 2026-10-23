import { ERROR_MESSAGES } from '@axon/shared';
import { useParams } from 'react-router';
import { Button } from '../components/atoms/Button';
import { Panel } from '../components/atoms/Panel';
import { JoinLink } from '../components/molecules/JoinLink';
import { NameForm } from '../components/molecules/NameForm';
import { GameEnded } from '../components/organisms/GameEnded';
import { GameNotFound } from '../components/organisms/GameNotFound';
import { GameTable } from '../components/organisms/GameTable';
import { PageLayout } from '../components/templates/PageLayout';
import { useGameSession, type GameSession } from '../hooks/useGameSession';
import { PRODUCT_NAME } from '../lib/brand';

function SessionView({ session }: { readonly session: GameSession }) {
  const { phase, game } = session;

  if (phase === 'not-found') return <GameNotFound />;

  if (phase === 'ended') return <GameEnded message={session.endMessage} />;

  if (phase === 'removed') {
    return (
      <Panel as="div">
        <h1 className="type-title">Removed</h1>
        <p role="status">{ERROR_MESSAGES.REMOVED}</p>
      </Panel>
    );
  }

  if (phase === 'load-error' || phase === 'join-error') {
    return (
      <Panel as="div">
        <h1 className="type-title">{PRODUCT_NAME}</h1>
        <p role="alert">{session.errorMessage}</p>
        <Button onClick={session.retry}>Retry</Button>
      </Panel>
    );
  }

  if (phase === 'prompt') {
    return (
      <Panel as="div">
        <h1 className="type-title">Join session</h1>
        <NameForm
          submitLabel="Join"
          submitting={session.submitting}
          onSubmit={session.submitName}
          fieldError={session.promptError?.field}
          formError={session.promptError?.form}
        />
      </Panel>
    );
  }

  if (phase === 'joined' && game) {
    return (
      <GameTable
        game={game}
        reconnecting={session.reconnecting}
        role={session.role}
        myCard={session.myCard}
        announcement={session.announcement}
        onSetStory={session.setStory}
        onCastVote={session.castVote}
        onReveal={session.revealRound}
        onRevote={session.revoteRound}
        onFinish={session.finishRound}
        onRemovePlayer={session.removePlayer}
        onTransferFacilitator={session.transferFacilitator}
      />
    );
  }

  return (
    <Panel as="div">
      <h1 className="type-title">{PRODUCT_NAME}</h1>
      <p role="status">Loading session…</p>
    </Panel>
  );
}

function SessionPage({ gameId }: { readonly gameId: string }) {
  const session = useGameSession(gameId);
  // The estimation page uses the full width; every other view stays narrow.
  const wide = session.phase === 'joined' && session.game !== null;
  return (
    <PageLayout
      wide={wide}
      headerExtra={
        session.phase === 'joined' && session.game && session.role === 'facilitator' ? (
          <JoinLink
            gameId={session.game.gameId}
            link={`${window.location.origin}/g/${session.game.gameId}`}
          />
        ) : undefined
      }
    >
      <SessionView session={session} />
    </PageLayout>
  );
}

export function GamePage() {
  const { gameId = '' } = useParams();
  return <SessionPage key={gameId} gameId={gameId} />;
}
