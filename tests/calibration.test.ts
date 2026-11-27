import { describe, expect, it } from "vitest";
import { BodyFrameBuilder } from "../src/core/body/buildBodyFrame";
import { calibrationConfig } from "../src/core/calibration/config";
import { distanceRatio } from "../src/core/calibration/profile";
import { CalibrationRunner } from "../src/core/calibration/runner";
import { armsForwardStep, positionStep } from "../src/core/calibration/steps";
import { poseConfig } from "../src/core/pose/config";
import type { BoxingCalibration } from "../src/games/boxing/calibration/boxingCalibration";
import { deriveBoxingConfig } from "../src/games/boxing/calibration/derive";
import { BOXING_SPEC_DEFAULTS } from "../src/games/boxing/config";
import { syntheticCalibration } from "./helpers/boxingSetup";
import { ARM_LENGTH, frameAt, syntheticPose } from "./helpers/syntheticPose";

const build = (opts: Parameters<typeof syntheticPose>[0], aspect = 16 / 9) =>
  new BodyFrameBuilder({ ...poseConfig }).build(frameAt(0, syntheticPose(opts), aspect));

describe("shared calibration", () => {
  const { profile } = syntheticCalibration();

  it("measures neutral baselines and arm length", () => {
    expect(profile.shoulderWidth).toBeCloseTo(0.36 * 0.65, 3);
    expect(profile.torsoLength).toBeCloseTo(0.5 * 0.65, 3);
    expect(profile.armLength.left).toBeCloseTo(ARM_LENGTH, 2);
    expect(profile.armLength.right).toBeCloseTo(ARM_LENGTH, 2);
    expect(profile.forwardExtension.left).toBeGreaterThan(0.95);
  });

  it("reports distance relative to calibration", () => {
    expect(distanceRatio(profile, profile.shoulderWidth * 1.2)).toBeCloseTo(1.2, 5);
  });

  it("position step coaches distance and centering", () => {
    const step = positionStep({ ...calibrationConfig });
    expect(step.update(build({ scale: 1.2 })).hint).toBe("Step back");
    expect(step.update(build({ scale: 0.2 })).hint).toBe("Step closer");
    // Person shifted to image right = screen left after mirroring: they should move to their right.
    expect(step.update(build({ scale: 0.65, offset: [0.6, 0, 0] })).hint).toBe("Move to your right");
    expect(step.update(build({ scale: 0.65, visibility: 0.1 })).hint).toBe("Step into view");
  });

  it("position step needs the hold time", () => {
    const step = positionStep({ ...calibrationConfig, positionHoldMs: 500 });
    const b = new BodyFrameBuilder({ ...poseConfig });
    let done = false;
    for (let t = 0; t <= 400; t += 33) done = step.update(b.build(frameAt(t, syntheticPose({ scale: 0.65 })))).done;
    expect(done).toBe(false);
    for (let t = 433; t <= 600; t += 33) done = step.update(b.build(frameAt(t, syntheticPose({ scale: 0.65 })))).done;
    expect(done).toBe(true);
  });

  it("skipping the forward-arms step falls back to a default", () => {
    const draft = {};
    const runner = new CalibrationRunner([armsForwardStep({ ...calibrationConfig }, draft)]);
    expect(runner.skip()).toBe(true);
    expect(runner.finished).toBe(true);
    expect(draft).toEqual({ forwardExtension: { left: 0.9, right: 0.9 } });
  });

  it("does not let a required step be skipped", () => {
    const runner = new CalibrationRunner([positionStep({ ...calibrationConfig })]);
    expect(runner.skip()).toBe(false);
  });
});

describe("boxing calibration", () => {
  const { boxing, config } = syntheticCalibration();

  it("records guard, punches, slips and duck", () => {
    expect(boxing.guard.left.ext).toBeCloseTo(0.53, 1);
    expect(boxing.guard.left.elbow).toBeLessThan(80);
    expect(boxing.punches.jab).toHaveLength(3);
    expect(boxing.punches.cross).toHaveLength(3);
    for (const p of [...boxing.punches.jab, ...boxing.punches.cross]) {
      expect(p.peakExt).toBeGreaterThan(0.95);
      expect(p.riseMs).toBeGreaterThan(0);
    }
    expect(boxing.slip.left).toBeCloseTo(0.2 / 0.36, 1);
    expect(boxing.slip.right).toBeCloseTo(0.2 / 0.36, 1);
    expect(boxing.duck).toBeCloseTo(0.4, 1);
  });

  it("derives thresholds between guard and punch peak", () => {
    expect(config.jabStartExt).toBeGreaterThan(boxing.guard.left.ext);
    expect(config.jabPeakExt).toBeGreaterThan(config.jabStartExt);
    expect(config.jabPeakExt).toBeLessThan(0.99);
    expect(config.slipThreshold).toBeLessThan(boxing.slip.left!);
    expect(config.duckThreshold).toBeLessThan(boxing.duck!);
  });

  const base = (): BoxingCalibration => ({
    version: 1,
    createdAt: "",
    stance: "orthodox",
    guard: {
      left: { ext: 0.75, elbow: 95 },
      right: { ext: 0.6, elbow: 80 },
      maxWristNose: 0.4,
      maxWristDrop: 0.3,
      lean: 0,
      shoulderY: 0.3,
    },
    punches: {
      jab: [{ peakExt: 0.97, peakElbow: 150, riseMs: 180, peakSpeed: 8 }],
      cross: [{ peakExt: 0.62, peakElbow: 100, riseMs: 180, peakSpeed: 8 }],
    },
    slip: { left: 0.5, right: null },
    duck: null,
  });

  it("uses per-hand guard positions (a high guard extension like the owner's recording)", () => {
    const d = deriveBoxingConfig(base(), BOXING_SPEC_DEFAULTS, calibrationConfig);
    expect(d.jabStartExt).toBeCloseTo(0.75 + 0.3 * 0.22, 5);
    expect(d.jabPeakExt).toBeCloseTo(0.75 + 0.7 * 0.22, 5);
  });

  it("keeps defaults where calibration is unusable or skipped", () => {
    const d = deriveBoxingConfig(base(), BOXING_SPEC_DEFAULTS, calibrationConfig);
    expect(d.crossStartExt).toBeUndefined(); // peak barely above guard
    expect(d.slipThreshold).toBeUndefined(); // one slip skipped
    expect(d.duckThreshold).toBeUndefined();
  });

  it("widens the guard zone to fit a low guard", () => {
    const d = deriveBoxingConfig(base(), BOXING_SPEC_DEFAULTS, calibrationConfig);
    expect(d.guardMaxDrop).toBeCloseTo(0.45, 5);
  });
});

