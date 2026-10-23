import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FACILITATOR_OFFLINE_MESSAGE, FacilitatorOfflineBanner } from './FacilitatorOfflineBanner';

describe('FacilitatorOfflineBanner', () => {
  it('shows the message inside a status region when visible', () => {
    render(<FacilitatorOfflineBanner visible />);

    expect(screen.getByRole('status')).toHaveTextContent(FACILITATOR_OFFLINE_MESSAGE);
  });

  it('keeps an empty status region mounted when hidden', () => {
    render(<FacilitatorOfflineBanner visible={false} />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
