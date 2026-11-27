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
};

export type FightConfig = typeof fightConfig;

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
};
