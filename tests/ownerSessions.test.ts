import { describe, expect, it } from "vitest";
import { calibrationConfig } from "../src/core/calibration/config";
import { poseConfig } from "../src/core/pose/config";
import { PosePipeline } from "../src/core/pose/pipeline";
import { recordingToFrames } from "../src/core/recorder/format";
import { defenseBaseline } from "../src/games/boxing/calibration/derive";
import { BoxingInput } from "../src/games/boxing/input/boxingInput";
import type { PunchEvent } from "../src/games/boxing/types";
import { runCalibration } from "./helpers/boxingSetup";
import { loadFixture } from "./helpers/fixtures";

/**
 * The owner's first full calibration session (orthodox), recorded on the Pose
 * Test screen, 2026-11-27. Phases by time: walk back, stand, arms out, arms
 * forward, guard, jabs (23–40 s), crosses (40–57 s), slips, duck.
 *
 * The first detector read jabs here as crosses and hooks: the tracker's depth
 * estimate couples the two arms and hides straight punches thrown at the
 * camera. These tests pin the 2D upper-arm approach that fixed it.
 */
describe("owner calibration session 2026-11-27", () => {
  const rec = loadFixture("owner-calibration-session-2026-11-27.json");
  const raws = recordingToFrames(rec);
  const cal = runCalibration(raws, "orthodox");

  it("completes calibration", () => {
    expect(cal.finishedAt).toBeGreaterThan(60_000);
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
  const between = (a: number, b: number) => punches.filter((p) => p.timestamp >= a * 1000 && p.timestamp < b * 1000);
  // 36.8 s is a tracking glitch (both wrists jump to the same spot); leave it out.
  const glitch = (p: PunchEvent) => Math.abs(p.timestamp - 36_850) < 100;

  it("reads every jab as a jab", () => {
    const jabSection = between(23, 40).filter((p) => !glitch(p));
    const jabs = jabSection.filter((p) => p.type === "jab" && p.hand === "left");
    expect(jabs.length).toBeGreaterThanOrEqual(5);
    expect(jabSection.filter((p) => p.type !== "jab")).toEqual([]);
  });

  it("reads every cross as a cross, not a hook", () => {
    const crossSection = between(40, 56);
    expect(crossSection.map((p) => `${p.type}:${p.hand}`)).toEqual(["cross:right", "cross:right", "cross:right"]);
  });

  it("does not see slips while punching", () => {
    expect(slips.filter((t) => t >= 23_000 && t < 56_000)).toEqual([]);
  });

  it("calls the player's normal punches head shots", () => {
    expect(between(23, 56).filter((p) => !glitch(p) && p.target !== "head")).toEqual([]);
  });
});
