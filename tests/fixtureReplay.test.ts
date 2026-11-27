import { describe, expect, it } from "vitest";
import { replayFixture } from "./helpers/fixtures";

/** Counts rising crossings of `hi` that first dropped below `lo` (hysteresis). */
function countPeaks(values: number[], lo: number, hi: number): number {
  let armed = true;
  let peaks = 0;
  for (const v of values) {
    if (armed && v > hi) {
      peaks++;
      armed = false;
    } else if (!armed && v < lo) {
      armed = true;
    }
  }
  return peaks;
}

describe("fixture replay: synthetic-jab-left-x3", () => {
  const frames = replayFixture("synthetic-jab-left-x3.json");

  it("tracks every frame", () => {
    expect(frames.length).toBeGreaterThan(100);
    expect(frames.every((f) => f.tracked)).toBe(true);
  });

  it("shows three left-arm extensions through smoothing, and a still right arm", () => {
    const left = frames.map((f) => f.arms.left.extension);
    const right = frames.map((f) => f.arms.right.extension);
    expect(countPeaks(left, 0.75, 0.9)).toBe(3);
    expect(Math.max(...left)).toBeGreaterThan(0.95);
    expect(Math.max(...right) - Math.min(...right)).toBeLessThan(0.01);
  });

  it("moves the left wrist toward the camera during each punch", () => {
    const minVz = Math.min(...frames.map((f) => f.arms.left.wristVelocityZ));
    expect(minVz).toBeLessThan(-1); // m/s toward the camera
  });
});
