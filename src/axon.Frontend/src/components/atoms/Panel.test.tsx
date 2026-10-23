import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Panel } from './Panel';

describe('Panel', () => {
  it('is a labelled region when it is a section with a heading', () => {
    render(
      <Panel aria-labelledby="h">
        <h2 id="h">Story</h2>
        <p>Content</p>
      </Panel>,
    );

    const region = screen.getByRole('region', { name: 'Story' });
    expect(region.tagName).toBe('SECTION');
    expect(region).toHaveTextContent('Content');
  });

  it('is a labelled region with an aria-label', () => {
    render(
      <Panel aria-label="Round controls">
        <button type="button">Go</button>
      </Panel>,
    );

    expect(screen.getByRole('region', { name: 'Round controls' })).toContainElement(
      screen.getByRole('button', { name: 'Go' }),
    );
  });

  it('is not a landmark when it is an unnamed div', () => {
    const { container } = render(
      <Panel as="div">
        <p>Content</p>
      </Panel>,
    );

    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('passes props and a custom class through without losing its own look', () => {
    render(
      <Panel data-testid="p" className="extra">
        x
      </Panel>,
    );

    const panel = screen.getByTestId('p');
    expect(panel).toHaveClass('extra');
    expect(panel.className).toContain('rounded-lg');
    expect(panel.className).toContain('border');
    expect(panel.className).toContain('dark:bg-slate-800');
  });

  it('never hides overflow, so focus rings are not cut off', () => {
    render(<Panel data-testid="p">x</Panel>);

    expect(screen.getByTestId('p').className).not.toContain('overflow-hidden');
  });
});
