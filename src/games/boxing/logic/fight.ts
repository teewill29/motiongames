import type { AttackData, Defense, FighterData } from "../data/fighter";
import type { GuardState, PunchEvent, PunchTarget, PunchType, SlipState } from "../types";
import type { FightConfig } from "./fightConfig";
import { between, pickWeighted, type Rng } from "./rng";

/** Logic runs on a fixed 60 Hz timestep, independent of the render frame rate. */
export const STEP_MS = 1000 / 60;

export type OpponentStateName =
  | "guard"
  | "windup"
  | "strike"
  | "recover"
  | "whiff"
  | "open"
  | "hit"
  | "stunned"
  | "ko"
  | "victory";

export interface OpponentState {
  name: OpponentStateName;
  /** ms spent in this state. */
  t: number;
  /** Planned length of this state, ms (Infinity for ko/victory). */
  duration: number;
  /** Attack being thrown (windup, strike) or just thrown (recover, whiff, open). */
  attack: AttackData | null;
  /** Holding his guard up while waiting (blocks punches his guard type covers). */
  guarding: boolean;
  health: number;
  maxHealth: number;
  /** Clean hits in the current chain toward a stun. */
  stunHits: number;
}

export interface PlayerDefense {
  guard: GuardState;
  slip: SlipState;
  duck: boolean;
}

export interface FightInput {
  /** Punches detected since the last step. */
  punches: PunchEvent[];
  /** Defensive state right now. */
  defense: PlayerDefense;
}

export type FightEvent =
  | { type: "fight-start"; time: number }
  | { type: "windup"; time: number; attack: string }
  | { type: "punch-landed"; time: number; punch: PunchType; damage: number; counter: boolean; combo: number }
  | { type: "punch-blocked"; time: number; punch: PunchType; damage: number }
  | { type: "attack-hit"; time: number; attack: string; damage: number }
  | { type: "attack-defended"; time: number; attack: string; defense: Defense; damage: number; clean: boolean }
  | { type: "stunned"; time: number }
  | { type: "ko"; time: number; winner: "player" | "opponent" };

export interface FightStats {
  thrown: number;
  landed: number;
  blocked: number;
  counters: number;
  /** Opponent attacks fully beaten by a defense. */
  defended: number;
  damageDealt: number;
  damageTaken: number;
  thrownByType: Record<PunchType, number>;
  landedByType: Record<PunchType, number>;
}

export interface FightState {
  /** Fight clock, ms. */
  time: number;
  phase: "countdown" | "fighting" | "over";
  countdownLeft: number;
  player: {
    health: number;
    maxHealth: number;
    /** Landed punches in the current combo chain (0 = none). */
    combo: number;
    defense: PlayerDefense;
  };
  opponent: OpponentState;
  result: { winner: "player" | "opponent"; method: "KO"; timeMs: number } | null;
  stats: FightStats;
}

const zeroByType = (): Record<PunchType, number> => ({ jab: 0, cross: 0, hook: 0, uppercut: 0 });

/**
 * One fight against one opponent. Pure logic: it never sees the camera or the
 * renderer. Feed it inputs with step(); read `state`; drain `events`.
 */
export class FightLogic {
  readonly state: FightState;
  /** Events since the last drain, for the renderer and sound. */
  private events: FightEvent[] = [];
  private queue: AttackData[] = [];
  private defenseHistory: { t: number; d: PlayerDefense }[] = [];
  private lastLandT = -Infinity;
  private lastCleanHitT = -Infinity;
  private guardRerollT = 0;
  private round = 1;

  constructor(
    readonly fighter: FighterData,
    private readonly cfg: FightConfig,
    private readonly rng: Rng,
  ) {
    this.state = {
      time: 0,
      phase: "countdown",
      countdownLeft: cfg.countdownMs,
      player: {
        health: cfg.playerHealth,
        maxHealth: cfg.playerHealth,
        combo: 0,
        defense: { guard: "none", slip: null, duck: false },
      },
      opponent: {
        name: "guard",
        t: 0,
        duration: Infinity,
        attack: null,
        guarding: true,
        health: fighter.stats.health,
        maxHealth: fighter.stats.health,
        stunHits: 0,
      },
      result: null,
      stats: {
        thrown: 0,
        landed: 0,
        blocked: 0,
        counters: 0,
        defended: 0,
        damageDealt: 0,
        damageTaken: 0,
        thrownByType: zeroByType(),
        landedByType: zeroByType(),
      },
    };
  }

