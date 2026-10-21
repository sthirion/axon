import type { Request, Response } from 'express';

export interface FakeResponse {
  res: Response;
  statusCode: number | undefined;
  headers: Record<string, string>;
  body: unknown;
  sent: boolean;
  sentFile: string | undefined;
}

export function createFakeResponse(
  initialHeaders: Record<string, string> = {},
  sendFileError?: Error,
): FakeResponse {
  const fake: FakeResponse = {
    res: undefined as unknown as Response,
    statusCode: undefined,
    headers: { ...initialHeaders },
    body: undefined,
    sent: false,
    sentFile: undefined,
  };
  const res = {
    get headersSent() {
      return fake.sent;
    },
    set(name: string, value: string) {
      fake.headers[name] = value;
      return res;
    },
    status(code: number) {
      fake.statusCode = code;
      return res;
    },
    json(body: unknown) {
      fake.body = body;
      fake.sent = true;
      return res;
    },
    sendFile(file: string, callback: (err?: Error) => void) {
      fake.sentFile = file;
      callback(sendFileError);
    },
  };
  fake.res = res as unknown as Response;
  return fake;
}

export function createFakeRequest(method: string, path: string): Request {
  return { method, path } as unknown as Request;
}
