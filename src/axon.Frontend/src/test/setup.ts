import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearPlayerTokenMemory } from '../services/playerTokenStorage';

afterEach(() => {
  cleanup();
  clearPlayerTokenMemory();
});
