/**
 * Fighter data format (docs/boxing.md). Each opponent is one JSON file in
 * data/opponents/. Adding an opponent needs no logic changes.
 */
export type Defense = "guard" | "slip" | "duck";

export interface AttackData {
  id: string;
  name: string;
  kind: "straight" | "hook" | "uppercut" | "body" | "haymaker";
  /** Animation clip played as the tell (render/canvas2d/animations.ts). */
  tell: string;
  /** Tell length. Falls back to stats.windupMs. */
  windupMs?: number;
  /** Time from the end of the tell to impact. */
  strikeMs: number;
  /** Damage to the player on a clean hit, before the fighter's power multiplier. */
  damage: number;
  /**
   * Defenses that work, with the fraction of damage that still gets through.
   * 0 = clean defense: the attack misses and the opponent is left open.
   */
  beatenBy: Partial<Record<Defense, number>>;
}

export interface PatternData {
  /** Relative chance of picking this pattern. */
  weight: number;
  /** Attack ids thrown in order. */
  sequence: string[];
}

export interface PuppetArtRef {
  /** Which puppet part set to draw. "placeholder" = built-in shapes. */
  puppet: string;
  skin: string;
  trunks: string;
  gloves: string;
  hair: string;
}

export interface FighterData {
  id: string;
  name: string;
  nickname: string;
  /** One line shown on the select screen. */
  style: string;
  stats: {
    /** 80-200 */
    health: number;
    /** Damage multiplier, 0.6-1.6. */
    power: number;
    /** Base tell length, ms. */
    windupMs: number;
    /** 0-1: chance to be guarding while not attacking. */
    guardChance: number;
    staminaMax: number;
    /** Length of the open window after a whiff, ms. */
    recoveryMs: number;
    /** Pause between attack patterns, ms (min and max). */
    restMs: [number, number];
  };
  /** Which punches his guard blocks: high blocks head shots, low blocks body shots. */
  guard: "high" | "low" | "mixed";
  attacks: AttackData[];
  patterns: PatternData[];
  /** Aggression multiplier per round (shortens rests). */
  roundBehavior: Record<string, number>;
  /** Shown as a hint after a loss. */
  weaknesses: string[];
  taunts: string[];
  art: PuppetArtRef;
}

export class FighterDataError extends Error {}

/** Checks the cross-references a data file can get wrong. */
export function validateFighter(f: FighterData): FighterData {
  const ids = new Set(f.attacks.map((a) => a.id));
  if (f.attacks.length === 0) throw new FighterDataError(`${f.id}: no attacks`);
  if (f.patterns.length === 0) throw new FighterDataError(`${f.id}: no patterns`);
  for (const p of f.patterns) {
    for (const a of p.sequence) if (!ids.has(a)) throw new FighterDataError(`${f.id}: pattern uses unknown attack "${a}"`);
    if (!(p.weight > 0)) throw new FighterDataError(`${f.id}: pattern weight must be positive`);
  }
  for (const a of f.attacks) {
    if (Object.keys(a.beatenBy).length === 0) throw new FighterDataError(`${f.id}: attack "${a.id}" can't be defended`);
  }
  if (!(f.stats.health > 0)) throw new FighterDataError(`${f.id}: health must be positive`);
  const r = f.stats.restMs;
  if (!Array.isArray(r) || r.length !== 2 || !(r[0] <= r[1])) throw new FighterDataError(`${f.id}: restMs must be [min, max]`);
  return f;
}
