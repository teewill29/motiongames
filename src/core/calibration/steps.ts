import type { BodyFrame, Side } from "../body/bodyFrame";
import { dist3 } from "../body/geometry";
import { LM } from "../pose/landmarks";
import type { CalibrationConfig } from "./config";
import { HoldTimer, median, MotionMeter } from "./hold";
import type { CalibrationProfile } from "./profile";
import type { FrameStep, StepStatus } from "./runner";

/** Profile under construction. Steps fill it in order. */
export type ProfileDraft = Partial<CalibrationProfile>;

const ARMS: Record<Side, { shoulder: number; wrist: number }> = {
  left: { shoulder: LM.leftShoulder, wrist: LM.leftWrist },
  right: { shoulder: LM.rightShoulder, wrist: LM.rightWrist },
};

const worldArmDistance = (f: BodyFrame, side: Side) =>
  dist3(f.world[ARMS[side].shoulder]!, f.world[ARMS[side].wrist]!);

const progress = (held: number, need: number) => Math.min(1, held / need);

/** 1. Player centered, at a usable distance, visible from the waist up. */
export function positionStep(cfg: CalibrationConfig): FrameStep {
  const hold = new HoldTimer();
  return {
    kind: "frames",
    id: "position",
    title: "Get in position",
    instruction: "Stand where you'll play, facing the camera, visible from the waist up.",
    skippable: false,
    begin: () => hold.reset(),
    update(f): StepStatus {
      let hint: string | undefined;
      const v = f.visible;
      if (!f.tracked) hint = "Step into view";
      else if (!v.leftHip || !v.rightHip) hint = "Step back so your hips are in view";
      else if (!v.leftWrist || !v.rightWrist) hint = "Keep both hands in view";
      else if (f.scale > cfg.maxScale) hint = "Step back";
      else if (f.scale < cfg.minScale) hint = "Step closer";
      else {
        const offset = (f.shoulderMid.x - f.imageAspect / 2) / f.imageAspect;
        // View space is mirrored: on screen left means the player should move to their right.
        if (offset < -cfg.centerTolerance) hint = "Move to your right";
        else if (offset > cfg.centerTolerance) hint = "Move to your left";
      }
      const held = hold.update(hint === undefined, f.timestamp);
      return { progress: progress(held, cfg.positionHoldMs), done: held >= cfg.positionHoldMs, hint: hint ?? "Good. Hold there" };
    },
    finish() {},
  };
}

/** 2. Hold still in a relaxed stance to record baselines. */
export function neutralStep(cfg: CalibrationConfig, draft: ProfileDraft): FrameStep {
  const hold = new HoldTimer();
  const motion = new MotionMeter();
  let samples: BodyFrame[] = [];
  return {
    kind: "frames",
    id: "neutral",
    title: "Stand still",
    instruction: "Stand tall and relaxed, hands down, and hold still.",
    skippable: false,
    begin() {
      hold.reset();
      motion.reset();
      samples = [];
    },
    update(f) {
      const speed = motion.update(f);
      const still = f.tracked && speed < cfg.stillSpeed;
      const held = hold.update(still, f.timestamp);
      if (!still) samples = [];
      else samples.push(f);
      return {
        progress: progress(held, cfg.neutralHoldMs),
        done: held >= cfg.neutralHoldMs && samples.length > 0,
        hint: !f.tracked ? "Step into view" : still ? "Hold still…" : "Hold still",
      };
    },
    finish() {
      const m = (fn: (f: BodyFrame) => number) => median(samples.map(fn));
      draft.shoulderWidth = m((f) => f.scale);
      draft.shoulderMid = { x: m((f) => f.shoulderMid.x), y: m((f) => f.shoulderMid.y) };
      draft.nose = { x: m((f) => f.nose.x), y: m((f) => f.nose.y) };
      draft.hipMid = { x: m((f) => f.hipMid.x), y: m((f) => f.hipMid.y) };
      draft.torsoLength = m((f) => f.torsoLength);
    },
  };
}

