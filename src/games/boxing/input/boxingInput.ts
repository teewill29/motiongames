import type { BodyFrame } from "../../../core/body/bodyFrame";
import type { InputEvent } from "../../../core/events/inputEvents";
import type { BoxingConfig } from "../config";
import { roleOf, type BoxingSignals, type PunchEvent, type Stance } from "../types";
import { DefenseDetector, type DefenseBaseline, type DefenseEvent } from "./defenseDetector";
import { HandPunchDetector } from "./punchDetector";

export interface BoxingInputResult {
  punches: PunchEvent[];
  defense: DefenseEvent[];
  signals: BoxingSignals;
}

/**
 * The boxing input layer: BodyFrames in, punch and defense events plus
 * continuous signals out. Logic reads this; it never sees the camera.
 */
export class BoxingInput {
  private readonly hands: [HandPunchDetector, HandPunchDetector];
  private readonly defense: DefenseDetector;
  private lastPunchT = -Infinity;

  constructor(
    private readonly cfg: BoxingConfig,
    private stance: Stance,
    baseline: DefenseBaseline | null = null,
  ) {
    this.hands = [
      new HandPunchDetector("left", () => roleOf("left", this.stance), cfg),
      new HandPunchDetector("right", () => roleOf("right", this.stance), cfg),
    ];
    this.defense = new DefenseDetector(cfg, baseline);
  }

  get baseline() {
    return this.defense.currentBaseline;
  }

  /** Call after a jump in time (replay seek). */
  reset(): void {
    for (const h of this.hands) h.reset();
    this.defense.reset();
  }

  setStance(stance: Stance): void {
    this.stance = stance;
  }

  get signals(): BoxingSignals {
    return this.defense.signals;
  }

  armed(side: "left" | "right"): boolean {
    return this.hands[side === "left" ? 0 : 1].isArmed;
  }

  /** An arm is out in a straight (upper arm turned toward the camera) or a punch just landed. */
  private punching(frame: BodyFrame): boolean {
    if (frame.timestamp - this.lastPunchT < this.cfg.slipPunchLockoutMs) return true;
    return (["left", "right"] as const).some((side) => {
      const start = roleOf(side, this.stance) === "lead" ? this.cfg.jabStartRatio : this.cfg.crossStartRatio;
      const a = frame.arms[side];
      return a.visible && a.upperArmRatio < start;
    });
  }

  update(frame: BodyFrame): BoxingInputResult {
    const punches: PunchEvent[] = [];
    for (const h of this.hands) {
      const p = h.update(frame);
      if (p) punches.push(p);
    }
    if (punches.length) this.lastPunchT = frame.timestamp;
    const defense = this.defense.update(frame, this.punching(frame));
    return { punches, defense, signals: this.defense.signals };
  }
}

/** Converts results to generic events for the debug overlay. */
export function toInputEvents(r: BoxingInputResult): InputEvent[] {
  return [
    ...r.punches.map(
      (p): InputEvent => ({
        type: `punch:${p.type}`,
        timestamp: p.timestamp,
        data: { hand: p.hand, target: p.target, snapMs: p.snapMs, speed: Math.round(p.speed * 10) / 10 },
      }),
    ),
    ...r.defense.map((d): InputEvent => ({ type: d.type, timestamp: d.timestamp })),
  ];
}
