import type { PublicGameState } from '@axon/shared';
import type { Socket } from 'socket.io-client';

type Listener = (...args: unknown[]) => void;
type AckCallback = (ack: unknown) => void;

interface EmittedEvent {
  readonly event: string;
  readonly payload: unknown;
  readonly ack?: AckCallback;
}

// Minimal in-memory stand-in for a socket.io-client Socket; tests play the server's part.
export class FakeSocket {
  readonly emitted: EmittedEvent[] = [];
  closed = false;
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, payload: unknown, ack?: AckCallback): this {
    this.emitted.push({ event, payload, ack });
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }

  disconnect(): this {
    this.closed = true;
    return this;
  }

  serverEmit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  joins(): EmittedEvent[] {
    return this.emitted.filter((entry) => entry.event === 'game:join');
  }

  ackJoin(ack: unknown, index = this.joins().length - 1): void {
    this.joins()[index]?.ack?.(ack);
  }

  asSocket(): Socket {
    return this as unknown as Socket;
  }
}

export const GAME_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
export const TOKEN = 'T'.repeat(43);
export const OK_ACK = { ok: true } as const;

export function failAck(code: string) {
  return { ok: false, code, message: 'ignored' } as const;
}

export function gameState(overrides: Record<string, unknown> = {}): PublicGameState {
  const state = {
    gameId: GAME_ID,
    phase: 'waiting',
    story: null,
    facilitator: { name: 'Sven', connected: true },
    voters: [] as object[],
    history: [] as object[],
    scale: 'fibonacci',
    total: 0,
    ...overrides,
  };
  // Voters default to not voted so existing fixtures only list what they care about.
  return {
    ...state,
    voters: state.voters.map((voter) => ({ hasVoted: false, ...voter })),
  } as PublicGameState;
}
