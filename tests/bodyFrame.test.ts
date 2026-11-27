import { describe, expect, it } from "vitest";
import { BodyFrameBuilder } from "../src/core/body/buildBodyFrame";
import { poseConfig } from "../src/core/pose/config";
import { LM } from "../src/core/pose/landmarks";
import {
  ARM_BENT_90,
  ARM_LENGTH,
  ARM_STRAIGHT_FORWARD,
  FOREARM,
  UPPER_ARM,
  frameAt,
  syntheticPose,
} from "./helpers/syntheticPose";

const cfg = () => ({ ...poseConfig });
const ASPECT = 16 / 9;

describe("BodyFrameBuilder", () => {
  it("returns an untracked frame when there is no pose", () => {
    const f = new BodyFrameBuilder(cfg()).build(frameAt(0, null));
    expect(f.tracked).toBe(false);
    expect(f.landmarks).toHaveLength(0);
    expect(f.visible.nose).toBe(false);
  });

  it("is untracked when required landmarks have low visibility", () => {
    const f = new BodyFrameBuilder(cfg()).build(frameAt(0, syntheticPose({ visibility: 0.2 })));
    expect(f.tracked).toBe(false);
    expect(f.landmarks).toHaveLength(33);
  });

  it("mirrors into view space: the person's left shoulder is on screen left", () => {
    const f = new BodyFrameBuilder(cfg()).build(frameAt(0, syntheticPose()));
    expect(f.tracked).toBe(true);
    const l = f.landmarks[LM.leftShoulder]!;
    const r = f.landmarks[LM.rightShoulder]!;
    expect(l.x).toBeLessThan(r.x);
    expect(f.shoulderMid.x).toBeCloseTo(ASPECT / 2, 5);
  });

  it("measures shoulder width in aspect-corrected units", () => {
    const scale = 0.9;
    const f = new BodyFrameBuilder(cfg()).build(frameAt(0, syntheticPose({ scale })));
    expect(f.shoulderWidth).toBeCloseTo(0.36 * scale, 5); // shoulders 0.36m apart
    expect(f.torsoLength).toBeCloseTo(0.5 * scale, 5);
  });

  it("is scale invariant: closer or farther gives the same shoulder-width measures", () => {
    const near = new BodyFrameBuilder(cfg()).build(frameAt(0, syntheticPose({ scale: 1.2 })));
    const far = new BodyFrameBuilder(cfg()).build(frameAt(0, syntheticPose({ scale: 0.6 })));
    expect(near.shoulderWidth).toBeCloseTo(far.shoulderWidth * 2, 5);
    expect(near.torsoLength / near.shoulderWidth).toBeCloseTo(far.torsoLength / far.shoulderWidth, 5);
    expect(near.arms.left.reach).toBeCloseTo(far.arms.left.reach, 5);
  });

  it("computes extension and elbow angle for straight and bent arms", () => {
    const f = new BodyFrameBuilder(cfg()).build(
      frameAt(0, syntheticPose({ left: ARM_STRAIGHT_FORWARD, right: ARM_BENT_90 })),
    );
    expect(f.arms.left.extension).toBeCloseTo(1, 5);
    expect(f.arms.left.elbowAngle).toBeCloseTo(180, 3);
    expect(f.arms.right.elbowAngle).toBeCloseTo(90, 3);
    expect(f.arms.right.extension).toBeCloseTo(Math.hypot(UPPER_ARM, FOREARM) / ARM_LENGTH, 5);
  });

  it("uses the calibrated arm length when a profile is set", () => {
    const profile = {
      version: 1 as const,
      createdAt: "",
      shoulderWidth: 0.3,
      armLength: { left: ARM_LENGTH * 1.25, right: ARM_LENGTH },
    };
    const f = new BodyFrameBuilder(cfg(), profile).build(frameAt(0, syntheticPose({ left: ARM_STRAIGHT_FORWARD })));
    expect(f.arms.left.extension).toBeCloseTo(0.8, 5);
  });

  it("reports wrist velocity in shoulder widths per second, +x toward the player's right", () => {
    const c = cfg();
    c.minCutoff = 1e6; // effectively no smoothing, so velocities are exact
    const b = new BodyFrameBuilder(c);
    b.build(frameAt(0, syntheticPose()));
    // Body shifts 0.36 m (one shoulder width) toward the person's right (-x in world/image) in 100 ms.
    const f = b.build(frameAt(100, syntheticPose({ offset: [-0.36, 0, 0] })));
    expect(f.arms.right.wristVelocity.x).toBeCloseTo(10, 1);
    expect(f.arms.right.wristVelocity.y).toBeCloseTo(0, 5);
  });

  it("reports depth velocity, negative toward the camera", () => {
    const c = cfg();
    c.minCutoff = 1e6;
    const b = new BodyFrameBuilder(c);
    b.build(frameAt(0, syntheticPose({ left: ARM_BENT_90 })));
    const f = b.build(frameAt(100, syntheticPose({ left: ARM_STRAIGHT_FORWARD })));
    expect(f.arms.left.wristVelocityZ).toBeLessThan(0);
  });

  it("resets velocity after a tracking gap", () => {
    const c = cfg();
    const b = new BodyFrameBuilder(c);
    b.build(frameAt(0, syntheticPose()));
    const f = b.build(frameAt(c.resetGapMs + 100, syntheticPose({ offset: [-0.36, 0, 0] })));
    expect(f.arms.right.wristVelocity.x).toBe(0);
  });

  it("smooths jitter on a still pose", () => {
    const b = new BodyFrameBuilder(cfg());
    let last = 0;
    for (let i = 0; i < 60; i++) {
      const jitter = (i % 2 ? 1 : -1) * 0.004;
      last = b.build(frameAt(i * 33, syntheticPose({ offset: [jitter, 0, 0] }))).shoulderMid.x;
    }
    const rawJitterView = 0.004 * 0.9; // world jitter x projection scale, in view units
    expect(Math.abs(last - ASPECT / 2)).toBeLessThan(rawJitterView * 0.5);
  });
});
