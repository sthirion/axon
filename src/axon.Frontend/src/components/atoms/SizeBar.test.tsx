import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SizeBar } from './SizeBar';

const filled = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-filled]')].map(
    (el) => el.getAttribute('data-filled') === 'true',
  );

describe('SizeBar', () => {
  it.each([0, 1, 2, 3, 4])('fills level + 1 of the five segments for level %d', (level) => {
    const { container } = render(<SizeBar level={level} />);

    const segments = filled(container);
    expect(segments).toHaveLength(5);
    expect(segments.filter(Boolean)).toHaveLength(level + 1);
    expect(segments.slice(0, level + 1).every(Boolean)).toBe(true);
  });

  it('is decorative: hidden from assistive technology and without text', () => {
    const { container } = render(<SizeBar level={2} />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('');
  });

  it('grows with every level', () => {
    const counts = [0, 1, 2, 3, 4].map((level) => {
      const { container, unmount } = render(<SizeBar level={level} />);
      const count = filled(container).filter(Boolean).length;
      unmount();
      return count;
    });

    expect(counts).toEqual([1, 2, 3, 4, 5]);
  });
});
