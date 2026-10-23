import type { Server } from 'socket.io';

export interface Broadcast {
  readonly room: string;
  readonly event: string;
  readonly payload: unknown;
}

export class FakeSocket {
  readonly emitted: { event: string; payload: unknown }[] = [];
  readonly rooms: string[] = [];
  private readonly handlers = new Map<string, (...args: unknown[]) => void>();

  constructor(
    readonly id: string,
    private readonly timeline: string[],
  ) {}

  on(event: string, handler: (...args: unknown[]) => void): this {
    this.handlers.set(event, handler);
    return this;
  }

  join(room: string): void {
    this.rooms.push(room);
  }

  emit(event: string, payload: unknown): boolean {
    this.emitted.push({ event, payload });
    this.timeline.push(event);
    return true;
  }

  trigger(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.(...args);
  }

  // Sends an event and returns the ack the server answered with (undefined if none).
  send(event: string, payload: unknown): unknown {
    let result: unknown;
    this.trigger(event, payload, (ack: unknown) => {
      result = ack;
      this.timeline.push('ack');
    });
    return result;
  }

  sendJoin(payload: unknown): unknown {
    return this.send('game:join', payload);
  }
}

export class FakeIo {
  readonly broadcasts: Broadcast[] = [];
  readonly timeline: string[] = [];
  // Rooms whose sockets the server disconnected, in order.
  readonly disconnected: string[] = [];
  readonly sockets: FakeSocket[] = [];
  private onConnection: ((socket: FakeSocket) => void) | undefined;

  on(event: string, handler: (socket: FakeSocket) => void): this {
    if (event === 'connection') {
      this.onConnection = handler;
    }
    return this;
  }

  to(room: string) {
    return {
      emit: (event: string, payload: unknown): boolean => {
        this.broadcasts.push({ room, event, payload });
        this.timeline.push(`broadcast:${event}`);
        return true;
      },
    };
  }

  // Server-wide emit and disconnect, as used on shutdown.
  emit(event: string, payload: unknown): boolean {
    this.broadcasts.push({ room: '*', event, payload });
    this.timeline.push(`emit:${event}`);
    return true;
  }

  disconnectSockets(): void {
    this.disconnected.push('*');
    this.timeline.push('disconnect:*');
  }

  async fetchSockets(): Promise<unknown[]> {
    return [...this.sockets];
  }

  close(): Promise<void> {
    this.timeline.push('close');
    return Promise.resolve();
  }

  in(room: string) {
    return {
      disconnectSockets: (): void => {
        this.disconnected.push(room);
        this.timeline.push('disconnect');
      },
    };
  }

  connect(id: string): FakeSocket {
    const socket = new FakeSocket(id, this.timeline);
    this.sockets.push(socket);
    this.onConnection?.(socket);
    return socket;
  }

  asServer(): Server {
    return this as unknown as Server;
  }
}
