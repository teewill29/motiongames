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
    expect(profile.forwardRatio.left).toBeLessThan(0.35);
    // Arms hanging at the sides: upper arm 0.3 m over 0.36 m shoulders.
    expect(profile.upperArm2D.left).toBeCloseTo(0.3 / 0.36, 1);
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
    expect(draft).toMatchObject({ forwardExtension: { left: 0.9, right: 0.9 } });
    expect(draft).toHaveProperty("forwardRatio");
  });

  it("does not let a required step be skipped", () => {
    const runner = new CalibrationRunner([positionStep({ ...calibrationConfig })]);
    expect(runner.skip()).toBe(false);
  });
});

describe("boxing calibration", () => {
  const { boxing, config } = syntheticCalibration();

  it("records guard, punches, slips and duck", () => {
    expect(boxing.guard.left.upperRatio).toBeGreaterThan(0.6);
    expect(boxing.guard.left.elbow).toBeLessThan(80);
    expect(boxing.punches.jab).toHaveLength(3);
    expect(boxing.punches.cross).toHaveLength(3);
    for (const p of [...boxing.punches.jab, ...boxing.punches.cross]) {
      expect(p.minRatio).toBeLessThan(0.35); // upper arm pointed at the camera
      expect(p.riseMs).toBeGreaterThan(0);
    }
    expect(boxing.slip.left).toBeCloseTo(0.2 / 0.36, 1);
    expect(boxing.slip.right).toBeCloseTo(0.2 / 0.36, 1);
    expect(boxing.duck).toBeCloseTo(0.4, 1);
  });

  it("derives thresholds between guard and punch", () => {
    const punch = boxing.punches.jab[0]!.minRatio;
    expect(config.jabStartRatio).toBeLessThan(boxing.guard.left.upperRatio);
    expect(config.jabPeakRatio).toBeLessThan(config.jabStartRatio);
    expect(config.jabPeakRatio).toBeGreaterThan(punch);
    expect(config.slipThreshold).toBeLessThan(boxing.slip.left!);
    expect(config.duckThreshold).toBeLessThan(boxing.duck!);
  });

  const base = (): BoxingCalibration => ({
    version: 2,
    createdAt: "",
    stance: "orthodox",
    guard: {
      left: { ext: 0.75, elbow: 95, upperRatio: 0.85 },
      right: { ext: 0.6, elbow: 80, upperRatio: 0.8 },
      maxWristNose: 0.4,
      maxWristDrop: 0.3,
      lean: 0,
      shoulderY: 0.3,
    },
    punches: {
      jab: [{ minRatio: 0.45, elbowDrop: 0.3, wristDrop: 0.2, peakExt: 0.9, riseMs: 120, peakSpeed: 8 }],
      // Barely moved the upper arm: not usable.
      cross: [{ minRatio: 0.72, elbowDrop: 0.3, wristDrop: 0.2, peakExt: 0.8, riseMs: 120, peakSpeed: 8 }],
    },
    slip: { left: 0.5, right: null },
    duck: null,
  });

  it("places straight thresholds between the hand's guard and its punches", () => {
    const d = deriveBoxingConfig(base(), BOXING_SPEC_DEFAULTS, calibrationConfig);
    expect(d.jabStartRatio).toBeCloseTo(0.85 - calibrationConfig.startFraction * 0.4, 5);
    expect(d.jabPeakRatio).toBeCloseTo(0.85 - calibrationConfig.peakFraction * 0.4, 5);
  });

  it("moves the head-shot line down to where calibration punches landed", () => {
    const c = base();
    c.punches.jab[0]!.wristDrop = 0.4;
    expect(deriveBoxingConfig(c, BOXING_SPEC_DEFAULTS, calibrationConfig).headTolerance).toBeCloseTo(0.55, 5);
  });

  it("keeps defaults where calibration is unusable or skipped", () => {
    const d = deriveBoxingConfig(base(), BOXING_SPEC_DEFAULTS, calibrationConfig);
    expect(d.crossStartRatio).toBeUndefined(); // upper arm barely turned
    expect(d.slipThreshold).toBeUndefined(); // one slip skipped
    expect(d.duckThreshold).toBeUndefined();
  });

  it("widens the guard zone to fit a low guard", () => {
    const d = deriveBoxingConfig(base(), BOXING_SPEC_DEFAULTS, calibrationConfig);
    expect(d.guardMaxDrop).toBeCloseTo(0.45, 5);
  });
});

