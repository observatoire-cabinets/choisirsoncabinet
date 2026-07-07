import { describe, it, expect } from 'vitest';
import { shouldAutoUpdate } from './autoupdate';

describe('shouldAutoUpdate', () => {
  it('actif seulement si le réglage est ON et internet disponible', () => {
    expect(shouldAutoUpdate({ autoUpdate: true }, true)).toBe(true);
    expect(shouldAutoUpdate({ autoUpdate: true }, false)).toBe(false);
    expect(shouldAutoUpdate({ autoUpdate: false }, true)).toBe(false);
    expect(shouldAutoUpdate({ autoUpdate: false }, false)).toBe(false);
  });
});
