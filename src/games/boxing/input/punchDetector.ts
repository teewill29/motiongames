import type { BodyFrame, Side } from "../../../core/body/bodyFrame";
import type { Vec2 } from "../../../core/body/geometry";
import type { BoxingConfig } from "../config";
import type { HandRole, PunchEvent, PunchTarget, PunchType } from "../types";

interface Sample {
  t: number;
  visible: boolean;
  /** Upper arm on-screen ratio: ~1 side-on, low when pointing at the camera. */
  ratio: number;
  /** Elbow below the shoulder line, scale units. */
  elbowDrop: number;
  elbow: number;
  wrist: Vec2;
  v: Vec2;
  speed: number;
  shoulderY: number;
  scale: number;
  torso: number;
}

interface Candidate {
  type: PunchType;
  score: number;
  /** Sample at the strongest point of the match. */
  peak: Sample;
  /** When the motion started (left guard). */
  startT: number;
}

const HISTORY_MS = 1000;

/**
 * Detects punches thrown by one hand. Feed it every BodyFrame in order.
 *
 * Each frame, an armed hand is checked against the straight, hook and uppercut
 * patterns. The first match opens a short decision window; when it closes the
 * strongest match fires. The hand then disarms until it slows down and comes
 * back toward guard, and the cooldown has passed.
 */
export class HandPunchDetector {
  private history: Sample[] = [];
  private armed = true;
  private lastFireT = -Infinity;
  private pending: { openedT: number; best: Map<PunchType, Candidate>; minRatio: number; maxLateral: number } | null = null;

  constructor(
    readonly side: Side,
    private readonly role: () => HandRole,
    private readonly cfg: BoxingConfig,
  ) {}

  reset(): void {
    this.history = [];
    this.armed = true;
    this.pending = null;
  }

  /** Whether the hand can throw (for the debug view). */
  get isArmed(): boolean {
    return this.armed;
  }

  update(frame: BodyFrame): PunchEvent | null {
    if (!frame.tracked) {
      this.reset();
      return null;
    }
    const s = this.sample(frame);
    this.history.push(s);
    while (this.history.length > 1 && s.t - this.history[0]!.t > HISTORY_MS) this.history.shift();

    const cfg = this.cfg;
    const { start } = this.thresholds();

    if (!this.armed && !this.pending) {
      // Back toward guard: upper arm no longer pointed at the camera, hand slowed down.
      if (s.visible && s.ratio > start && s.speed < cfg.rearmSpeed && s.t - this.lastFireT >= cfg.cooldownMs) {
        this.armed = true;
      }
    }

    if (this.armed && s.visible && s.t - this.lastFireT >= cfg.cooldownMs) {
      for (const c of this.candidates(s, frame)) {
        if (!this.pending) this.pending = { openedT: s.t, best: new Map(), minRatio: s.ratio, maxLateral: this.recentLateral(s.t) };
        const prev = this.pending.best.get(c.type);
        if (!prev || c.score > prev.score) this.pending.best.set(c.type, c);
      }
    }
    if (this.pending && s.visible) {
      this.pending.minRatio = Math.min(this.pending.minRatio, s.ratio);
      this.pending.maxLateral = Math.max(this.pending.maxLateral, this.lateral(s));
    }

    if (this.pending && s.t - this.pending.openedT >= cfg.decisionWindowMs) {
      const { best, minRatio, maxLateral } = this.pending;
      // An uppercut's target is where the fist tops out: wait while it's still rising.
      const onlyUppercut = best.size === 1 && best.has("uppercut");
      const rising = s.visible && -s.v.y > cfg.uppercutMinSpeed / 2;
      if (onlyUppercut && rising && s.t - this.pending.openedT < cfg.decisionWindowMs + cfg.uppercutPeakWaitMs) return null;
      this.pending = null;

      // Sideways speed separates straights from hooks: a jab barely moves the
      // wrist sideways, a cross sweeps moderately, a hook fast. A tight hook
      // also points the upper arm at the camera, so it can look like a straight.
      const lateralCeiling = this.role() === "lead" ? cfg.jabMaxLateral : cfg.crossMaxLateral;
      const fastSweep = maxLateral > lateralCeiling;
      const straight = best.get("jab") ?? best.get("cross");
      if (straight && fastSweep) {
        best.delete(straight.type);
        if (!best.has("hook")) best.set("hook", { ...straight, type: "hook", score: maxLateral / lateralCeiling });
      }
      // A wide hook keeps the upper arm side-on. If it turned toward the camera
      // without a fast sweep, it was a cross starting with a sideways sweep.
      if (best.has("hook") && !fastSweep && minRatio < cfg.hookMinUpperRatio) best.delete("hook");
      const stillStraight = fastSweep ? undefined : straight;
      const winner = stillStraight ?? [...best.values()].sort((a, b) => b.score - a.score)[0];
      if (winner) return this.fire(winner);
    }
    return null;
  }

  /** Straight-punch thresholds for this hand's role. */
  private thresholds(): { start: number; peak: number } {
    const lead = this.role() === "lead";
    return lead
      ? { start: this.cfg.jabStartRatio, peak: this.cfg.jabPeakRatio }
      : { start: this.cfg.crossStartRatio, peak: this.cfg.crossPeakRatio };
  }

