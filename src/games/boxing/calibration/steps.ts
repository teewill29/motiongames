import type { BodyFrame, Side } from "../../../core/body/bodyFrame";
import type { CalibrationConfig } from "../../../core/calibration/config";
import { HoldTimer, median, MotionMeter } from "../../../core/calibration/hold";
import type { ChoiceStep, FrameStep } from "../../../core/calibration/runner";
import type { ProfileDraft } from "../../../core/calibration/steps";
import { leadSide, type Stance } from "../types";
import type { BoxingCalibration, PunchSample } from "./boxingCalibration";

/** Boxing calibration under construction. */
export interface BoxingDraft {
  stance: Stance;
  guard?: BoxingCalibration["guard"];
  punches: BoxingCalibration["punches"];
  slip: BoxingCalibration["slip"];
  duck: number | null;
}

export function newBoxingDraft(stance: Stance): BoxingDraft {
  return { stance, punches: { jab: [], cross: [] }, slip: { left: null, right: null }, duck: null };
}

/** Head lean relative to the hips, as the slip detector measures it. */
const rawLean = (f: BodyFrame) => (f.nose.x - f.hipMid.x) / f.scale;

export function stanceStep(draft: BoxingDraft, onChange: (s: Stance) => void): ChoiceStep {
  return {
    kind: "choice",
    id: "stance",
    title: "Choose your stance",
    instruction: "Orthodox leads with the left hand (jab with the left). Southpaw leads with the right.",
    choices: [
      { key: "1", label: "Orthodox (left lead)", value: "orthodox" },
      { key: "2", label: "Southpaw (right lead)", value: "southpaw" },
    ],
    choose(value) {
      draft.stance = value === "southpaw" ? "southpaw" : "orthodox";
      onChange(draft.stance);
    },
  };
}

export function guardStep(cfg: CalibrationConfig, draft: BoxingDraft): FrameStep {
  const hold = new HoldTimer();
  const motion = new MotionMeter();
  let samples: BodyFrame[] = [];
  return {
    kind: "frames",
    id: "guard",
    title: "Hands up",
    instruction: "Get in your fighting stance with your guard up by your face, and hold.",
    skippable: false,
    begin() {
      hold.reset();
      motion.reset();
      samples = [];
    },
    update(f) {
      const speed = motion.update(f);
      const handsUp =
        f.tracked &&
        (["left", "right"] as const).every((side) => {
          const a = f.arms[side];
          // Loose: wrists roughly at face height and not far from the head.
          return a.visible && a.wrist.y < f.shoulderMid.y + 0.6 * f.scale && Math.hypot(a.wrist.x - f.nose.x, a.wrist.y - f.nose.y) < 1.4 * f.scale;
        });
      const ok = handsUp && speed < cfg.stillSpeed;
      const held = hold.update(ok, f.timestamp);
      if (!ok) samples = [];
      else samples.push(f);
      return {
        progress: Math.min(1, held / cfg.guardHoldMs),
        done: held >= cfg.guardHoldMs && samples.length > 0,
        hint: !handsUp ? "Hands up by your face" : ok ? "Hold…" : "Hold still",
      };
    },
    finish() {
      const arm = (side: Side) => ({
        ext: median(samples.map((f) => f.arms[side].extension)),
        elbow: median(samples.map((f) => f.arms[side].elbowAngle)),
        upperRatio: median(samples.map((f) => f.arms[side].upperArmRatio)),
      });
      const wristNose = samples.flatMap((f) =>
        (["left", "right"] as const).map((s) => Math.hypot(f.arms[s].wrist.x - f.nose.x, f.arms[s].wrist.y - f.nose.y) / f.scale),
      );
      draft.guard = {
        left: arm("left"),
        right: arm("right"),
        maxWristNose: Math.max(...wristNose),
        maxWristDrop: Math.max(
          ...samples.flatMap((f) => (["left", "right"] as const).map((s) => (f.arms[s].wrist.y - f.shoulderMid.y) / f.scale)),
        ),
        lean: median(samples.map(rawLean)),
        shoulderY: median(samples.map((f) => f.shoulderMid.y)),
      };
    },
  };
}

/**
 * Throw N straight punches with the lead (jab) or rear (cross) hand. A punch is
 * the upper arm turning toward the camera: its on-screen ratio dropping
 * `punchMargin` below the guard value, then recovering.
 */
