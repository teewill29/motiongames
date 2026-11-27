// Builds geometrically exact poses for tests, without a camera.
// Only `import type` here, so Node can run it directly with type stripping
// (scripts/make-synthetic-fixture.ts uses it).
import type { Landmark, RawPose, RawPoseFrame } from "../../src/core/pose/types";

export type V3 = [number, number, number];

export const UPPER_ARM = 0.3;
export const FOREARM = 0.27;
export const ARM_LENGTH = UPPER_ARM + FOREARM;
const SHOULDER_HALF = 0.18;

/** Direction presets in MediaPipe world axes: +x image right, +y down, -z toward the camera. */
export const DIR = {
  forward: [0, 0, -1] as V3,
  down: [0, 1, 0] as V3,
  up: [0, -1, 0] as V3,
};

export interface ArmPose {
  /** Unit vector shoulder -> elbow. */
  upper: V3;
  /** Unit vector elbow -> wrist. */
  fore: V3;
}

export const ARM_STRAIGHT_FORWARD: ArmPose = { upper: DIR.forward, fore: DIR.forward };
/** Upper arm hanging down, forearm pointing at the camera: 90° elbow. */
export const ARM_BENT_90: ArmPose = { upper: DIR.down, fore: DIR.forward };

export interface SyntheticPoseOptions {
  left?: ArmPose;
  right?: ArmPose;
  /** Shift the whole body in world meters (x is image-right). */
  offset?: V3;
  /** World meters -> image-height units. Bigger = closer to the camera. */
  scale?: number;
  visibility?: number;
  aspect?: number;
}

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Interpolates between two arm poses (direction vectors renormalized). */
export function lerpArm(a: ArmPose, b: ArmPose, t: number): ArmPose {
  const mix = (u: V3, v: V3): V3 => {
    const m: V3 = [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
    const n = Math.hypot(...m) || 1;
    return [m[0] / n, m[1] / n, m[2] / n];
  };
  return { upper: mix(a.upper, b.upper), fore: mix(a.fore, b.fore) };
}

/**
 * A person facing the camera. Their left side is at +x in MediaPipe world and
 * image coordinates (the camera sees them un-mirrored).
 */
export function syntheticPose(opts: SyntheticPoseOptions = {}): RawPose {
  const off = opts.offset ?? [0, 0, 0];
  const scale = opts.scale ?? 0.9;
  const vis = opts.visibility ?? 0.99;
  const aspect = opts.aspect ?? 16 / 9;
  const world: V3[] = Array.from({ length: 33 }, () => [0, 0, 0] as V3);

  const ls: V3 = [SHOULDER_HALF, -0.5, 0];
  const rs: V3 = [-SHOULDER_HALF, -0.5, 0];
  world[0] = [0, -0.68, -0.05]; // nose
  for (let i = 1; i <= 10; i++) world[i] = [((i % 2) - 0.5) * 0.06, -0.7, -0.04]; // face
  world[11] = ls;
  world[12] = rs;
  const arm = (shoulder: V3, pose: ArmPose, elbowIdx: number, wristIdx: number) => {
    const elbow = add(shoulder, pose.upper, UPPER_ARM);
    const wrist = add(elbow, pose.fore, FOREARM);
    world[elbowIdx] = elbow;
    world[wristIdx] = wrist;
    for (const h of elbowIdx === 13 ? [17, 19, 21] : [18, 20, 22]) world[h] = add(wrist, pose.fore, 0.05);
  };
  arm(ls, opts.left ?? ARM_BENT_90, 13, 15);
  arm(rs, opts.right ?? ARM_BENT_90, 14, 16);
  world[23] = [0.1, 0, 0];
  world[24] = [-0.1, 0, 0];
  for (let i = 25; i <= 32; i++) world[i] = [i % 2 ? 0.1 : -0.1, 0.4 + (i >= 27 ? 0.4 : 0), 0];

  const shifted = world.map((p) => add(p, off));
  const toLm = (p: V3): Landmark => ({ x: p[0], y: p[1], z: p[2], visibility: vis });
  // Orthographic projection into normalized image coordinates.
  const image = shifted.map(
    (p): Landmark => ({ x: 0.5 + (p[0] * scale) / aspect, y: 0.55 + p[1] * scale, z: (p[2] * scale) / aspect, visibility: vis }),
  );
  return { image, world: world.map(toLm) };
}

export function frameAt(timestamp: number, pose: RawPose | null, aspect = 16 / 9): RawPoseFrame {
  return { timestamp, pose, imageAspect: aspect };
}

/**
 * `count` jabs with the given arm: guard (90°) -> straight -> guard, each taking
 * `punchMs`, separated by `restMs` in guard. Sampled at `fps`.
 */
export function syntheticJabs(opts: {
  side: "left" | "right";
  count: number;
  fps?: number;
  punchMs?: number;
  restMs?: number;
}): RawPoseFrame[] {
  const fps = opts.fps ?? 30;
  const punchMs = opts.punchMs ?? 300;
  const restMs = opts.restMs ?? 700;
  const cycle = punchMs + restMs;
  const total = opts.count * cycle + restMs;
  const frames: RawPoseFrame[] = [];
  for (let t = 0; t <= total; t += 1000 / fps) {
    const inCycle = (t - restMs) % cycle;
    const n = Math.floor((t - restMs) / cycle);
    let k = 0; // 0 = guard, 1 = full extension
    if (t >= restMs && n < opts.count && inCycle < punchMs) k = Math.sin((inCycle / punchMs) * Math.PI);
    const arm = lerpArm(ARM_BENT_90, ARM_STRAIGHT_FORWARD, k);
    const pose = syntheticPose(opts.side === "left" ? { left: arm } : { right: arm });
    frames.push(frameAt(Math.round(t * 10) / 10, pose));
  }
  return frames;
}