  private sample(f: BodyFrame): Sample {
    const a = f.arms[this.side];
    // Hips can drop out of view; fall back to a typical torso proportion.
    const torso = f.visible.leftHip && f.visible.rightHip && f.torsoLength > 0 ? f.torsoLength : 1.5 * f.scale;
    const speed = Math.hypot(a.wristVelocityBody.x, a.wristVelocityBody.y);
    return {
      t: f.timestamp,
      // A wrist moving impossibly fast is the tracker jumping, not a punch.
      visible: a.visible && speed <= this.cfg.maxWristSpeed,
      ratio: a.upperArmRatio,
      elbowDrop: (a.elbow.y - f.shoulderMid.y) / f.scale,
      elbow: a.elbowAngle,
      wrist: a.wrist,
      // Body-relative, so slips and ducks with the hands up don't read as hooks or uppercuts.
      v: a.wristVelocityBody,
      speed,
      shoulderY: f.shoulderMid.y,
      scale: f.scale,
      torso,
    };
  }

  /** Sideways wrist speed toward the body's centerline. */
  private lateral(s: Sample): number {
    return s.v.x * (this.side === "left" ? 1 : -1);
  }

  /** Fastest sideways speed toward the centerline since the motion began (a hook's sweep can precede the match). */
  private recentLateral(now: number): number {
    const start = this.motionStart(this.history[this.history.length - 1]!);
    let max = 0;
    for (const h of this.history) if (h.t >= start && h.t <= now && h.visible) max = Math.max(max, this.lateral(h));
    return max;
  }

  /** Latest time before now that the hand was moving slowly: where the motion began. */
  private motionStart(now: Sample): number {
    for (let i = this.history.length - 2; i >= 0; i--) {
      const h = this.history[i]!;
      if (h.speed < this.cfg.rearmSpeed) return h.t;
    }
    return this.history[0]?.t ?? now.t;
  }

  private candidates(s: Sample, frame: BodyFrame): Candidate[] {
    const cfg = this.cfg;
    const out: Candidate[] = [];
    const towardCenter = this.side === "left" ? 1 : -1; // view space: left hand's centerline is +x

    // Straight (jab with the lead hand, cross with the rear): the upper arm swings
    // to point at the camera, with the elbow raised near shoulder height.
    const { start: startRatio, peak: peakRatio } = this.thresholds();
    if (s.ratio <= peakRatio && s.elbowDrop <= cfg.straightMaxElbowDrop) {
      let start: Sample | null = null;
      for (let i = this.history.length - 2; i >= 0; i--) {
        const h = this.history[i]!;
        if (s.t - h.t > cfg.straightMaxRiseMs) break;
        if (h.visible && h.ratio > startRatio) {
          start = h;
          break;
        }
      }
      if (start) {
        const outward = (-(s.wrist.x - start.wrist.x) * towardCenter) / s.scale;
        if (outward <= cfg.straightMaxOutward) {
          out.push({
            type: this.role() === "lead" ? "jab" : "cross",
            score: (startRatio - s.ratio) / Math.max(0.01, startRatio - peakRatio),
            peak: s,
            startT: start.t,
          });
        }
      }
    }

    const atOrAboveShoulder = s.wrist.y <= s.shoulderY + cfg.headTolerance * s.scale;

    // Hook.
    const lateral = s.v.x * towardCenter;
    if (
      s.elbow >= cfg.hookMinElbow &&
      s.elbow <= cfg.hookMaxElbow &&
      s.ratio >= cfg.hookMinUpperRatio &&
      lateral >= cfg.hookMinSpeed &&
      atOrAboveShoulder
    ) {
      out.push({ type: "hook", score: lateral / cfg.hookMinSpeed, peak: s, startT: this.motionStart(s) });
    }

    // Uppercut.
    const up = -s.v.y;
    const otherUp = -frame.arms[this.side === "left" ? "right" : "left"].wristVelocityBody.y;
    if (
      up >= cfg.uppercutMinSpeed &&
      up >= cfg.uppercutMinVerticalRatio * Math.abs(s.v.x) &&
      otherUp < cfg.uppercutOtherHandMaxSpeed &&
      s.elbow >= cfg.uppercutMinElbow &&
      s.elbow <= cfg.uppercutMaxElbow
    ) {
      const startedLow = this.history.some((h) => s.t - h.t <= cfg.uppercutLookbackMs && h.wrist.y > h.shoulderY);
      if (startedLow) out.push({ type: "uppercut", score: up / cfg.uppercutMinSpeed, peak: s, startT: this.motionStart(s) });
    }
    return out;
  }

  private target(p: Sample): PunchTarget | null {
    if (p.wrist.y <= p.shoulderY + this.cfg.headTolerance * p.scale) return "head";
    if (p.wrist.y <= p.shoulderY + this.cfg.bodyMaxDrop * p.torso) return "body";
    return null;
  }

  private fire(c: Candidate): PunchEvent | null {
    // Uppercuts match mid-swing, so their target height is the highest point since.
    let top = c.peak;
    if (c.type === "uppercut") for (const h of this.history) if (h.t >= c.peak.t && h.visible && h.wrist.y < top.wrist.y) top = h;
    const target = this.target(top);
    this.armed = false;
    this.lastFireT = c.peak.t;
    if (!target) return null;
    const peakSpeed = Math.max(
      ...this.history.filter((h) => h.t >= c.startT && h.t <= c.peak.t).map((h) => h.speed),
      c.peak.speed,
    );
    return {
      type: c.type,
      hand: this.side,
      role: this.role(),
      target,
      snapMs: Math.round(c.peak.t - c.startT),
      speed: peakSpeed,
      score: c.score,
      timestamp: c.peak.t,
    };
  }
}
