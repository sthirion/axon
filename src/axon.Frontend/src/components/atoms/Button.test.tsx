import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

// The minimum 44x44 touch target is checked in a real browser (voting.spec.ts, finish.spec.ts);
// class names are an implementation detail and are not asserted here.
describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Go</Button>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a form when type="submit" is supplied', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Go</Button>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps its behaviour when a className is supplied', async () => {
    const onClick = vi.fn();
    render(
      <Button className="custom" onClick={onClick}>
        Cancel
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('custom');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('exposes its text as the accessible name', () => {
    render(<Button>Go</Button>);

    expect(screen.getByRole('button')).toHaveAccessibleName('Go');
  });
});
