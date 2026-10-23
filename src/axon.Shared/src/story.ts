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

// Trim, then NFC, then count code points (String.length counts UTF-16 units). Blank is allowed: the
// title is optional.
const storyTitleSchema = z
  .string()
  .trim()
  .normalize('NFC')
  .refine((title) => [...title].length <= STORY_TITLE_MAX_LENGTH)
  .refine((title) => !CONTROL_CHARACTER.test(title));

// The link is required and must be an absolute http(s) URL (the check rejects anything else, a blank
// value included).
const storyLinkSchema = z.string().trim().refine(isHttpLink);

// A story needs a link; the title is optional. With no title the link itself is what players see, so
// the stored title is then the empty string.
export const storySchema = z
  .object({ title: storyTitleSchema.optional(), url: storyLinkSchema })
  .transform(({ title, url }): Story => ({ title: title ?? '', url }));

// Only a plain object passes; fields are validated later so the error code can differ.
export const storySetEnvelopeSchema = z.looseObject({});

// What a client sends.
export type StorySetPayload = Story;