  drainEvents(): FightEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(input: FightInput): void {
    const s = this.state;
    s.time += STEP_MS;
    s.player.defense = input.defense;
    this.defenseHistory.push({ t: s.time, d: input.defense });
    while (this.defenseHistory.length && s.time - this.defenseHistory[0]!.t > this.cfg.defenseWindowMs + STEP_MS) {
      this.defenseHistory.shift();
    }

    if (s.phase === "countdown") {
      s.countdownLeft -= STEP_MS;
      if (s.countdownLeft <= 0) {
        s.phase = "fighting";
        this.enterGuard();
        this.emit({ type: "fight-start", time: s.time });
      }
      return;
    }
    if (s.phase === "over") {
      s.opponent.t += STEP_MS;
      return;
    }
    for (const p of input.punches) this.resolvePunch(p);
    if (s.phase === "fighting") this.updateOpponent();
  }

  // ---- player punches ----

  private baseDamage(type: PunchType): number {
    const c = this.cfg;
    return { jab: c.punchJab, cross: c.punchCross, hook: c.punchHook, uppercut: c.punchUppercut }[type];
  }

  private snapModifier(snapMs: number): number {
    const c = this.cfg;
    const k = Math.min(1, Math.max(0, (c.snapSlowMs - snapMs) / Math.max(1, c.snapSlowMs - c.snapFastMs)));
    return 1 + c.snapBonusMax * k;
  }

  private guardCovers(target: PunchTarget): boolean {
    const g = this.fighter.guard;
    return g === "mixed" || (g === "high" ? target === "head" : target === "body");
  }

  private resolvePunch(p: PunchEvent): void {
    const s = this.state;
    const o = s.opponent;
    if (o.name === "ko") return;
    s.stats.thrown++;
    s.stats.thrownByType[p.type]++;

    const chained = s.time - this.lastLandT <= this.cfg.comboWindowMs;
    let damage = this.baseDamage(p.type) * this.snapModifier(p.snapMs);

    if (o.name === "guard" && o.guarding && this.guardCovers(p.target)) {
      damage *= this.cfg.blockedDamage;
      this.applyDamage(damage);
      s.stats.blocked++;
      s.player.combo = 0;
      this.emit({ type: "punch-blocked", time: s.time, punch: p.type, damage });
      return;
    }

    s.player.combo = chained ? s.player.combo + 1 : 1;
    damage *= 1 + Math.min(this.cfg.comboMax, (s.player.combo - 1) * this.cfg.comboStep);
    const counter = o.name === "open";
    if (counter) {
      damage *= this.cfg.counterMultiplier;
      s.stats.counters++;
    }
    this.lastLandT = s.time;
    s.stats.landed++;
    s.stats.landedByType[p.type]++;
    this.applyDamage(damage);
    this.emit({ type: "punch-landed", time: s.time, punch: p.type, damage, counter, combo: s.player.combo });
    if (o.health <= 0) return this.finish("player");

    // Stun: a chain of clean hits.
    o.stunHits = s.time - this.lastCleanHitT <= this.cfg.stunChainMs ? o.stunHits + 1 : 1;
    this.lastCleanHitT = s.time;
    if (o.stunHits >= this.cfg.stunHits && o.name !== "stunned") {
      o.stunHits = 0;
      this.queue = [];
      this.enter("stunned", this.cfg.stunMs, null);
      this.emit({ type: "stunned", time: s.time });
      return;
    }
    // A flinch only interrupts a waiting opponent; attacks in progress keep coming.
    if (o.name === "guard" || o.name === "hit") this.enter("hit", this.cfg.flinchMs, null);
  }

  private applyDamage(d: number): void {
    const o = this.state.opponent;
    const dealt = Math.min(o.health, d);
    o.health -= dealt;
    this.state.stats.damageDealt += dealt;
  }

  // ---- opponent ----

  private enter(name: OpponentStateName, duration: number, attack: AttackData | null): void {
    const o = this.state.opponent;
    o.name = name;
    o.t = 0;
    o.duration = duration;
    o.attack = attack;
  }

