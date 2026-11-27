import type { BodyFrame } from "../../../core/body/bodyFrame";
import type { CalibrationProfile } from "../../../core/calibration/profile";
import type { BoxingConfig } from "../config";
import type { BoxingSignals, GuardState, SlipState } from "../types";

/** Neutral reference for slip and duck. Comes from calibration, then re-centers slowly. */
export interface DefenseBaseline {
  /** (nose.x - hipMid.x) / scale when neutral. */
  lean: number;
  /** shoulderMid.y when neutral, view units. */
  shoulderY: number;
  /** Torso length / scale, so torso length can follow the player's distance. */
  torsoRatio: number;
}

export function baselineFromProfile(p: CalibrationProfile, guard?: { lean: number; shoulderY: number }): DefenseBaseline {
  return {
    lean: guard?.lean ?? (p.nose.x - p.hipMid.x) / p.shoulderWidth,
    shoulderY: guard?.shoulderY ?? p.shoulderMid.y,
    torsoRatio: p.torsoLength / p.shoulderWidth,
  };
}

export interface DefenseEvent {
  type: "guard:high" | "guard:low" | "guard:none" | "slip:left" | "slip:right" | "slip:end" | "duck" | "duck:end";
  timestamp: number;
}

/** Guard, slip and duck. States with entry/exit events and hysteresis. */
export class DefenseDetector {
  private baseline: DefenseBaseline | null;
  private lastHipX: number | null = null;
  private lastT: number | null = null;
  readonly signals: BoxingSignals = { guard: "none", slip: null, duck: false, lean: 0, drop: 0 };

  constructor(
    private readonly cfg: BoxingConfig,
    baseline: DefenseBaseline | null = null,
  ) {
    this.baseline = baseline ? { ...baseline } : null;
  }

  /** Current neutral reference (for the debug view). */
  get currentBaseline(): Readonly<DefenseBaseline> | null {
    return this.baseline;
  }

  /** Forget timing after a jump in time (replay seek). Keeps the baseline. */
  reset(): void {
    this.lastT = null;
    Object.assign(this.signals, { guard: "none", slip: null, duck: false, lean: 0, drop: 0 });
  }

  update(f: BodyFrame): DefenseEvent[] {
    const events: DefenseEvent[] = [];
    const t = f.timestamp;
    if (!f.tracked || f.scale <= 0) {
      this.lastT = null;
      return events;
    }
    const cfg = this.cfg;
    const hipsVisible = f.visible.leftHip && f.visible.rightHip;
    if (hipsVisible) this.lastHipX = f.hipMid.x;
    const hipX = this.lastHipX ?? f.shoulderMid.x;
    const rawLean = (f.nose.x - hipX) / f.scale;

    if (!this.baseline) {
      // No calibration: take the first tracked frame as neutral.
      this.baseline = {
        lean: rawLean,
        shoulderY: f.shoulderMid.y,
        torsoRatio: hipsVisible && f.torsoLength > 0 ? f.torsoLength / f.scale : 1.5,
      };
    }
    const b = this.baseline;
    const torso = b.torsoRatio * f.scale;
    const lean = rawLean - b.lean;
    const drop = (f.shoulderMid.y - b.shoulderY) / torso;
    this.signals.lean = lean;
    this.signals.drop = drop;

    // Slip.
    const s = this.signals;
    const level = Math.abs(f.shoulderTilt) <= cfg.slipMaxTilt;
    let slip: SlipState = s.slip;
    if (slip === null) {
      if (level && lean <= -cfg.slipThreshold) slip = "left";
      else if (level && lean >= cfg.slipThreshold) slip = "right";
    } else if (Math.abs(lean) < cfg.slipThreshold * cfg.slipExitRatio || (slip === "left") !== lean < 0) {
      slip = null;
    }
    if (slip !== s.slip) {
      events.push({ type: slip ? `slip:${slip}` : "slip:end", timestamp: t });
      s.slip = slip;
    }

    // Duck.
    const duck = s.duck ? drop >= cfg.duckThreshold * cfg.duckExitRatio : drop >= cfg.duckThreshold;
    if (duck !== s.duck) {
      events.push({ type: duck ? "duck" : "duck:end", timestamp: t });
      s.duck = duck;
    }

    // Guard.
    const guard = this.guard(f, torso);
    if (guard !== s.guard) {
      events.push({ type: `guard:${guard}`, timestamp: t });
      s.guard = guard;
    }

    // Slowly re-center while the player is neutral, so shuffling and drifting don't read as slips or ducks.
    const dt = this.lastT === null ? 0 : t - this.lastT;
    this.lastT = t;
    if (
      cfg.baselineAdaptMs > 0 &&
      dt > 0 &&
      !s.slip &&
      !s.duck &&
      Math.abs(lean) < cfg.slipThreshold / 2 &&
      Math.abs(drop) < cfg.duckThreshold / 2
    ) {
      const k = Math.min(1, dt / cfg.baselineAdaptMs);
      b.lean += k * lean;
      b.shoulderY += k * (f.shoulderMid.y - b.shoulderY);
    }
    return events;
  }

  private guard(f: BodyFrame, torso: number): GuardState {
    const cfg = this.cfg;
    const l = f.arms.left, r = f.arms.right;
    if (!l.visible || !r.visible) return "none";
    const nearFace = (w: { x: number; y: number }) =>
      Math.hypot(w.x - f.nose.x, w.y - f.nose.y) <= cfg.guardRadius * f.scale &&
      w.y <= f.shoulderMid.y + cfg.guardMaxDrop * f.scale;
    if (nearFace(l.wrist) && nearFace(r.wrist)) return "high";
    const atChest = (w: { x: number; y: number }) =>
      w.y > f.shoulderMid.y + cfg.guardMaxDrop * f.scale &&
      w.y <= f.shoulderMid.y + cfg.lowGuardMaxDrop * torso &&
      Math.abs(w.x - f.shoulderMid.x) <= cfg.lowGuardMaxSide * f.scale;
    if (atChest(l.wrist) && atChest(r.wrist)) return "low";
    return "none";
  }
}
