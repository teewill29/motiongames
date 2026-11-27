import type { TunableSpecs } from "../../../core/tuning/tunables";

/** Fight rules. Starting values from docs/boxing.md; tunable from the debug overlay. */
export const fightConfig = {
  playerHealth: 100,
  /**
   * The player's defense counts if it was held at any moment in this window
   * before impact (ms). Covers tracking lag (~100 ms) and reaction slop, so
   * reading the tell and defending in time feels fair.
   */
  defenseWindowMs: 300,
  /** Default open window after a clean defense, when the fighter has no recoveryMs. */
  openMs: 800,
  /** A block is not a whiff: the open window after a clean block is this fraction of a slip or duck's. */
  blockOpenFactor: 0.6,
  counterMultiplier: 2,
  /** Fraction of damage a punch into the opponent's guard deals. */
  blockedDamage: 0.1,
  comboWindowMs: 600,
  comboStep: 0.1,
  comboMax: 0.5,
  /** Faster punches deal up to this much more damage. */
  snapBonusMax: 0.2,
  snapFastMs: 100,
  snapSlowMs: 300,
  /** Clean hits in a chain (each within stunChainMs of the last) that stun the opponent. */
  stunHits: 5,
  stunChainMs: 1500,
  stunMs: 1500,
  flinchMs: 250,
  recoverMs: 450,
  whiffMs: 300,
  /** Gap between attacks inside one pattern. */
  comboGapMs: 350,
  /** How often the opponent re-decides whether to hold his guard up while waiting. */
  guardRerollMs: 1200,
  countdownMs: 3000,
  /** Lost tracking this long mid-fight pauses the game. */
  lostTrackingPauseMs: 1000,
  punchJab: 3,
  punchCross: 5,
  punchHook: 7,
  punchUppercut: 8,

  // Player stamina.
  staminaMax: 100,
  costJab: 3,
  costCross: 5,
  costHook: 6,
  costUppercut: 7,
  staminaRegenPerSec: 12,
  /** Regen starts this long after the last punch. */
  staminaRegenDelayMs: 500,
  /** Below this, punches deal lowStaminaDamage × damage and the screen edges dim. */
  lowStamina: 25,
  lowStaminaDamage: 0.5,
  /** At 0 stamina punches don't register until stamina is back above this. */
  exhaustedRecover: 10,

  // Opponent stamina.
  /** Each body shot that lands drains this much opponent stamina. */
  bodyStaminaDrain: 8,
  opponentStaminaRegenPerSec: 4,
  /** Below this fraction of stamina he's tired: slower tells, longer openings. */
  opponentTiredAt: 0.3,
  opponentTiredSlowdown: 1.3,

  // Knockdowns.
  /** One referee count, ms. */
  countMs: 1000,
  /** Punches to fill the get-up meter on the first knockdown... */
  getUpPunches: 20,
  /** ...plus this many for each knockdown after the first. */
  getUpPunchesExtra: 5,
  /** Player health after getting up. */
  getUpHealth: 40,
  /** Opponent health after getting up, as a fraction of max. */
  opponentGetUpHealth: 0.4,
  /** Knockdowns in one round that end the fight (TKO). */
  tkoKnockdowns: 3,
  /** Pause after someone gets up, before fighting resumes. */
  resumeMs: 1500,

  // Rests between rounds.
  restHealth: 15,
};

export type FightConfig = typeof fightConfig;

/** Fight format, from the boxing settings. */
export interface FightFormat {
  rounds: number;
  roundMs: number;
  restMs: number;
}

export const DEFAULT_FORMAT: FightFormat = { rounds: 3, roundMs: 180_000, restMs: 60_000 };

