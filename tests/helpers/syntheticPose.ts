// Builds geometrically exact poses for tests, without a camera.
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
  /** Shift head, shoulders and arms only (a lean or a waist bend), world meters. */
  upper?: V3;
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

  const upper = opts.upper ?? [0, 0, 0];
  for (let i = 0; i <= 22; i++) world[i] = add(world[i]!, upper);
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

// ---- Boxing motions ----
// Poses are given for the person's LEFT arm (+x is their left, outward).
// mirrorArm() turns one into the right-arm version.

const norm = (v: V3): V3 => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const arm = (upper: V3, fore: V3): ArmPose => ({ upper: norm(upper), fore: norm(fore) });

export const LEFT = {
  guard: arm([-0.2, 0.75, -0.6], [-0.3, -1.0, -0.35]),
  straight: arm([-0.15, 0.05, -1], [-0.15, 0.05, -1]),
  /** Straight punch to the body: aimed lower. */
  straightBody: arm([-0.15, 0.45, -1], [-0.15, 0.45, -1]),
  hookWind: arm([0.8, 0.1, -0.3], [0.1, -0.3, -1]),
  /** Fist finishes in front of the face, at the centerline. */
  hookFinish: arm([0.3, 0.1, -0.9], [-1, -0.3, -0.2]),
  uppercutDip: arm([0, 1, -0.2], [0, 0.2, -1]),
  uppercutFinish: arm([0, 0.3, -1], [0, -1, -0.2]),
  sideways: arm([1, 0, 0], [1, 0, 0]),
  down: arm([0.05, 1, 0], [0.05, 1, 0]),
};

export function mirrorArm(a: ArmPose): ArmPose {
  return { upper: [-a.upper[0], a.upper[1], a.upper[2]], fore: [-a.fore[0], a.fore[1], a.fore[2]] };
}

export type Pose = keyof typeof LEFT;

export interface Keyframe {
  /** ms */
  t: number;
  left?: Pose;
  right?: Pose;
  /** Upper-body shift (lean or bend), world meters. */
  upper?: V3;
}

/**
 * Samples a keyframed motion at `fps`. Arms and upper-body shift interpolate
 * linearly between keyframes; omitted fields hold the previous value.
 */
export function animate(keys: Keyframe[], opts: { fps?: number; scale?: number } = {}): RawPoseFrame[] {
  const fps = opts.fps ?? 30;
  // Fill omitted fields forward.
  const full: Required<Keyframe>[] = [];
  let prev: Required<Keyframe> = { t: 0, left: "guard", right: "guard", upper: [0, 0, 0] };
  for (const k of keys) {
    prev = { t: k.t, left: k.left ?? prev.left, right: k.right ?? prev.right, upper: k.upper ?? prev.upper };
    full.push(prev);
  }
  const end = full[full.length - 1]!.t;
  const frames: RawPoseFrame[] = [];
  for (let t = 0; t <= end + 1e-6; t += 1000 / fps) {
    let i = 0;
    while (i < full.length - 2 && full[i + 1]!.t <= t) i++;
    const a = full[i]!, b = full[Math.min(i + 1, full.length - 1)]!;
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    const left = lerpArm(LEFT[a.left], LEFT[b.left], k);
    const right = mirrorArm(lerpArm(LEFT[a.right], LEFT[b.right], k));
    const upper: V3 = [
      a.upper[0] + (b.upper[0] - a.upper[0]) * k,
      a.upper[1] + (b.upper[1] - a.upper[1]) * k,
      a.upper[2] + (b.upper[2] - a.upper[2]) * k,
    ];
    frames.push(frameAt(Math.round(t * 10) / 10, syntheticPose({ left, right, upper, scale: opts.scale ?? 0.65 })));
  }
  return frames;
}

/** Repeats a punch `count` times from guard: out over `outMs`, back over `backMs`, rest `restMs`. */
export function punchSeries(opts: {
  side: "left" | "right";
  path: Pose[];
  count: number;
  stepMs?: number[];
  restMs?: number;
  leadInMs?: number;
}): Keyframe[] {
  const rest = opts.restMs ?? 600;
  const steps = opts.stepMs ?? opts.path.map(() => 120);
  const keys: Keyframe[] = [{ t: 0 }, { t: opts.leadInMs ?? 800 }];
  let t = keys[1]!.t;
  for (let n = 0; n < opts.count; n++) {
    opts.path.forEach((pose, i) => {
      t += steps[i]!;
      keys.push({ t, [opts.side]: pose });
    });
    t += 150;
    keys.push({ t, [opts.side]: "guard" });
    t += rest;
    keys.push({ t, [opts.side]: "guard" });
  }
  return keys;
}
