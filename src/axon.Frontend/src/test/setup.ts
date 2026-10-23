import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { clearThemeMemory } from '../lib/themeStorage';
import { clearPlayerTokenMemory } from '../services/playerTokenStorage';

afterEach(() => {
  cleanup();
  clearPlayerTokenMemory();
  clearThemeMemory();
});