/** 3a. Arms straight out to the sides: the most reliable arm length (no depth involved). */
export function armsSideStep(cfg: CalibrationConfig, draft: ProfileDraft, onArmLength: () => void): FrameStep {
  const hold = new HoldTimer();
  let samples: { left: number; right: number }[] = [];
  return {
    kind: "frames",
    id: "arms-side",
    title: "Arms out to the sides",
    instruction: "Hold both arms straight out to your sides at shoulder height.",
    skippable: false,
    begin() {
      hold.reset();
      samples = [];
    },
    update(f) {
      const ok =
        f.tracked &&
        (["left", "right"] as const).every((side) => {
          const a = f.arms[side];
          const outward = side === "left" ? f.shoulderMid.x - a.wrist.x : a.wrist.x - f.shoulderMid.x;
          return (
            a.visible &&
            a.elbowAngle >= cfg.straightArmElbow &&
            outward > 1.5 * f.scale &&
            Math.abs(a.wrist.y - f.shoulderMid.y) < 0.8 * f.scale
          );
        });
      const held = hold.update(ok, f.timestamp);
      if (!ok) samples = [];
      else samples.push({ left: worldArmDistance(f, "left"), right: worldArmDistance(f, "right") });
      return {
        progress: progress(held, cfg.armHoldMs),
        done: held >= cfg.armHoldMs,
        hint: ok ? "Hold…" : "Arms straight, out to the sides",
      };
    },
    finish() {
      draft.armLength = { left: median(samples.map((s) => s.left)), right: median(samples.map((s) => s.right)) };
      onArmLength();
    },
  };
}

/** 3b. Arms pointed at the camera: how much extension the tracker can see in depth. */
export function armsForwardStep(cfg: CalibrationConfig, draft: ProfileDraft): FrameStep {
  const hold = new HoldTimer();
  let samples: { left: number; right: number }[] = [];
  const fallback = () => {
    draft.forwardExtension = { left: 0.9, right: 0.9 };
  };
  return {
    kind: "frames",
    id: "arms-forward",
    title: "Arms at the camera",
    instruction: "Point both arms straight at the camera and hold.",
    skippable: true,
    begin() {
      hold.reset();
      samples = [];
    },
    update(f) {
      const ok =
        f.tracked &&
        (["left", "right"] as const).every((side) => {
          const a = f.arms[side];
          // Pointing at the camera: straight-ish elbow, wrist near shoulder height, little sideways reach.
          return a.visible && a.elbowAngle >= cfg.straightArmElbow - 15 && a.reach < 1.2 && Math.abs(a.wrist.y - f.shoulderMid.y) < 0.8 * f.scale;
        });
      const held = hold.update(ok, f.timestamp);
      if (!ok) samples = [];
      else samples.push({ left: f.arms.left.extension, right: f.arms.right.extension });
      return {
        progress: progress(held, cfg.armHoldMs),
        done: held >= cfg.armHoldMs,
        hint: ok ? "Hold…" : "Both arms straight at the camera (S to skip)",
      };
    },
    finish() {
      if (samples.length === 0) return fallback();
      draft.forwardExtension = { left: median(samples.map((s) => s.left)), right: median(samples.map((s) => s.right)) };
    },
    skip: fallback,
  };
}

/** Turns a completed draft into a profile. Throws if a required step did not run. */
export function completeProfile(draft: ProfileDraft): CalibrationProfile {
  const { shoulderWidth, shoulderMid, nose, hipMid, torsoLength, armLength, forwardExtension } = draft;
  if (!shoulderWidth || !shoulderMid || !nose || !hipMid || !torsoLength || !armLength) {
    throw new Error("Calibration is incomplete");
  }
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    shoulderWidth,
    shoulderMid,
    nose,
    hipMid,
    torsoLength,
    armLength,
    forwardExtension: forwardExtension ?? { left: 0.9, right: 0.9 },
  };
}
