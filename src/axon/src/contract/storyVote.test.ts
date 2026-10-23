import { describe, expect, it } from 'vitest';
import {
  cardSchema,
  DECK,
  ERROR_MESSAGES,
  storySchema,
  storySetEnvelopeSchema,
  voteCastEnvelopeSchema,
  voteCastPayloadSchema,
  voteMineSchema,
} from '@axon/shared';

const codePoints = (count: number, char = 'a') => char.repeat(count);

describe('DECK', () => {
  it('lists the ten cards in order', () => {
    expect(DECK).toEqual([0, 1, 2, 3, 5, 8, 13, 21, '?', 'coffee']);
  });
});

describe('cardSchema', () => {
  it.each([...DECK])('accepts %j', (card) => {
    expect(cardSchema.safeParse(card)).toEqual({ success: true, data: card });
  });

  it.each([
    '5',
    5.5,
    -1,
    '',
    'Coffee',
    '☕',
    '??',
    true,
    null,
    undefined,
    {},
    [],
    [5],
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects %j', (value) => {
    expect(cardSchema.safeParse(value).success).toBe(false);
  });
});

const LINK = 'https://example.com/1';

describe('storySchema title (optional)', () => {
  it.each([
    ['one code point', 'A', 'A'],
    ['200 code points', codePoints(200), codePoints(200)],
    ['200 astral code points', codePoints(200, '😀'), codePoints(200, '😀')],
    ['surrounding whitespace', '  Login  ', 'Login'],
  ])('accepts %s', (_label, title, stored) => {
    expect(storySchema.parse({ title, url: LINK })).toEqual({ title: stored, url: LINK });
  });

  it('normalizes the title to NFC', () => {
    expect(storySchema.parse({ title: 'Cafe\u0301', url: LINK }).title).toBe('Caf\u00e9');
  });

  it('counts code points after normalization', () => {
    const title = 'e\u0301'.repeat(200);

    expect(storySchema.safeParse({ title, url: LINK }).success).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('treats a %s title as no title and stores the empty string', (_label, title) => {
    expect(storySchema.parse({ title, url: LINK })).toEqual({ title: '', url: LINK });
  });

  it.each([
    ['201 code points', codePoints(201)],
    ['201 astral code points', codePoints(201, '😀')],
    ['a newline inside', 'Line\nbreak'],
    ['a tab inside', 'Tab\tinside'],
    ['a NUL inside', 'Nul\u0000inside'],
    ['a number', 42],
    ['null', null],
    ['an array', ['T']],
  ])('rejects %s', (_label, title) => {
    expect(storySchema.safeParse({ title, url: LINK }).success).toBe(false);
  });
});

describe('storySchema link (required)', () => {
  it.each([
    'https://example.com/1',
    'http://example.com',
    'https://dev.azure.com/org/p/_workitems/edit/1',
    'HTTP://Example.com',
    'https://example.com/x?a=b#c',
    `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`,
  ])('accepts %j and stores it as given', (url) => {
    expect(storySchema.parse({ title: 'T', url })).toEqual({ title: 'T', url });
  });

  it('stores a link trimmed', () => {
    expect(storySchema.parse({ title: 'T', url: '  https://example.com/x  ' })).toEqual({
      title: 'T',
      url: 'https://example.com/x',
    });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace only', '   '],
    ['null', null],
    ['a number', 42],
    ['an object', {}],
    ['an array', ['https://example.com']],
  ])('rejects a %s link, with or without a title', (_label, url) => {
    expect(storySchema.safeParse({ title: 'T', url }).success).toBe(false);
    expect(storySchema.safeParse({ url }).success).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    ' JavaScript:alert(1) ',
    'data:text/html,x',
    'vbscript:x',
    'file:///etc/passwd',
    'ftp://host/x',
    '/relative/path',
    'relative',
    'example.com',
    'www.example.com/x',
    '//evil.example/x',
    'https://',
    'http://exa mple.com',
    'https://example.com/a\tb',
    'https://example.com/a\nb',
    'https://example.com/\u0000',
    `https://example.com/${'a'.repeat(2049 - 'https://example.com/'.length)}`,
  ])('rejects the non-URL or unsafe link %j', (url) => {
    expect(storySchema.safeParse({ title: 'T', url }).success).toBe(false);
    expect(storySchema.safeParse({ url }).success).toBe(false);
  });

  it('strips unknown keys', () => {
    expect(
      storySchema.parse({ title: 'T', url: LINK, card: 5, role: 'facilitator' }),
    ).toStrictEqual({
      title: 'T',
      url: LINK,
    });
  });
});

describe('storySchema: link required, title optional', () => {
  it.each([
    ['a link only', { url: LINK }, { title: '', url: LINK }],
    ['a blank title and a link', { title: '', url: LINK }, { title: '', url: LINK }],
    ['both', { title: 'Login', url: LINK }, { title: 'Login', url: LINK }],
  ])('accepts %s', (_label, input, stored) => {
    expect(storySchema.parse(input)).toEqual(stored);
  });

  it.each([
    ['a title only', { title: 'Login' }],
    ['neither', {}],
    ['a title and a blank link', { title: 'Login', url: '  ' }],
    ['a blank title and a blank link', { title: '  ', url: '  ' }],
    ['a title and a link that is not a URL', { title: 'Login', url: 'not a url' }],
    ['a too long title and a link', { title: codePoints(201), url: LINK }],
    ['a title with a control character and a link', { title: 'a\nb', url: LINK }],
  ])('rejects %s', (_label, input) => {
    expect(storySchema.safeParse(input).success).toBe(false);
  });

  it('accepts a 2048-character link with no title', () => {
    const url = `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`;

    expect(storySchema.parse({ url })).toEqual({ title: '', url });
  });
});

describe('storySetEnvelopeSchema', () => {
  it.each([{}, { title: 1 }, { anything: true }])('accepts the object %j', (payload) => {
    expect(storySetEnvelopeSchema.safeParse(payload).success).toBe(true);
  });

  it.each([null, undefined, 'x', 42, true, []])('rejects %j', (payload) => {
    expect(storySetEnvelopeSchema.safeParse(payload).success).toBe(false);
  });
});

describe('voteCastEnvelopeSchema', () => {
  it.each([{ card: 5 }, { card: null }, { card: '4' }, { card: {} }])(
    'accepts %j so the card can fail with its own code',
    (payload) => {
      expect(voteCastEnvelopeSchema.safeParse(payload).success).toBe(true);
    },
  );

  it.each([5, null, undefined, 'coffee', [], {}, { cards: 5 }])('rejects %j', (payload) => {
    expect(voteCastEnvelopeSchema.safeParse(payload).success).toBe(false);
  });
});

describe('voteCastPayloadSchema and voteMineSchema', () => {
  it.each([...DECK, null])('accept card %j', (card) => {
    expect(voteCastPayloadSchema.safeParse({ card }).success).toBe(true);
    expect(voteMineSchema.safeParse({ card }).success).toBe(true);
  });

  it.each(['5', 11, 'xl', undefined])('reject card %j', (card) => {
    expect(voteCastPayloadSchema.safeParse({ card }).success).toBe(false);
    expect(voteMineSchema.safeParse({ card }).success).toBe(false);
  });

  it('rejects extra keys on vote:mine', () => {
    expect(voteMineSchema.safeParse({ card: 5, extra: 1 }).success).toBe(false);
  });
});

describe('story and vote error messages', () => {
  it('uses the fixed texts', () => {
    expect(ERROR_MESSAGES.INVALID_STORY).toBe(
      'Enter a link starting with http:// or https://, and an optional title of up to 200 characters.',
    );
    expect(ERROR_MESSAGES.INVALID_CARD).toBe('That card is not in the deck.');
    expect(ERROR_MESSAGES.FORBIDDEN).toBe('You are not allowed to do that.');
    expect(ERROR_MESSAGES.WRONG_PHASE).toBe('That action is not available right now.');
  });
});
