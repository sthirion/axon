import {
  ERROR_MESSAGES,
  GAME_ID_PATTERN,
  type Card,
  type PlayerRole,
  type PublicGameState,
  type RoundFinishPayload,
  type StorySetPayload,
} from '@axon/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GENERIC_ERROR_MESSAGE } from '../lib/actionErrors';
import { gameExists } from '../services/gameApiService';
import { connectGameSocket } from '../services/gameSocketService';
import {
  readPlayerToken,
  removePlayerToken,
  writePlayerToken,
} from '../services/playerTokenStorage';
import { useGameStore } from '../store/gameStore';
import type { ActionResult, GameSocketClient, JoinResult } from '../types/game.types';
import { useVoteAnnouncement } from './useVoteAnnouncement';

export const LOAD_ERROR_MESSAGE = 'Could not load the game. Try again.';
export { GENERIC_ERROR_MESSAGE };

const NOT_CONNECTED: ActionResult = { ok: false, code: 'NOT_CONNECTED' };

export type GamePhase =
  'checking' | 'joining' | 'prompt' | 'joined' | 'not-found' | 'load-error' | 'join-error';

export interface JoinPromptError {
  readonly field?: string;
  readonly form?: string;
}

export interface GameSession {
  readonly phase: GamePhase;
  readonly game: PublicGameState | null;
  readonly reconnecting: boolean;
  readonly role: PlayerRole | null;
  readonly myCard: Card | null;
  readonly announcement: string;
  readonly submitting: boolean;
  readonly promptError: JoinPromptError | null;
  readonly errorMessage: string;
  readonly submitName: (name: string) => void;
  readonly retry: () => void;
  readonly setStory: (story: StorySetPayload) => Promise<ActionResult>;
  readonly castVote: (card: Card | null) => Promise<ActionResult>;
  readonly revealRound: () => Promise<ActionResult>;
  readonly revoteRound: () => Promise<ActionResult>;
  readonly finishRound: (payload: RoundFinishPayload) => Promise<ActionResult>;
}

export function useGameSession(gameId: string): GameSession {
  const isValidId = GAME_ID_PATTERN.test(gameId);
  const [phase, setPhase] = useState<GamePhase>(isValidId ? 'checking' : 'not-found');
  const [promptError, setPromptError] = useState<JoinPromptError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const clientRef = useRef<GameSocketClient | null>(null);
  const game = useGameStore((state) => state.game);
  const reconnecting = useGameStore((state) => state.reconnecting);
  const role = useGameStore((state) => state.role);
  const myCard = useGameStore((state) => state.myCard);
  const announcement = useVoteAnnouncement();

  const closeClient = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
    useGameStore.getState().reset();
  }, []);

  const handleFailure = useCallback(
    (code: string, byName: boolean) => {
      switch (code) {
        case 'GAME_NOT_FOUND':
          closeClient();
          setPhase('not-found');
          return;
        case 'INVALID_TOKEN':
          removePlayerToken(gameId);
          useGameStore.getState().reset();
          setPromptError(null);
          setPhase('prompt');
          return;
        case 'INVALID_NAME':
        case 'NAME_TAKEN':
          setPromptError({ field: ERROR_MESSAGES[code] });
          setPhase('prompt');
          return;
        default:
          if (byName) {
            setPromptError({ form: GENERIC_ERROR_MESSAGE });
            setPhase('prompt');
          } else {
            closeClient();
            setPhase('join-error');
          }
      }
    },
    [closeClient, gameId],
  );

  const ensureClient = useCallback((): GameSocketClient => {
    clientRef.current ??= connectGameSocket({
      onJoined: (joined) => {
        if (joined.token) writePlayerToken(gameId, joined.token);
        useGameStore.getState().applyJoined(joined);
      },
      onState: (state) => useGameStore.getState().applyState(state),
      onVoteMine: (card) => useGameStore.getState().applyVoteMine(card),
      onDisconnect: () => useGameStore.getState().setReconnecting(true),
      onRejoinFailed: (code) => handleFailure(code, false),
    });
    return clientRef.current;
  }, [gameId, handleFailure]);

  const settle = useCallback(
    (result: JoinResult, byName: boolean) => {
      if (!clientRef.current) return;
      if (result.ok) setPhase('joined');
      else handleFailure(result.code, byName);
    },
    [handleFailure],
  );

  const startJoin = useCallback(() => {
    const token = readPlayerToken(gameId);
    if (!token) {
      setPhase('prompt');
      return;
    }
    setPhase('joining');
    void ensureClient()
      .join({ gameId, token })
      .then((result) => settle(result, false));
  }, [ensureClient, gameId, settle]);

  useEffect(() => {
    if (!isValidId) return;
    const controller = new AbortController();
    gameExists(gameId, controller.signal).then(
      (exists) => {
        if (controller.signal.aborted) return;
        if (exists) startJoin();
        else setPhase('not-found');
      },
      () => {
        if (!controller.signal.aborted) setPhase('load-error');
      },
    );
    return () => {
      controller.abort();
      closeClient();
    };
  }, [attempt, closeClient, gameId, isValidId, startJoin]);

  const submitName = useCallback(
    (name: string) => {
      setSubmitting(true);
      setPromptError(null);
      void ensureClient()
        .join({ gameId, name })
        .then((result) => {
          setSubmitting(false);
          settle(result, true);
        });
    },
    [ensureClient, gameId, settle],
  );

  const retry = useCallback(() => {
    setPromptError(null);
    setPhase('checking');
    setAttempt((value) => value + 1);
  }, []);

  const setStory = useCallback(
    (story: StorySetPayload) =>
      clientRef.current?.setStory(story) ?? Promise.resolve(NOT_CONNECTED),
    [],
  );

  const castVote = useCallback(
    (card: Card | null) => clientRef.current?.castVote(card) ?? Promise.resolve(NOT_CONNECTED),
    [],
  );

  const revealRound = useCallback(
    () => clientRef.current?.revealRound() ?? Promise.resolve(NOT_CONNECTED),
    [],
  );

  const revoteRound = useCallback(
    () => clientRef.current?.revoteRound() ?? Promise.resolve(NOT_CONNECTED),
    [],
  );

  const finishRound = useCallback(
    (payload: RoundFinishPayload) =>
      clientRef.current?.finishRound(payload) ?? Promise.resolve(NOT_CONNECTED),
    [],
  );

  return {
    phase,
    game,
    reconnecting,
    role,
    myCard,
    announcement,
    submitting,
    promptError,
    errorMessage: phase === 'load-error' ? LOAD_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE,
    submitName,
    retry,
    setStory,
    castVote,
    revealRound,
    revoteRound,
    finishRound,
  };
}
