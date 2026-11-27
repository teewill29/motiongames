import { BASE_POSE, GUARD_ARM, type ArmPose, type Pose } from "./puppet";

/**
 * Puppet animation clips as data. Each clip is keyframes over normalized time
 * (0 to 1); the renderer maps a fight state's elapsed time onto the clip.
 * Tells are big and slow on purpose: they must read from 8 feet away.
 */
export type Ease = "linear" | "in" | "out" | "inOut";

export interface Keyframe {
  at: number;
  ease?: Ease;
  pose: PosePatch;
}

export interface Clip {
  keys: Keyframe[];
  /** Loop period in ms for looping clips (guard, open, stunned...). */
  loopMs?: number;
}

export type PosePatch = Partial<Omit<Pose, "lead" | "rear">> & { lead?: Partial<ArmPose>; rear?: Partial<ArmPose> };

const arm = (p: Partial<ArmPose>): Partial<ArmPose> => p;
/** Hands dropped to the belly: the "not guarding" and exposed poses. */
const LOW_ARM = arm({ shoulder: 4, elbow: 150, reach: 0.65, foreReach: 0.8, glove: 1 });
const DROPPED = arm({ shoulder: 10, elbow: 40, reach: 1, foreReach: 1 });

export const CLIPS: Record<string, Clip> = {
  guard: {
    loopMs: 1400,
    keys: [
      { at: 0, ease: "inOut", pose: { y: 0 } },
      { at: 0.5, ease: "inOut", pose: { y: 0.012, headY: 0.004 } },
      { at: 1, pose: { y: 0 } },
    ],
  },
  relaxed: {
    loopMs: 1600,
    keys: [
      { at: 0, ease: "inOut", pose: { y: 0, lead: LOW_ARM, rear: LOW_ARM } },
      { at: 0.5, ease: "inOut", pose: { y: 0.015, x: 0.01, lead: LOW_ARM, rear: LOW_ARM } },
      { at: 1, pose: { y: 0, lead: LOW_ARM, rear: LOW_ARM } },
    ],
  },

  // Lazy jab (his left, screen right). Tell: drops the lead shoulder, pulls the glove back and down, shuffles in.
  "jab-windup": {
    keys: [
      { at: 0, ease: "inOut", pose: {} },
      { at: 0.6, ease: "inOut", pose: { lean: 9, x: 0.04, y: 0.02, headX: -0.01, lead: { shoulder: 40, elbow: 125, reach: 0.8, glove: 0.85 } } },
      { at: 1, pose: { lean: 12, x: 0.05, y: 0.03, lead: { shoulder: 48, elbow: 110, reach: 0.9, glove: 0.8 } } },
    ],
  },
  "jab-strike": {
    keys: [
      { at: 0, ease: "in", pose: { lean: 12, x: 0.05, y: 0.03, lead: { shoulder: 48, elbow: 110, reach: 0.9, glove: 0.8 } } },
      { at: 1, pose: { lean: -4, x: 0.01, scale: 1.12, lead: { shoulder: 150, elbow: 0, reach: 0.25, foreReach: 0.25, glove: 2.8 } } },
    ],
  },

  // Barn-door hook (his right, screen left). Tell: winds the whole arm wide and back, leans away, chin up.
  "hook-right-windup": {
    keys: [
      { at: 0, ease: "inOut", pose: {} },
      { at: 0.7, ease: "inOut", pose: { lean: 12, x: 0.05, headTilt: 10, rear: { shoulder: 85, elbow: 70, reach: 1, glove: 0.95 } } },
      { at: 1, pose: { lean: 15, x: 0.06, headTilt: 12, rear: { shoulder: 100, elbow: 60, reach: 1, glove: 0.95 } } },
    ],
  },
  "hook-right-strike": {
    keys: [
      { at: 0, ease: "in", pose: { lean: 15, x: 0.06, headTilt: 12, rear: { shoulder: 100, elbow: 60, reach: 1, glove: 0.95 } } },
      { at: 1, pose: { lean: -14, x: -0.04, scale: 1.14, headTilt: -8, rear: { shoulder: 80, elbow: 95, reach: 0.9, glove: 2.2 } } },
    ],
  },

  recover: {
    keys: [
      { at: 0, ease: "out", pose: { lean: -6, scale: 1.05 } },
      { at: 1, pose: {} },
    ],
  },
  // Overcommitted miss: stumbles forward and sideways.
  whiff: {
    keys: [
      { at: 0, ease: "out", pose: { lean: -14, scale: 1.1, x: -0.04 } },
      { at: 1, pose: { lean: -20, scale: 1.05, x: -0.08, y: 0.04, headTilt: -10, lead: LOW_ARM, rear: LOW_ARM } },
    ],
  },
  // Exposed: hands low, chin out, swaying. The counter window.
  open: {
    loopMs: 900,
    keys: [
      { at: 0, ease: "inOut", pose: { lean: -16, x: -0.07, y: 0.04, headTilt: -10, lead: DROPPED, rear: DROPPED } },
      { at: 0.5, ease: "inOut", pose: { lean: -10, x: -0.05, y: 0.05, headTilt: -4, lead: DROPPED, rear: DROPPED } },
      { at: 1, pose: { lean: -16, x: -0.07, y: 0.04, headTilt: -10, lead: DROPPED, rear: DROPPED } },
    ],
  },
  flinch: {
    keys: [
      { at: 0, ease: "out", pose: {} },
      { at: 0.3, ease: "inOut", pose: { headY: -0.03, headTilt: 14, lean: -5, scale: 0.97, lead: { glove: 0.9 }, rear: { glove: 0.9 } } },
      { at: 1, pose: {} },
    ],
  },
  stunned: {
    loopMs: 1100,
    keys: [
      { at: 0, ease: "inOut", pose: { lean: -10, headTilt: -18, y: 0.03, lead: LOW_ARM, rear: LOW_ARM } },
      { at: 0.5, ease: "inOut", pose: { lean: 10, headTilt: 16, y: 0.05, lead: LOW_ARM, rear: LOW_ARM } },
      { at: 1, pose: { lean: -10, headTilt: -18, y: 0.03, lead: LOW_ARM, rear: LOW_ARM } },
    ],
  },
  ko: {
    keys: [
      { at: 0, ease: "in", pose: { headTilt: 20, lean: 6 } },
      { at: 0.4, ease: "in", pose: { headTilt: 30, lean: 18, y: 0.05, lead: LOW_ARM, rear: LOW_ARM } },
      { at: 1, pose: { headTilt: 40, lean: 70, y: 0.9, x: 0.2, scale: 0.9, lead: { shoulder: 120, elbow: 20, reach: 1 }, rear: { shoulder: 140, elbow: 10, reach: 1 } } },
    ],
  },
  victory: {
    loopMs: 1000,
    keys: [
      { at: 0, ease: "inOut", pose: { headTilt: -6, lead: { shoulder: 160, elbow: 15, reach: 1 }, rear: { shoulder: 160, elbow: 15, reach: 1 } } },
      { at: 0.5, ease: "inOut", pose: { y: -0.02, headTilt: 6, lead: { shoulder: 170, elbow: 5, reach: 1 }, rear: { shoulder: 170, elbow: 5, reach: 1 } } },
      { at: 1, pose: { headTilt: -6, lead: { shoulder: 160, elbow: 15, reach: 1 }, rear: { shoulder: 160, elbow: 15, reach: 1 } } },
    ],
  },
};

const ease = (e: Ease | undefined, k: number) => {
  switch (e) {
    case "in":
      return k * k;
    case "out":
      return 1 - (1 - k) * (1 - k);
    case "inOut":
      return k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
    default:
      return k;
  }
};

export function resolvePatch(patch: PosePatch): Pose {
  return {
    ...BASE_POSE,
    ...patch,
    lead: { ...GUARD_ARM, ...patch.lead },
    rear: { ...GUARD_ARM, ...patch.rear },
  };
}

/** Pose of a clip at normalized time k (0-1). */
export function sampleClip(clip: Clip, k: number, lerp: (a: Pose, b: Pose, t: number) => Pose): Pose {
  const keys = clip.keys;
  const t = Math.min(1, Math.max(0, k));
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.at <= t) i++;
  const a = keys[i]!, b = keys[Math.min(i + 1, keys.length - 1)]!;
  const span = b.at - a.at;
  const local = span > 0 ? (t - a.at) / span : 1;
  return lerp(resolvePatch(a.pose), resolvePatch(b.pose), ease(a.ease, Math.min(1, Math.max(0, local))));
}
