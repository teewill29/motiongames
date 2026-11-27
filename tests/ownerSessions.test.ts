import { describe, expect, it } from "vitest";
import { calibrationConfig } from "../src/core/calibration/config";
import { poseConfig } from "../src/core/pose/config";
import { PosePipeline } from "../src/core/pose/pipeline";
import { recordingToFrames } from "../src/core/recorder/format";
import { defenseBaseline } from "../src/games/boxing/calibration/derive";
import { BoxingInput } from "../src/games/boxing/input/boxingInput";
import type { PunchEvent } from "../src/games/boxing/types";
import { runCalibration } from "./helpers/boxingSetup";
import { detectFixture, loadFixture } from "./helpers/fixtures";

/**
 * The owner's real calibration sessions (orthodox, MacBook camera). In each,
 * the jab step holds only left jabs and the cross step only right crosses,
 * so those stretches are labeled ground truth.
 *
 * The first detector read these jabs as crosses and hooks: the tracker's depth
 * couples the two arms and hides straight punches thrown at the camera. These
 * tests pin the 2D upper-arm approach that fixed it.
 */
const SESSIONS = [
  {
    file: "owner-calibration-session-2026-11-27.json",
    jabs: [23, 40] as const,
    crosses: [40, 56] as const,
    crossCount: 3,
    // 36.8 s: tracking glitch, both wrists jump to the same spot.
    glitches: [36_850],
  },
  {
    file: "owner-calibration-session-2026-11-27b.json",
    jabs: [20, 25.5] as const,
    crosses: [25.5, 35.8] as const,
    crossCount: 3,
    glitches: [],
  },
];

describe.each(SESSIONS)("owner session $file", (session) => {
  const raws = recordingToFrames(loadFixture(session.file));
  const cal = runCalibration(raws, "orthodox");

  it("completes calibration", () => {
    expect(cal.boxing.punches.jab).toHaveLength(calibrationConfig.punchesPerType);
    expect(cal.boxing.punches.cross).toHaveLength(calibrationConfig.punchesPerType);
    expect(cal.config.slipThreshold).toBeGreaterThan(0.3);
  });

  const pipeline = new PosePipeline({ ...poseConfig }, cal.profile);
  const input = new BoxingInput(cal.config, "orthodox", defenseBaseline(cal.profile, cal.boxing));
  const punches: PunchEvent[] = [];
  const slips: number[] = [];
  for (const r of raws) {
    const res = input.update(pipeline.push(r));
    punches.push(...res.punches);
    for (const d of res.defense) if (d.type === "slip:left" || d.type === "slip:right") slips.push(d.timestamp);
  }
  const glitch = (p: PunchEvent) => session.glitches.some((t) => Math.abs(p.timestamp - t) < 100);
  const between = ([a, b]: readonly [number, number]) =>
    punches.filter((p) => p.timestamp >= a * 1000 && p.timestamp < b * 1000 && !glitch(p));

  it("reads every jab as a jab", () => {
    const section = between(session.jabs);
    expect(section.filter((p) => p.type === "jab" && p.hand === "left").length).toBeGreaterThanOrEqual(3);
    expect(section.filter((p) => p.type !== "jab").map((p) => `${p.type}@${p.timestamp}`)).toEqual([]);
  });

  it("reads every cross as a cross, not a hook", () => {
    expect(between(session.crosses).map((p) => `${p.type}:${p.hand}`)).toEqual(Array(session.crossCount).fill("cross:right"));
  });

  it("does not see slips while punching", () => {
    expect(slips.filter((t) => t >= session.jabs[0] * 1000 && t < session.crosses[1] * 1000)).toEqual([]);
  });

  it("calls the player's normal punches head shots", () => {
    expect(between([session.jabs[0], session.crosses[1]]).filter((p) => p.target !== "head")).toEqual([]);
  });
});

/**
 * Labeled "cross-x10" from the detection test screen, with the calibration
 * it was recorded with. The owner threw jabs first (8–32 s), then crosses (40–62 s).
 */
describe("owner recording cross-x10 2026-11-27", () => {
  const run = detectFixture("owner-cross-x10-2026-11-27.json");
  const inRange = <T extends { timestamp: number }>(xs: T[], a: number, b: number) =>
    xs.filter((x) => x.timestamp >= a * 1000 && x.timestamp < b * 1000);

  it("reads the jabs as jabs", () => {
    const section = inRange(run.punches, 8, 32);
    expect(section.filter((p) => p.type === "jab").length).toBeGreaterThanOrEqual(10);
    expect(section.filter((p) => p.type !== "jab")).toEqual([]);
  });

  it("reads 9 of 10 crosses, no recoil uppercuts, at most one stray slip", () => {
    const section = inRange(run.punches, 40, 60);
    expect(section.filter((p) => p.type === "cross").length).toBeGreaterThanOrEqual(9);
    expect(section.filter((p) => p.type === "uppercut")).toEqual([]);
    expect(inRange(run.defense, 40, 60).filter((d) => d.type === "slip:left" || d.type === "slip:right").length).toBeLessThanOrEqual(1);
  });
});
