import type { Side } from "../../core/body/bodyFrame";

export type Stance = "orthodox" | "southpaw";
export type HandRole = "lead" | "rear";
export type PunchType = "jab" | "cross" | "hook" | "uppercut";
export type PunchTarget = "head" | "body";
export type GuardState = "high" | "low" | "none";
export type SlipState = "left" | "right" | null;

/** Lead hand per stance: orthodox leads with the left. */
export function leadSide(stance: Stance): Side {
  return stance === "orthodox" ? "left" : "right";
}

export function roleOf(side: Side, stance: Stance): HandRole {
  return side === leadSide(stance) ? "lead" : "rear";
}

export interface PunchEvent {
  type: PunchType;
  hand: Side;
  role: HandRole;
  target: PunchTarget;
  /** ms from leaving guard to the punch peak. Logic uses it for damage. */
  snapMs: number;
  /** Peak wrist speed, scale units/s. */
  speed: number;
  /** How far past its threshold the match was (1 = just made it). */
  score: number;
  /** BodyFrame timestamp of the peak. */
  timestamp: number;
}

/** Continuous defensive state, read every frame by logic. */
export interface BoxingSignals {
  guard: GuardState;
  slip: SlipState;
  duck: boolean;
  /** Head offset from center, scale units; negative = player's left. */
  lean: number;
  /** Shoulder drop below baseline, torso lengths. */
  drop: number;
}
