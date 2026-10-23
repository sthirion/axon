import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateGamePage } from './CreateGamePage';
import { GAME_ID, TOKEN } from '../test/fakeSocket';

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<CreateGamePage />} />
        <Route path="/g/:gameId" element={<p>Game route</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submit(name: string) {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Create session' }));
}

function created() {
  return new Response(JSON.stringify({ gameId: GAME_ID, token: TOKEN }), { status: 201 });
}

describe('CreateGamePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the Planning Poker heading, a labelled name field and the Create session button', () => {
    renderCreate();

    expect(screen.getByRole('heading', { level: 1, name: 'Planning Poker' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create session' })).toBeEnabled();
  });

  it('asks for no email or password', () => {
    const { container } = renderCreate();

    expect(container.querySelector('input[type=email], input[type=password]')).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['31 characters', 'a'.repeat(31)],
  ])('sends no request and shows the validation error for a %s name', (_label, name) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderCreate();

    submit(name);

    const input = screen.getByLabelText('Your name');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a name of 1 to 30 characters.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
  });

  it('posts the trimmed name, stores the token and navigates to /g/<gameId>', async () => {
    const fetchMock = vi.fn().mockResolvedValue(created());
    vi.stubGlobal('fetch', fetchMock);
    renderCreate();

    submit('  Sven  ');

    expect(await screen.findByText('Game route')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({
      name: 'Sven',
      scale: 'fibonacci',
    });
    expect(window.localStorage.getItem(`axon.playerToken.${GAME_ID}`)).toBe(TOKEN);
  });

  it('disables the button while the request is in flight', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderCreate();

    submit('Sven');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create session' })).toBeDisabled(),
    );
  });

  it.each([
    ['a 500', () => Promise.resolve(new Response('{}', { status: 500 }))],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])(
    'shows the retry message, keeps the name and re-enables the button after %s',
    async (_label, respond) => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(respond));
      renderCreate();

      submit('Sven');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not create the session. Try again.',
      );
      expect(screen.getByLabelText('Your name')).toHaveValue('Sven');
      expect(screen.getByRole('button', { name: 'Create session' })).toBeEnabled();
      expect(screen.queryByText('Game route')).not.toBeInTheDocument();
    },
  );

  it('shows the name error on the field when the server answers 400 INVALID_NAME', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: 'INVALID_NAME', message: 'x' }), { status: 400 }),
        ),
    );
    renderCreate();

    submit('Sven');

    expect(await screen.findByText('Enter a name of 1 to 30 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('still navigates when localStorage throws on write', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(created()));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    renderCreate();

    submit('Sven');

    expect(await screen.findByText('Game route')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers the voting scale with Fibonacci selected, and sends the chosen scale', async () => {
    const fetchMock = vi.fn().mockResolvedValue(created());
    vi.stubGlobal('fetch', fetchMock);
    renderCreate();

    expect(screen.getByRole('radio', { name: /Fibonacci/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /T-shirt sizes/ }));
    submit('Sven');

    expect(await screen.findByText('Game route')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({
      name: 'Sven',
      scale: 'tshirt',
    });
  });

  it.each([
    ['incremental', /Incremental/],
    ['fibonacci', /Fibonacci/],
  ])('sends %s when that scale is chosen', async (scale, label) => {
    const fetchMock = vi.fn().mockResolvedValue(created());
    vi.stubGlobal('fetch', fetchMock);
    renderCreate();

    fireEvent.click(screen.getByRole('radio', { name: label }));
    submit('Sven');

    await screen.findByText('Game route');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string).scale).toBe(scale);
  });

  it('locks the scale choice while the request is in flight', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderCreate();

    submit('Sven');

    await waitFor(() => expect(screen.getByRole('radio', { name: /Incremental/ })).toBeDisabled());
  });
});
