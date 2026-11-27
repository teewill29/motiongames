import { describe, expect, it } from "vitest";
import { OneEuroFilter } from "../src/core/pose/oneEuro";

const params = { minCutoff: 1.2, beta: 10, dCutoff: 1 };

describe("OneEuroFilter", () => {
  it("passes the first value through and holds a constant signal", () => {
    const f = new OneEuroFilter(params);
    expect(f.filter(0.4, 0)).toBe(0.4);
    for (let t = 33; t < 1000; t += 33) expect(f.filter(0.4, t)).toBeCloseTo(0.4, 10);
  });

  it("reduces jitter on a still signal", () => {
    const f = new OneEuroFilter(params);
    let maxDev = 0;
    for (let i = 0; i < 300; i++) {
      const noise = (i % 2 ? 1 : -1) * 0.01; // ±0.01 alternating
      const out = f.filter(0.5 + noise, i * 33);
      if (i > 30) maxDev = Math.max(maxDev, Math.abs(out - 0.5));
    }
    expect(maxDev).toBeLessThan(0.004);
  });

  it("follows a fast move with little lag when beta is high", () => {
    const f = new OneEuroFilter(params);
    for (let i = 0; i < 30; i++) f.filter(0, i * 33);
    // Ramp 0 -> 0.5 over ~200ms, like a punch in normalized units.
    let out = 0;
    for (let i = 1; i <= 6; i++) out = f.filter((0.5 * i) / 6, 990 + i * 33);
    expect(out).toBeGreaterThan(0.4);
  });

  it("reads params live, so tuning applies immediately", () => {
    const p = { ...params };
    const f = new OneEuroFilter(p);
    f.filter(0, 0);
    p.minCutoff = 1000;
    p.beta = 0;
    expect(f.filter(1, 33)).toBeGreaterThan(0.99);
  });

  it("ignores repeated timestamps and restarts after reset", () => {
    const f = new OneEuroFilter(params);
    f.filter(0, 0);
    const a = f.filter(1, 33);
    expect(f.filter(5, 33)).toBe(a);
    f.reset();
    expect(f.filter(7, 40)).toBe(7);
  });
});
