import { describe, expect, it } from 'vitest';
import { playerNameKey, playerNameSchema } from '@axon/shared';

const parse = (value: unknown) => playerNameSchema.safeParse(value);

describe('playerNameSchema', () => {
  it('rejects the empty string (0 code points)', () => {
    expect(parse('').success).toBe(false);
  });

  it('accepts a single character (1 code point)', () => {
    expect(parse('A').success).toBe(true);
  });

  it('accepts 30 code points', () => {
    expect(parse('a'.repeat(30)).success).toBe(true);
  });

  it('rejects 31 code points', () => {
    expect(parse('a'.repeat(31)).success).toBe(false);
  });

  it('counts an emoji as one code point, so 30 emoji are accepted', () => {
    expect(parse('😀'.repeat(30)).success).toBe(true);
  });

  it('rejects 31 emoji', () => {
    expect(parse('😀'.repeat(31)).success).toBe(false);
  });

  it('rejects whitespace-only names', () => {
    expect(parse(' \t\n ').success).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    expect(playerNameSchema.parse('  Anna  ')).toBe('Anna');
  });

  it('counts the length after trimming', () => {
    expect(parse(`  ${'a'.repeat(30)}  `).success).toBe(true);
  });

  it('keeps inner spaces', () => {
    expect(playerNameSchema.parse('Anna B')).toBe('Anna B');
  });

  it.each([
    ['tab', 'a\tb'],
    ['newline', 'a\nb'],
    ['bell', 'a\u0007b'],
    ['a lone control character', '\u0007'],
  ])('rejects an inner %s', (_label, name) => {
    expect(parse(name).success).toBe(false);
  });

  it('normalizes to NFC', () => {
    expect(playerNameSchema.parse('Cafe\u0301')).toBe('Caf\u00e9');
  });

  it('counts code points after NFC normalization', () => {
    const decomposed = 'e\u0301'.repeat(30);

    expect(parse(decomposed).success).toBe(true);
  });

  it.each([42, null, undefined, {}, ['Anna']])('rejects the non-string %j', (value) => {
    expect(parse(value).success).toBe(false);
  });

  it('keeps HTML as literal text', () => {
    expect(playerNameSchema.parse('<img src=x>')).toBe('<img src=x>');
  });
});

describe('playerNameKey', () => {
  it('ignores case', () => {
    expect(playerNameKey('ANNA')).toBe(playerNameKey('anna'));
  });

  it('ignores surrounding whitespace', () => {
    expect(playerNameKey('  Anna ')).toBe('anna');
  });

  it('treats composed and decomposed forms as equal', () => {
    expect(playerNameKey('Caf\u00e9')).toBe(playerNameKey('Cafe\u0301'));
  });

  it('keeps different names apart', () => {
    expect(playerNameKey('Anna')).not.toBe(playerNameKey('Anna B'));
  });
});
