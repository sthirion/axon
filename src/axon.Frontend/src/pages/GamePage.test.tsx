import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateGamePage } from './CreateGamePage';
import { GamePage } from './GamePage';
import { clearPlayerTokenMemory } from '../services/playerTokenStorage';
import { useGameStore } from '../store/gameStore';
import { FakeSocket, GAME_ID, OK_ACK, TOKEN, failAck, gameState } from '../test/fakeSocket';

const mocks = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: mocks.io }));

const OTHER_GAME_ID = 'BBBBBBBBBBBBBBBBBBBBBB';
const TOKEN_KEY = `axon.playerToken.${GAME_ID}`;
const OTHER_TOKEN_KEY = `axon.playerToken.${OTHER_GAME_ID}`;
const VOTER_JOINED = { playerId: 'p1', role: 'voter', token: TOKEN };

let socket: FakeSocket;

function stubExists(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function exists(value: boolean) {
  return stubExists(() => new Response(JSON.stringify({ exists: value }), { status: 200 }));
}

function renderGame(path = `/g/${GAME_ID}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/g/:gameId" element={<GamePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const { pathname, search, hash, state } = useLocation();
  return (
    <output data-testid="location">{JSON.stringify({ pathname, search, hash, state })}</output>
  );
}

function GoToOtherGame() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(`/g/${OTHER_GAME_ID}`)}>
      Other game
    </button>
  );
}

function renderGameWithNavigation() {
  return render(
    <MemoryRouter initialEntries={[`/g/${GAME_ID}`]}>
      <GoToOtherGame />
      <Routes>
        <Route path="/g/:gameId" element={<GamePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Exists checks that stay pending until the test settles them per game id.
function deferExists() {
  const settlers = new Map<string, (value: boolean) => void>();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      const gameId = url.split('/')[3] ?? '';
      return new Promise<Response>((resolve) => {
        settlers.set(gameId, (value) =>
          resolve(new Response(JSON.stringify({ exists: value }), { status: 200 })),
        );
      });
    }),
  );
  return async (gameId: string, value: boolean) => {
    await waitFor(() => expect(settlers.has(gameId)).toBe(true));
    await act(async () => {
      settlers.get(gameId)?.(value);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
}

async function serverAck(ack: unknown) {
  await act(async () => {
    socket.ackJoin(ack);
  });
}

async function serverEmit(event: string, ...args: unknown[]) {
  await act(async () => {
    socket.serverEmit(event, ...args);
  });
}

async function waitForJoin(count = 1) {
  await waitFor(() => expect(socket.joins()).toHaveLength(count));
}

async function submitName(name: string) {
  const input = await screen.findByLabelText('Your name');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Join' }));
}

describe('GamePage', () => {
  beforeEach(() => {
    socket = new FakeSocket();
    mocks.io.mockReset();
    mocks.io.mockReturnValue(socket.asSocket());
    window.localStorage.clear();
    useGameStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('game not found', () => {
    it('shows the not-found view for a malformed id without calling the API', () => {
      const fetchMock = exists(true);

      renderGame('/g/abc123');

      expect(
        screen.getByRole('heading', { level: 1, name: 'Session not found' }),
      ).toBeInTheDocument();
      expect(screen.getByText('This session does not exist or has ended.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Create a new session' })).toHaveAttribute(
        'href',
        '/',
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.io).not.toHaveBeenCalled();
    });

    it('shows the not-found view when the game does not exist', async () => {
      exists(false);

      renderGame();

      expect(await screen.findByRole('heading', { name: 'Session not found' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Create a new session' })).toHaveAttribute(
        'href',
        '/',
      );
      expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    });

    it('shows the not-found view when joining acks GAME_NOT_FOUND after exists was true', async () => {
      exists(true);
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      renderGame();
      await waitForJoin();

      await serverAck(failAck('GAME_NOT_FOUND'));

      expect(await screen.findByRole('heading', { name: 'Session not found' })).toBeInTheDocument();
      expect(socket.closed).toBe(true);
    });
  });

  describe('loading and load errors', () => {
    it('shows "Loading session…" as a status while the exists check is pending', () => {
      stubExists(() => new Promise<Response>(() => {}));

      renderGame();

      expect(screen.getByRole('status')).toHaveTextContent('Loading session…');
    });

    it('shows "Loading session…" while the first token join is pending', async () => {
      exists(true);
      window.localStorage.setItem(TOKEN_KEY, TOKEN);

      renderGame();
      await waitForJoin();

      expect(screen.getByRole('status')).toHaveTextContent('Loading session…');
    });

    it('shows an error with Retry, not the not-found view, when the exists check returns 5xx', async () => {
      stubExists(() => new Response('{}', { status: 500 }));

      renderGame();

      expect(await screen.findByText('Could not load the session. Try again.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Session not found' })).not.toBeInTheDocument();
    });

    it('shows the load error when the exists check fails on the network', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      renderGame();

      expect(await screen.findByText('Could not load the session. Try again.')).toBeInTheDocument();
    });

    it('checks again when Retry is pressed and continues to the join prompt', async () => {
      const fetchMock = stubExists(() => new Response('{}', { status: 500 }));
      renderGame();
      const retry = await screen.findByRole('button', { name: 'Retry' });
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ exists: true }), { status: 200 })),
      );
      fireEvent.click(retry);

      expect(screen.getByRole('status')).toHaveTextContent('Loading session…');
      expect(await screen.findByRole('heading', { name: 'Join session' })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('join prompt', () => {
    it('asks for a name and sends no game:join before one is submitted', async () => {
      exists(true);

      renderGame();

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Join session' }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Your name')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
      expect(socket.joins()).toHaveLength(0);
      expect(mocks.io).not.toHaveBeenCalled();
    });

    it('does not ask for an email or a password', async () => {
      exists(true);

      const { container } = renderGame();
      await screen.findByLabelText('Your name');

      expect(container.querySelector('input[type=email], input[type=password]')).toBeNull();
    });

    it('does not send an invalid name', async () => {
      exists(true);
      renderGame();

      await submitName('   ');

      expect(screen.getByText('Enter a name of 1 to 30 characters.')).toBeInTheDocument();
      expect(socket.joins()).toHaveLength(0);
    });

    it('joins with the trimmed name, stores the token and shows the table', async () => {
      exists(true);
      renderGame();

      await submitName('  Anna  ');
      await waitForJoin();
      expect(socket.joins()[0]?.payload).toEqual({ gameId: GAME_ID, name: 'Anna' });
      expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
      await serverAck(OK_ACK);
      await serverEmit('game:joined', VOTER_JOINED);
      await serverEmit(
        'game:state',
        gameState({ voters: [{ id: 'p1', name: 'Anna', connected: true }] }),
      );

      expect(await screen.findByRole('region', { name: 'Voters' })).toHaveTextContent('Anna');
      expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
      expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    });

    it('shows INVALID_NAME from the server and stays usable', async () => {
      exists(true);
      renderGame();
      await submitName('Anna');
      await waitForJoin();

      await serverAck(failAck('INVALID_NAME'));

      const input = await screen.findByLabelText('Your name');
      expect(screen.getByText('Enter a name of 1 to 30 characters.')).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
    });

    it('shows NAME_TAKEN, keeps the value and lets the visitor retry', async () => {
      exists(true);
      renderGame();
      await submitName('anna');
      await waitForJoin();

      await serverAck(failAck('NAME_TAKEN'));

      const input = await screen.findByLabelText('Your name');
      expect(
        screen.getByText('That name is already taken in this session. Choose another.'),
      ).toBeInTheDocument();
      expect(input).toHaveValue('anna');
      expect(input).toHaveFocus();

      fireEvent.change(input, { target: { value: 'Anna B' } });
      fireEvent.click(screen.getByRole('button', { name: 'Join' }));
      await waitForJoin(2);
      expect(socket.joins()[1]?.payload).toEqual({ gameId: GAME_ID, name: 'Anna B' });
      await serverAck(OK_ACK);
      await serverEmit('game:joined', VOTER_JOINED);
      await serverEmit(
        'game:state',
        gameState({ voters: [{ id: 'p1', name: 'Anna B', connected: true }] }),
      );

      expect(await screen.findByText('Anna B')).toBeInTheDocument();
    });

    it('shows a generic message for an unknown ack code and keeps the prompt', async () => {
      exists(true);
      renderGame();
      await submitName('Anna');
      await waitForJoin();

      await serverAck(failAck('SOMETHING_NEW'));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Something went wrong. Try again.',
      );
      expect(screen.getByLabelText('Your name')).toHaveValue('Anna');
    });

    it('shows the not-found view when the name join acks GAME_NOT_FOUND', async () => {
      exists(true);
      renderGame();
      await submitName('Anna');
      await waitForJoin();

      await serverAck(failAck('GAME_NOT_FOUND'));

      expect(await screen.findByRole('heading', { name: 'Session not found' })).toBeInTheDocument();
    });
  });

  describe('stored token', () => {
    beforeEach(() => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
    });

    it('joins with the token and no name, without asking for a name', async () => {
      exists(true);
      renderGame();

      await waitForJoin();

      expect(socket.joins()[0]?.payload).toEqual({ gameId: GAME_ID, token: TOKEN });
      expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    });

    it('restores the seat from game:state and keeps the stored token when game:joined has none', async () => {
      exists(true);
      renderGame();
      await waitForJoin();

      await serverAck(OK_ACK);
      await serverEmit('game:joined', { playerId: 'p1', role: 'voter' });
      await serverEmit(
        'game:state',
        gameState({ voters: [{ id: 'p1', name: 'Anna', connected: true }] }),
      );

      expect(await screen.findByRole('region', { name: 'Voters' })).toHaveTextContent('Anna');
      expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
    });

    it('removes a rejected token and shows the join prompt', async () => {
      exists(true);
      renderGame();
      await waitForJoin();

      await serverAck(failAck('INVALID_TOKEN'));

      expect(await screen.findByRole('heading', { name: 'Join session' })).toBeInTheDocument();
      expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('joins by name on the same connection after the token was rejected', async () => {
      exists(true);
      renderGame();
      await waitForJoin();
      await serverAck(failAck('INVALID_TOKEN'));

      await submitName('Anna');
      await waitForJoin(2);

      expect(socket.joins()[1]?.payload).toEqual({ gameId: GAME_ID, name: 'Anna' });
      expect(mocks.io).toHaveBeenCalledTimes(1);
    });

    it('shows an error with Retry for an unknown ack code on the token join', async () => {
      exists(true);
      renderGame();
      await waitForJoin();

      await serverAck(failAck('SOMETHING_NEW'));

      expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  describe('storage unavailable', () => {
    it('joins and shows the table without an error, then asks for the name again after a reload', async () => {
      exists(true);
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });
      const first = renderGame();

      await submitName('Anna');
      await waitForJoin();
      await serverAck(OK_ACK);
      await serverEmit('game:joined', VOTER_JOINED);
      await serverEmit(
        'game:state',
        gameState({ voters: [{ id: 'p1', name: 'Anna', connected: true }] }),
      );

      expect(await screen.findByRole('region', { name: 'Voters' })).toHaveTextContent('Anna');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      first.unmount();
      clearPlayerTokenMemory();
      renderGame();

      expect(await screen.findByRole('heading', { name: 'Join session' })).toBeInTheDocument();
    });

    it('opens the table as facilitator in the same tab after create, and asks for a name after a reload', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementation((_url: string, init?: RequestInit) =>
            Promise.resolve(
              init?.method === 'POST'
                ? new Response(JSON.stringify({ gameId: GAME_ID, token: TOKEN }), { status: 201 })
                : new Response(JSON.stringify({ exists: true }), { status: 200 }),
            ),
          ),
      );
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });
      const first = render(
        <MemoryRouter initialEntries={['/']}>
          <LocationProbe />
          <Routes>
            <Route path="/" element={<CreateGamePage />} />
            <Route path="/g/:gameId" element={<GamePage />} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sven' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create session' }));
      await waitForJoin();

      expect(socket.joins()[0]?.payload).toEqual({ gameId: GAME_ID, token: TOKEN });
      expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
      await serverAck(OK_ACK);
      await serverEmit('game:joined', { playerId: 'p0', role: 'facilitator' });
      await serverEmit('game:state', gameState());

      expect(await screen.findByRole('heading', { name: 'Story Estimation' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Facilitator' })).toHaveTextContent('Sven');
      expect(screen.getByTestId('location')).toHaveTextContent(
        JSON.stringify({ pathname: `/g/${GAME_ID}`, search: '', hash: '', state: null }),
      );

      first.unmount();
      clearPlayerTokenMemory();
      renderGame();

      expect(await screen.findByRole('heading', { name: 'Join session' })).toBeInTheDocument();
    });

    it('still rejoins on reconnect using the token kept in memory', async () => {
      exists(true);
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });
      renderGame();
      await submitName('Anna');
      await waitForJoin();
      await serverAck(OK_ACK);
      await serverEmit('game:joined', VOTER_JOINED);

      await serverEmit('connect');

      expect(socket.joins()[1]?.payload).toEqual({ gameId: GAME_ID, token: TOKEN });
    });
  });

  describe('stale async results', () => {
    it('creates no socket when the exists check completes after unmount', async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      const settleExists = deferExists();
      const view = renderGame();
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      view.unmount();
      await settleExists(GAME_ID, true);

      expect(mocks.io).not.toHaveBeenCalled();
      expect(socket.joins()).toHaveLength(0);
    });

    it('ignores a late exists check of the previous game after a route change', async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      const settleExists = deferExists();
      renderGameWithNavigation();
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: 'Other game' }));
      await settleExists(OTHER_GAME_ID, true);
      expect(await screen.findByRole('heading', { name: 'Join session' })).toBeInTheDocument();
      await settleExists(GAME_ID, true);

      expect(mocks.io).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Join session' })).toBeInTheDocument();
    });

    it('leaves the stored token and store alone when a join ack arrives after unmount', async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      exists(true);
      const view = renderGame();
      await waitForJoin();

      view.unmount();
      useGameStore.getState().applyState(gameState());
      await serverAck(failAck('INVALID_TOKEN'));

      expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
      expect(useGameStore.getState().game).not.toBeNull();
    });

    it('keeps the newer game when an older game acks late after a route change', async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      window.localStorage.setItem(OTHER_TOKEN_KEY, TOKEN);
      exists(true);
      const otherSocket = new FakeSocket();
      mocks.io.mockReturnValueOnce(socket.asSocket()).mockReturnValueOnce(otherSocket.asSocket());
      renderGameWithNavigation();
      await waitForJoin();

      fireEvent.click(screen.getByRole('button', { name: 'Other game' }));
      await waitFor(() => expect(otherSocket.joins()).toHaveLength(1));
      await act(async () => {
        otherSocket.ackJoin(OK_ACK);
        otherSocket.serverEmit('game:joined', { playerId: 'p2', role: 'voter' });
        otherSocket.serverEmit(
          'game:state',
          gameState({
            gameId: OTHER_GAME_ID,
            voters: [{ id: 'p2', name: 'Bob', connected: true }],
          }),
        );
      });
      expect(await screen.findByRole('region', { name: 'Voters' })).toHaveTextContent('Bob');

      await serverAck(failAck('INVALID_TOKEN'));

      expect(screen.getByRole('region', { name: 'Voters' })).toHaveTextContent('Bob');
      expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
      expect(window.localStorage.getItem(OTHER_TOKEN_KEY)).toBe(TOKEN);
      expect(otherSocket.closed).toBe(false);
    });

    it('opens a fresh connection after Retry from a join error', async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      exists(true);
      const retrySocket = new FakeSocket();
      mocks.io.mockReturnValueOnce(socket.asSocket()).mockReturnValueOnce(retrySocket.asSocket());
      renderGame();
      await waitForJoin();
      await serverAck(failAck('SOMETHING_NEW'));

      fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(retrySocket.joins()).toHaveLength(1));
      await act(async () => {
        retrySocket.ackJoin(OK_ACK);
        retrySocket.serverEmit('game:joined', { playerId: 'p1', role: 'voter' });
        retrySocket.serverEmit(
          'game:state',
          gameState({ voters: [{ id: 'p1', name: 'Anna', connected: true }] }),
        );
      });

      expect(await screen.findByRole('region', { name: 'Voters' })).toHaveTextContent('Anna');
      expect(socket.closed).toBe(true);
      expect(retrySocket.closed).toBe(false);
    });
  });

  describe('live table', () => {
    async function joinWithToken() {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      exists(true);
      renderGame();
      await waitForJoin();
      await serverAck(OK_ACK);
      await serverEmit('game:joined', { playerId: 'p1', role: 'voter' });
      await serverEmit(
        'game:state',
        gameState({ voters: [{ id: 'p1', name: 'Anna', connected: true }] }),
      );
      await screen.findByRole('region', { name: 'Voters' });
    }

    it('shows the loading status until the first game:state arrives', async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      exists(true);
      renderGame();
      await waitForJoin();

      await serverAck(OK_ACK);

      expect(screen.getByRole('status')).toHaveTextContent('Loading session…');
    });

    it('updates the table from every game:state', async () => {
      await joinWithToken();

      await serverEmit(
        'game:state',
        gameState({
          voters: [
            { id: 'p1', name: 'Anna', connected: false },
            { id: 'p2', name: 'Bob', connected: true },
          ],
        }),
      );

      expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Annaoffline',
        'Bobonline',
      ]);
    });

    it('ignores a game:state that fails validation', async () => {
      await joinWithToken();

      await serverEmit('game:state', { gameId: GAME_ID });

      expect(screen.getByText('Anna')).toBeInTheDocument();
    });

    it('shows Reconnecting… on disconnect, rejoins with the token on reconnect and hides it on the next game:state', async () => {
      await joinWithToken();

      await serverEmit('disconnect', 'transport close');

      expect(screen.getByText('Reconnecting…')).toBeVisible();
      expect(screen.getByText('Anna')).toBeVisible();

      await serverEmit('connect');
      expect(socket.joins()[1]?.payload).toEqual({ gameId: GAME_ID, token: TOKEN });
      expect(screen.getByText('Reconnecting…')).toBeVisible();

      await serverAck(OK_ACK);
      await serverEmit(
        'game:state',
        gameState({ voters: [{ id: 'p1', name: 'Anna', connected: true }] }),
      );

      expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
    });

    it('shows the not-found view when the rejoin acks GAME_NOT_FOUND', async () => {
      await joinWithToken();
      await serverEmit('disconnect', 'transport close');
      await serverEmit('connect');

      await serverAck(failAck('GAME_NOT_FOUND'));

      expect(await screen.findByRole('heading', { name: 'Session not found' })).toBeInTheDocument();
    });

    it('drops the table and shows the join prompt when the rejoin acks INVALID_TOKEN', async () => {
      await joinWithToken();
      await serverEmit('disconnect', 'transport close');
      await serverEmit('connect');

      await serverAck(failAck('INVALID_TOKEN'));

      expect(await screen.findByRole('heading', { name: 'Join session' })).toBeInTheDocument();
      expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(screen.queryByRole('region', { name: 'Voters' })).not.toBeInTheDocument();
    });

    it('closes the socket and clears the store when the page unmounts', async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      exists(true);
      const view = renderGame();
      await waitForJoin();
      await serverAck(OK_ACK);
      await serverEmit('game:state', gameState());

      view.unmount();

      expect(socket.closed).toBe(true);
      expect(useGameStore.getState().game).toBeNull();
    });
  });

  describe('story and voting', () => {
    const ANNA = { id: 'p1', name: 'Anna', connected: true, hasVoted: false };
    const BOB = { id: 'p2', name: 'Bob', connected: true, hasVoted: false };
    const VOTING = { phase: 'voting', story: { title: 'Login page' } };

    async function joinAs(role: 'facilitator' | 'voter', state = gameState()) {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      exists(true);
      renderGame();
      await waitForJoin();
      await serverAck(OK_ACK);
      await serverEmit('game:joined', { playerId: 'p1', role });
      if (role === 'voter') await serverEmit('vote:mine', { card: null });
      await serverEmit('game:state', state);
      await screen.findByRole('region', { name: 'Voters' });
    }

    function lastRequest(event: string) {
      return socket.emitted.filter((entry) => entry.event === event).at(-1);
    }

    it('shows the facilitator the story form, sends story:set and lets the server open voting', async () => {
      const user = userEvent.setup();
      await joinAs('facilitator');
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

      await user.type(screen.getByLabelText('Title'), 'Login page');
      await user.type(screen.getByLabelText('Link'), 'https://example.com/1');
      await user.click(screen.getByRole('button', { name: 'Start voting' }));

      expect(lastRequest('story:set')?.payload).toEqual({
        title: 'Login page',
        url: 'https://example.com/1',
      });
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
      await act(async () => lastRequest('story:set')?.ack?.(OK_ACK));
      await serverEmit('game:state', gameState({ ...VOTING, voters: [ANNA] }));

      expect(screen.getByText('Login page')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Edit story' })).toBeEnabled();
    });

    it('shows a voter the waiting message with a disabled deck, then the story', async () => {
      await joinAs('voter', gameState({ voters: [ANNA] }));

      expect(screen.getByText('Waiting for the facilitator to set the story.')).toBeVisible();
      expect(
        screen.getAllByRole('radio').every((card) => (card as HTMLInputElement).disabled),
      ).toBe(true);

      await serverEmit('game:state', gameState({ ...VOTING, voters: [ANNA] }));

      expect(screen.getByText('Login page')).toBeVisible();
      expect(screen.getByRole('radio', { name: '5' })).toBeEnabled();
    });

    it('selects a card only after the server confirms it with vote:mine', async () => {
      const user = userEvent.setup();
      await joinAs('voter', gameState({ ...VOTING, voters: [ANNA] }));

      await user.click(screen.getByRole('radio', { name: '5' }));

      expect(lastRequest('vote:cast')?.payload).toEqual({ card: 5 });
      expect(screen.getByRole('radio', { name: '5' })).not.toBeChecked();
      await act(async () => lastRequest('vote:cast')?.ack?.(OK_ACK));
      await serverEmit('vote:mine', { card: 5 });
      await serverEmit(
        'game:state',
        gameState({ ...VOTING, voters: [{ ...ANNA, hasVoted: true }] }),
      );

      expect(screen.getByRole('radio', { name: '5' })).toBeChecked();
      expect(screen.getByText('Voted', { exact: false })).toBeVisible();
    });

    it('keeps the previous card and shows the error when the vote is rejected', async () => {
      const user = userEvent.setup();
      await joinAs('voter', gameState({ ...VOTING, voters: [ANNA] }));
      await serverEmit('vote:mine', { card: 3 });

      await user.click(screen.getByRole('radio', { name: '8' }));
      await act(async () => lastRequest('vote:cast')?.ack?.(failAck('WRONG_PHASE')));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'That action is not available right now.',
      );
      expect(screen.getByRole('radio', { name: '3' })).toBeChecked();
    });

    it('re-enables the deck with a generic message when no ack arrives within 5 seconds', async () => {
      await joinAs('voter', gameState({ ...VOTING, voters: [ANNA] }));
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        fireEvent.click(screen.getByRole('radio', { name: '8' }));

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });

        expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
        expect(screen.getByRole('radio', { name: '8' })).toBeEnabled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('restores the checked card after a reconnect from the vote:mine that follows the rejoin', async () => {
      await joinAs('voter', gameState({ ...VOTING, voters: [ANNA] }));
      await serverEmit('vote:mine', { card: 8 });
      await serverEmit('disconnect', 'transport close');
      await serverEmit('connect');
      await serverAck(OK_ACK);

      await serverEmit('game:joined', { playerId: 'p1', role: 'voter' });
      await serverEmit('vote:mine', { card: 13 });
      await serverEmit('game:state', gameState({ ...VOTING, voters: [ANNA] }));

      expect(screen.getByRole('radio', { name: '13' })).toBeChecked();
    });

    it('ignores a vote:mine that fails validation', async () => {
      await joinAs('voter', gameState({ ...VOTING, voters: [ANNA] }));
      await serverEmit('vote:mine', { card: 8 });

      await serverEmit('vote:mine', { card: 11 });

      expect(screen.getByRole('radio', { name: '8' })).toBeChecked();
    });

    it('announces another voter voting but not the first snapshot or connection changes', async () => {
      await joinAs('voter', gameState({ ...VOTING, voters: [ANNA, { ...BOB, hasVoted: true }] }));
      const region = () => document.querySelector('[aria-atomic="true"]');
      expect(region()).toHaveTextContent('');

      await serverEmit('game:state', gameState({ ...VOTING, voters: [ANNA, BOB] }));
      expect(region()).toHaveTextContent('Bob withdrew their vote');

      await serverEmit(
        'game:state',
        gameState({ ...VOTING, voters: [ANNA, { ...BOB, connected: false }] }),
      );
      expect(region()).toHaveTextContent('');
    });

    it('does not announce a vote change that is part of the snapshot after a rejoin', async () => {
      await joinAs('voter', gameState({ ...VOTING, voters: [ANNA, BOB] }));
      await serverEmit('disconnect', 'transport close');
      await serverEmit('connect');
      await serverAck(OK_ACK);

      await serverEmit(
        'game:state',
        gameState({ ...VOTING, voters: [ANNA, { ...BOB, hasVoted: true }] }),
      );

      expect(document.querySelector('[aria-atomic="true"]')).toHaveTextContent('');
    });
  });

  describe('removed from the game', () => {
    const joinAsVoter = async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      exists(true);
      renderGame();
      await waitForJoin();
      await serverAck(OK_ACK);
      await serverEmit('game:joined', { playerId: 'p1', role: 'voter' });
      await serverEmit(
        'game:state',
        gameState({ voters: [{ id: 'p1', name: 'Anna', connected: true }] }),
      );
      await screen.findByRole('region', { name: 'Voters' });
    };

    it('shows the removed page without a deck or a join form when the server sends player:removed', async () => {
      await joinAsVoter();

      await serverEmit('player:removed');

      expect(await screen.findByRole('heading', { level: 1, name: 'Removed' })).toBeVisible();
      expect(screen.getByText('You were removed from this session.')).toBeVisible();
      expect(screen.queryByRole('radiogroup')).toBeNull();
      expect(screen.queryByLabelText('Your name')).toBeNull();
      expect(screen.queryByRole('region', { name: 'Voters' })).toBeNull();
    });

    it('closes the socket and keeps the stored token so a reload shows the page again', async () => {
      await joinAsVoter();

      await serverEmit('player:removed');

      expect(socket.closed).toBe(true);
      expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
      expect(useGameStore.getState().game).toBeNull();
    });

    it('shows the removed page when joining with a removed token is rejected with REMOVED', async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      exists(true);
      renderGame();
      await waitForJoin();

      await serverAck(failAck('REMOVED'));

      expect(await screen.findByText('You were removed from this session.')).toBeVisible();
      expect(screen.queryByLabelText('Your name')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
    });
  });

  describe('game ended', () => {
    const joinAsVoter = async () => {
      window.localStorage.setItem(TOKEN_KEY, TOKEN);
      exists(true);
      renderGame();
      await waitForJoin();
      await serverAck(OK_ACK);
      await serverEmit('game:joined', { playerId: 'p1', role: 'voter' });
      await serverEmit(
        'game:state',
        gameState({ voters: [{ id: 'p1', name: 'Anna', connected: true }] }),
      );
      await screen.findByRole('region', { name: 'Voters' });
    };

    it.each([
      ['server-restart', 'The session ended because the server restarted.'],
      ['expired', 'The session ended because it reached its 2-hour limit.'],
    ])('shows "Session ended" with the %s message', async (reason, message) => {
      await joinAsVoter();

      await serverEmit('game:ended', { reason });

      expect(await screen.findByRole('heading', { level: 1, name: 'Session ended' })).toBeVisible();
      expect(screen.getByText(message)).toBeVisible();
      expect(screen.getByRole('link', { name: 'Create a new session' })).toHaveAttribute(
        'href',
        '/',
      );
      expect(screen.queryByRole('region', { name: 'Voters' })).toBeNull();
      expect(screen.queryByRole('radiogroup')).toBeNull();
    });

    it('falls back to the restart message for a reason it does not know', async () => {
      await joinAsVoter();

      await serverEmit('game:ended', { reason: 'from-the-future' });

      expect(
        await screen.findByText('The session ended because the server restarted.'),
      ).toBeVisible();
    });

    it('closes the socket, clears the game and shows the temporary-games footer', async () => {
      await joinAsVoter();

      await serverEmit('game:ended', { reason: 'server-restart' });

      expect(socket.closed).toBe(true);
      expect(useGameStore.getState().game).toBeNull();
      expect(screen.getByRole('contentinfo')).toHaveTextContent('Sessions are temporary.');
    });
  });
});