  private aggression(): number {
    return this.fighter.roundBehavior[String(this.round)] ?? 1;
  }

  private enterGuard(): void {
    this.enter("guard", between(this.rng, this.fighter.stats.restMs) / this.aggression(), null);
    this.rerollGuard();
  }

  private rerollGuard(): void {
    this.state.opponent.guarding = this.rng() < this.fighter.stats.guardChance;
    this.guardRerollT = 0;
  }

  private startNextAttack(): void {
    if (this.queue.length === 0) {
      const pattern = pickWeighted(this.fighter.patterns, this.rng);
      this.queue = pattern.sequence.map((id) => this.fighter.attacks.find((a) => a.id === id)!);
    }
    const attack = this.queue.shift()!;
    this.enter("windup", attack.windupMs ?? this.fighter.stats.windupMs, attack);
    this.state.opponent.guarding = false;
    this.emit({ type: "windup", time: this.state.time, attack: attack.id });
  }

  private updateOpponent(): void {
    const o = this.state.opponent;
    o.t += STEP_MS;
    if (o.name === "guard") {
      this.guardRerollT += STEP_MS;
      if (this.guardRerollT >= this.cfg.guardRerollMs) this.rerollGuard();
    }
    if (o.t < o.duration) return;
    switch (o.name) {
      case "guard":
        return this.startNextAttack();
      case "windup":
        return this.enter("strike", o.attack!.strikeMs, o.attack);
      case "strike":
        return this.impact(o.attack!);
      case "recover":
        if (this.queue.length) return this.startNextAttack();
        return this.enterGuard();
      case "whiff":
        return this.enter("open", this.openMs(o.attack!, "slip"), o.attack);
      case "open":
      case "hit":
      case "stunned":
        this.queue = [];
        return this.enterGuard();
    }
  }

  private openMs(_attack: AttackData, defense: Defense): number {
    const base = this.fighter.stats.recoveryMs || this.cfg.openMs;
    return defense === "guard" ? base * this.cfg.blockOpenFactor : base;
  }

  /** Was this defense held at any moment in the window before impact? */
  private held(defense: Defense): boolean {
    const from = this.state.time - this.cfg.defenseWindowMs;
    return this.defenseHistory.some(
      ({ t, d }) =>
        t >= from && (defense === "guard" ? d.guard === "high" : defense === "slip" ? d.slip !== null : d.duck),
    );
  }

  private impact(attack: AttackData): void {
    const s = this.state;
    // The best defense the player managed: least damage through.
    let best: { defense: Defense; through: number } | null = null;
    for (const [defense, through] of Object.entries(attack.beatenBy) as [Defense, number][]) {
      if (this.held(defense) && (!best || through < best.through)) best = { defense, through };
    }
    const full = attack.damage * this.fighter.stats.power;

    if (best && best.through === 0) {
      s.stats.defended++;
      this.emit({ type: "attack-defended", time: s.time, attack: attack.id, defense: best.defense, damage: 0, clean: true });
      this.queue = [];
      // A slip or duck makes him miss and stumble; a block stops him short. Either way he's open.
      if (best.defense === "guard") this.enter("open", this.openMs(attack, "guard"), attack);
      else this.enter("whiff", this.cfg.whiffMs, attack);
      return;
    }
    const damage = best ? full * best.through : full;
    s.player.health = Math.max(0, s.player.health - damage);
    s.stats.damageTaken += damage;
    if (best) this.emit({ type: "attack-defended", time: s.time, attack: attack.id, defense: best.defense, damage, clean: false });
    else this.emit({ type: "attack-hit", time: s.time, attack: attack.id, damage });
    if (s.player.health <= 0) return this.finish("opponent");
    this.enter("recover", this.queue.length ? this.cfg.comboGapMs : this.cfg.recoverMs, attack);
  }

  private finish(winner: "player" | "opponent"): void {
    const s = this.state;
    s.phase = "over";
    s.result = { winner, method: "KO", timeMs: s.time };
    this.queue = [];
    this.enter(winner === "player" ? "ko" : "victory", Infinity, null);
    this.emit({ type: "ko", time: s.time, winner });
  }

  private emit(e: FightEvent): void {
    this.events.push(e);
  }
}
