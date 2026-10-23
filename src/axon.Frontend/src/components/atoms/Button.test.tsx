import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('has a minimum 44x44 CSS px touch target', () => {
    render(<Button>Withdraw vote</Button>);

    expect(screen.getByRole('button', { name: 'Withdraw vote' })).toHaveClass(
      'min-h-11',
      'min-w-11',
    );
  });

  it('keeps the minimum size when a className is supplied', () => {
    render(<Button className="bg-slate-600">Cancel</Button>);

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass(
      'min-h-11',
      'min-w-11',
      'bg-slate-600',
    );
  });

  it('defaults to type="button"', () => {
    render(<Button>Go</Button>);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button');
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
