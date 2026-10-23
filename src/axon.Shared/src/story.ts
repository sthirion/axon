import { z } from 'zod';
import { CONTROL_CHARACTER } from './game.js';

export const STORY_TITLE_MAX_LENGTH = 200;
export const STORY_URL_MAX_LENGTH = 2048;

const WHITESPACE = /\s/u;

export interface Story {
  readonly title: string;
  readonly url?: string;
}

// Whitespace and control characters are rejected before parsing: `new URL` silently strips tabs and newlines.
function isHttpLink(value: string): boolean {
  if (
    value.length > STORY_URL_MAX_LENGTH ||
    WHITESPACE.test(value) ||
    CONTROL_CHARACTER.test(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

// Trim, then NFC, then count code points (String.length counts UTF-16 units).
const storyTitleSchema = z
  .string()
  .trim()
  .normalize('NFC')
  .refine((title) => {
    const length = [...title].length;
    return length >= 1 && length <= STORY_TITLE_MAX_LENGTH;
  })
  .refine((title) => !CONTROL_CHARACTER.test(title));

// A blank link means "no link"; anything else must be an absolute http(s) URL.
const storyLinkSchema = z
  .string()
  .trim()
  .refine((link) => link === '' || isHttpLink(link));

export const storySchema = z
  .object({ title: storyTitleSchema, url: storyLinkSchema.optional() })
  .transform(({ title, url }): Story => (url ? { title, url } : { title }));

// Only a plain object passes; fields are validated later so the error code can differ.
export const storySetEnvelopeSchema = z.looseObject({});

// What a client sends.
export type StorySetPayload = Story;
