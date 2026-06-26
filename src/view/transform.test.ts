import { describe, it, expect } from 'vitest';
import { ViewTransform } from './transform';

describe('ViewTransform', () => {
  it('round-trips paper <-> screen with y flipped', () => {
    const xf = new ViewTransform(1, 1);
    xf.fit({ width: 800, height: 600 }, 0);
    // paper origin (0,0) is bottom-left → larger screen y than (0,1)
    const bottom = xf.toScreen({ x: 0, y: 0 });
    const top = xf.toScreen({ x: 0, y: 1 });
    expect(bottom.y).toBeGreaterThan(top.y);

    const p = { x: 0.3, y: 0.7 };
    const s = xf.toScreen(p);
    const back = xf.toPaper(s.x, s.y);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('fits a square paper centered in a wide viewport', () => {
    const xf = new ViewTransform(1, 1);
    xf.fit({ width: 1000, height: 500 }, 0);
    // limited by height → scale = 500
    expect(xf.scale).toBeCloseTo(500);
    // centered horizontally: left padding = (1000 - 500)/2 = 250
    expect(xf.toScreen({ x: 0, y: 1 }).x).toBeCloseTo(250);
  });
});
