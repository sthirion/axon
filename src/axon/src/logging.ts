import type { ErrorCode } from '@axon/shared';

export interface LogFields {
  // Only a gameId that passed the format check may be logged; never raw client input.
  readonly gameId?: string;
  readonly code?: ErrorCode;
}

// Names, tokens and payloads must never reach a log line, so only these fields are accepted.
export function logEvent(event: string, fields: LogFields, level: 'info' | 'warn' = 'info'): void {
  const line = JSON.stringify({ level, event, gameId: fields.gameId, code: fields.code });
  if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}
