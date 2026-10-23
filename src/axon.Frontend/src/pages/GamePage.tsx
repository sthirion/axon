import { useParams } from 'react-router';
import { Button } from '../components/atoms/Button';
import { NameForm } from '../components/molecules/NameForm';
import { GameNotFound } from '../components/organisms/GameNotFound';
import { GameTable } from '../components/organisms/GameTable';
import { PageLayout } from '../components/templates/PageLayout';
import { useGameSession } from '../hooks/useGameSession';

function GameSession({ gameId }: { readonly gameId: string }) {
  const session = useGameSession(gameId);
  const { phase, game } = session;

  if (phase === 'not-found') return <GameNotFound />;

  if (phase === 'load-error' || phase === 'join-error') {
    return (
      <>
        <h1 className="text-2xl font-semibold sm:text-3xl">Axon</h1>
        <p role="alert">{session.errorMessage}</p>
        <Button onClick={session.retry}>Retry</Button>
      </>
    );
  }

  if (phase === 'prompt') {
    return (
      <>
        <h1 className="text-2xl font-semibold sm:text-3xl">Join game</h1>
        <NameForm
          submitLabel="Join"
          submitting={session.submitting}
          onSubmit={session.submitName}
          fieldError={session.promptError?.field}
          formError={session.promptError?.form}
        />
      </>
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
      />
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold sm:text-3xl">Axon</h1>
      <p role="status">Loading game…</p>
    </>
  );
}

export function GamePage() {
  const { gameId = '' } = useParams();
  return (
    <PageLayout>
      <GameSession key={gameId} gameId={gameId} />
    </PageLayout>
  );
}