export const fightConfigSpecs: TunableSpecs<FightConfig> = {
  playerHealth: { min: 10, max: 300, step: 10, label: "Player health" },
  defenseWindowMs: { min: 0, max: 800, step: 10, label: "Defense window (ms)" },
  openMs: { min: 100, max: 3000, step: 50, label: "Open window (ms)" },
  blockOpenFactor: { min: 0, max: 1, step: 0.05, label: "Block open factor" },
  counterMultiplier: { min: 1, max: 4, step: 0.1, label: "Counter ×" },
  blockedDamage: { min: 0, max: 1, step: 0.05, label: "Blocked damage" },
  comboWindowMs: { min: 100, max: 2000, step: 50, label: "Combo window (ms)" },
  comboStep: { min: 0, max: 0.5, step: 0.01, label: "Combo step" },
  comboMax: { min: 0, max: 2, step: 0.05, label: "Combo max" },
  snapBonusMax: { min: 0, max: 1, step: 0.05, label: "Snap bonus max" },
  snapFastMs: { min: 20, max: 300, step: 10, label: "Snap fast (ms)" },
  snapSlowMs: { min: 100, max: 800, step: 10, label: "Snap slow (ms)" },
  stunHits: { min: 2, max: 15, step: 1, label: "Stun hits" },
  stunChainMs: { min: 300, max: 5000, step: 100, label: "Stun chain (ms)" },
  stunMs: { min: 300, max: 5000, step: 100, label: "Stun (ms)" },
  flinchMs: { min: 50, max: 1000, step: 10, label: "Flinch (ms)" },
  recoverMs: { min: 100, max: 2000, step: 50, label: "Recover (ms)" },
  whiffMs: { min: 50, max: 1500, step: 50, label: "Whiff stumble (ms)" },
  comboGapMs: { min: 50, max: 1500, step: 50, label: "Combo gap (ms)" },
  guardRerollMs: { min: 200, max: 5000, step: 100, label: "Guard reroll (ms)" },
  countdownMs: { min: 0, max: 5000, step: 500, label: "Countdown (ms)" },
  lostTrackingPauseMs: { min: 200, max: 5000, step: 100, label: "Lost tracking pause (ms)" },
  punchJab: { min: 0, max: 30, step: 0.5, label: "Jab damage" },
  punchCross: { min: 0, max: 30, step: 0.5, label: "Cross damage" },
  punchHook: { min: 0, max: 30, step: 0.5, label: "Hook damage" },
  punchUppercut: { min: 0, max: 30, step: 0.5, label: "Uppercut damage" },
  staminaMax: { min: 20, max: 300, step: 10, label: "Stamina max" },
  costJab: { min: 0, max: 30, step: 0.5, label: "Jab stamina" },
  costCross: { min: 0, max: 30, step: 0.5, label: "Cross stamina" },
  costHook: { min: 0, max: 30, step: 0.5, label: "Hook stamina" },
  costUppercut: { min: 0, max: 30, step: 0.5, label: "Uppercut stamina" },
  staminaRegenPerSec: { min: 0, max: 60, step: 1, label: "Stamina regen /s" },
  staminaRegenDelayMs: { min: 0, max: 3000, step: 100, label: "Stamina regen delay (ms)" },
  lowStamina: { min: 0, max: 100, step: 1, label: "Low stamina" },
  lowStaminaDamage: { min: 0, max: 1, step: 0.05, label: "Low stamina damage ×" },
  exhaustedRecover: { min: 0, max: 50, step: 1, label: "Exhausted recover" },
  bodyStaminaDrain: { min: 0, max: 40, step: 1, label: "Body shot stamina drain" },
  opponentStaminaRegenPerSec: { min: 0, max: 30, step: 0.5, label: "Opponent stamina regen /s" },
  opponentTiredAt: { min: 0, max: 1, step: 0.05, label: "Opponent tired at" },
  opponentTiredSlowdown: { min: 1, max: 3, step: 0.05, label: "Opponent tired slowdown" },
  countMs: { min: 200, max: 2000, step: 50, label: "Count interval (ms)" },
  getUpPunches: { min: 1, max: 60, step: 1, label: "Get-up punches" },
  getUpPunchesExtra: { min: 0, max: 30, step: 1, label: "Get-up extra per knockdown" },
  getUpHealth: { min: 1, max: 100, step: 1, label: "Get-up health" },
  opponentGetUpHealth: { min: 0.05, max: 1, step: 0.05, label: "Opponent get-up health" },
  tkoKnockdowns: { min: 1, max: 10, step: 1, label: "TKO knockdowns" },
  resumeMs: { min: 0, max: 5000, step: 100, label: "Resume pause (ms)" },
  restHealth: { min: 0, max: 100, step: 1, label: "Rest health regen" },
};
