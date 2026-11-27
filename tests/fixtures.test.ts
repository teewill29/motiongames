import { describe, expect, it } from "vitest";
import { countEvents, detectFixture, loadManifest, replayFixture } from "./helpers/fixtures";

const PUNCH_TYPES = ["jab", "cross", "hook", "uppercut"];

/**
 * Every labeled recording in tests/fixtures/manifest.json runs through the
 * real pipeline and detectors with the calibration saved in the file.
 * Listed counts must match within tolerance; punch types not listed count as
 * false positives and must stay within tolerance too.
 */
describe.each(loadManifest())("fixture $file", (entry) => {
  const counts = countEvents(detectFixture(entry.file));

  it.each(Object.entries(entry.expect))(`detects %s ×%i`, (key, n) => {
    expect(Math.abs((counts[key] ?? 0) - n), `${key}: got ${counts[key] ?? 0}, expected ${n}`).toBeLessThanOrEqual(entry.tolerance);
  });

  it("has no unexpected punches", () => {
    for (const t of PUNCH_TYPES) {
      if (t in entry.expect) continue;
      expect(counts[t] ?? 0, `unexpected ${t}`).toBeLessThanOrEqual(entry.tolerance);
    }
  });
});

describe("fixture pipeline", () => {
  it("tracks every frame of a synthetic recording", () => {
    const frames = replayFixture("synthetic-jab-x5.json");
    expect(frames.length).toBeGreaterThan(100);
    expect(frames.every((f) => f.tracked)).toBe(true);
  });
});