export function punchStep(cfg: CalibrationConfig, draft: BoxingDraft, kind: "jab" | "cross"): FrameStep {
  let samples: PunchSample[] = [];
  let inPunch = false;
  let restT = 0;
  let peak: { ratio: number; elbowDrop: number; wristDrop: number; ext: number; t: number; speed: number } | null = null;
  const side = (): Side => {
    const lead = leadSide(draft.stance);
    return kind === "jab" ? lead : lead === "left" ? "right" : "left";
  };
  return {
    kind: "frames",
    id: kind,
    title: kind === "jab" ? "Throw jabs" : "Throw crosses",
    instruction: `From your guard, throw ${cfg.punchesPerType} ${kind === "jab" ? "jabs" : "crosses"} straight at the camera with your ${kind === "jab" ? "lead" : "rear"} hand. Bring the hand back to guard each time.`,
    skippable: false,
    begin() {
      samples = [];
      inPunch = false;
      peak = null;
    },
    update(f) {
      const g = draft.guard?.[side()];
      const a = f.arms[side()];
      const need = cfg.punchesPerType;
      const status = () => ({
        progress: samples.length / need,
        done: samples.length >= need,
        hint: `${samples.length} of ${need}: ${side()} hand`,
      });
      if (!g || !f.tracked || !a.visible) return status();
      const speed = Math.hypot(a.wristVelocityBody.x, a.wristVelocityBody.y);
      const elbowDrop = (a.elbow.y - f.shoulderMid.y) / f.scale;
      const wristDrop = (a.wrist.y - f.shoulderMid.y) / f.scale;
      const r = a.upperArmRatio;
      if (!inPunch) {
        if (r >= g.upperRatio - cfg.punchMargin * 0.3) restT = f.timestamp;
        if (r < g.upperRatio - cfg.punchMargin) {
          inPunch = true;
          peak = { ratio: r, elbowDrop, wristDrop, ext: a.extension, t: f.timestamp, speed };
        }
      } else if (peak) {
        if (r < peak.ratio) peak = { ratio: r, elbowDrop, wristDrop, ext: Math.max(peak.ext, a.extension), t: f.timestamp, speed: Math.max(peak.speed, speed) };
        else peak.speed = Math.max(peak.speed, speed);
        if (r > g.upperRatio - cfg.punchMargin * 0.5) {
          const riseMs = peak.t - restT;
          // A slow drift of the arm is tracking noise or a reach, not a punch.
          if (riseMs <= cfg.punchMaxRiseMs) {
            samples.push({ minRatio: peak.ratio, elbowDrop: peak.elbowDrop, wristDrop: peak.wristDrop, peakExt: peak.ext, riseMs, peakSpeed: peak.speed });
          }
          inPunch = false;
          peak = null;
        }
      }
      return status();
    },
    finish() {
      draft.punches[kind] = samples;
    },
  };
}

export function slipStep(cfg: CalibrationConfig, draft: BoxingDraft, dir: "left" | "right"): FrameStep {
  let best = 0;
  let current = 0;
  return {
    kind: "frames",
    id: `slip-${dir}`,
    title: `Slip ${dir}`,
    instruction: `From your guard, slip to your ${dir}: lean your head and shoulders to your ${dir} as if dodging a punch, then come back to center.`,
    skippable: true,
    begin() {
      best = 0;
      current = 0;
    },
    update(f) {
      if (f.tracked && draft.guard && f.visible.leftHip && f.visible.rightHip) {
        const lean = rawLean(f) - draft.guard.lean;
        current = dir === "left" ? -lean : lean; // view space: player's left is -x
        best = Math.max(best, current);
      }
      const reached = best >= cfg.minSlip;
      return {
        progress: reached ? (current < best * 0.5 ? 1 : 0.7) : Math.min(0.6, best / cfg.minSlip * 0.6),
        done: reached && current < best * 0.5,
        hint: !reached ? `Lean to your ${dir}` : current < best * 0.5 ? "Good" : "Now back to center",
      };
    },
    finish() {
      draft.slip[dir] = best;
    },
    skip() {
      draft.slip[dir] = null;
    },
  };
}

export function duckStep(cfg: CalibrationConfig, draft: BoxingDraft, profile: ProfileDraft): FrameStep {
  let best = 0;
  let current = 0;
  return {
    kind: "frames",
    id: "duck",
    title: "Duck",
    instruction: "From your guard, duck: bend your knees and drop under an imaginary hook, then come back up.",
    skippable: true,
    begin() {
      best = 0;
      current = 0;
    },
    update(f) {
      if (f.tracked && draft.guard && profile.torsoLength && profile.shoulderWidth) {
        const torso = (profile.torsoLength / profile.shoulderWidth) * f.scale;
        current = (f.shoulderMid.y - draft.guard.shoulderY) / torso;
        best = Math.max(best, current);
      }
      const reached = best >= cfg.minDuck;
      return {
        progress: reached ? (current < best * 0.5 ? 1 : 0.7) : Math.min(0.6, best / cfg.minDuck * 0.6),
        done: reached && current < best * 0.5,
        hint: !reached ? "Duck down" : current < best * 0.5 ? "Good" : "Now come back up",
      };
    },
    finish() {
      draft.duck = best;
    },
    skip() {
      draft.duck = null;
    },
  };
}

export function completeBoxingCalibration(d: BoxingDraft): BoxingCalibration {
  if (!d.guard) throw new Error("Guard step did not run");
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    stance: d.stance,
    guard: d.guard,
    punches: d.punches,
    slip: d.slip,
    duck: d.duck,
  };
}
