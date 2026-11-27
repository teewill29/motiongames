import type { AttackData, Defense, FighterData } from "../data/fighter";
import type { GuardState, PunchEvent, PunchTarget, PunchType, SlipState } from "../types";
import { DEFAULT_FORMAT, type FightConfig, type FightFormat } from "./fightConfig";
import { between, pickWeighted, type Rng } from "./rng";

/** Logic runs on a fixed 60 Hz timestep, independent of the render frame rate. */
export const STEP_MS = 1000 / 60;

/** Referee counts to this; reaching it is a KO. */
export const FULL_COUNT = 10;

export type OpponentStateName =
  | "guard"
  | "windup"
  | "strike"
  | "recover"
  | "whiff"
  | "open"
  | "hit"
  | "stunned"
  | "knockdown"
  | "getup"
  | "ko"
  | "victory";

export interface OpponentState {
  name: OpponentStateName;
  /** ms spent in this state. */
  t: number;
  /** Planned length of this state, ms (Infinity when it ends on an event). */
  duration: number;
  /** Attack being thrown (windup, strike) or just thrown (recover, whiff, open). */
  attack: AttackData | null;
  /** Holding his guard up while waiting (blocks punches his guard type covers). */
  guarding: boolean;
  health: number;
  maxHealth: number;
  stamina: number;
  staminaMax: number;
  /** Clean hits in the current chain toward a stun. */
  stunHits: number;
  knockdowns: number;
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

export type Fighter = "player" | "opponent";
export type WinMethod = "KO" | "TKO" | "Decision";

export type FightEvent =
  | { type: "round-start"; time: number; round: number }
  | { type: "round-end"; time: number; round: number; score: RoundScore }
  | { type: "windup"; time: number; attack: string }
  | { type: "punch-landed"; time: number; punch: PunchType; damage: number; counter: boolean; combo: number; target: PunchTarget }
  | { type: "punch-blocked"; time: number; punch: PunchType; damage: number }
  | { type: "too-tired"; time: number }
  | { type: "attack-hit"; time: number; attack: string; damage: number }
  | { type: "attack-defended"; time: number; attack: string; defense: Defense; damage: number; clean: boolean }
  | { type: "stunned"; time: number }
  | { type: "knockdown"; time: number; who: Fighter }
  | { type: "count"; time: number; who: Fighter; n: number }
  | { type: "get-up"; time: number; who: Fighter }
  | { type: "fight-over"; time: number; winner: Fighter | "draw"; method: WinMethod };

export interface RoundScore {
  player: number;
  opponent: number;
}

export interface RoundRecord {
  damageDealt: number;
  damageTaken: number;
  /** Times the opponent went down this round. */
  knockdownsScored: number;
  /** Times the player went down this round. */
  knockdownsSuffered: number;
  punchesThrown: number;
  punchesLanded: number;
  score: RoundScore | null;
}

export interface FightStats {
  thrown: number;
  landed: number;
  blocked: number;
  counters: number;
  /** Opponent attacks fully beaten, by defense. */
  defended: number;
  defendedBy: Record<Defense, number>;
  damageDealt: number;
  damageTaken: number;
  knockdownsScored: number;
  knockdownsSuffered: number;
  /** Time spent fighting (not countdown, knockdown counts or rests), ms. */
  activeMs: number;
  thrownByType: Record<PunchType, number>;
  landedByType: Record<PunchType, number>;
}

export interface KnockdownState {
  who: Fighter;
  /** ms since going down. */
  t: number;
  /** Counts called so far. */
  count: number;
  /** Player: punches thrown toward getting up. */
  getUp: number;
  getUpNeeded: number;
  /** Opponent: the count he rises at, or null to stay down. */
  getUpAt: number | null;
  /** Set once up: ms until the fight resumes. */
  resumeLeft: number | null;
}

export interface FightState {
  /** Fight clock, ms. */
  time: number;
  phase: "countdown" | "fighting" | "knockdown" | "rest" | "over";
  countdownLeft: number;
  format: FightFormat;
  round: number;
  /** Time left in the round, ms. Stops during knockdown counts. */
  roundLeft: number;
  restLeft: number;
  player: {
    health: number;
    maxHealth: number;
    stamina: number;
    staminaMax: number;
    /** Hit 0 stamina: punches don't register until it recovers. */
    exhausted: boolean;
    /** Landed punches in the current combo chain (0 = none). */
    combo: number;
    defense: PlayerDefense;
    knockdowns: number;
  };
  opponent: OpponentState;
  knockdown: KnockdownState | null;
  rounds: RoundRecord[];
  result: { winner: Fighter | "draw"; method: WinMethod; round: number; roundTimeMs: number; scores: RoundScore | null } | null;
  stats: FightStats;
}

const zeroByType = (): Record<PunchType, number> => ({ jab: 0, cross: 0, hook: 0, uppercut: 0 });
const newRound = (): RoundRecord => ({
  damageDealt: 0,
  damageTaken: 0,
  knockdownsScored: 0,
  knockdownsSuffered: 0,
  punchesThrown: 0,
  punchesLanded: 0,
  score: null,
});

/**
 * One fight against one opponent. Pure logic: it never sees the camera or the
 * renderer. Feed it inputs with step(); read `state`; drain `events`.
 */
export class FightLogic {
  readonly state: FightState;
  private events: FightEvent[] = [];
  private queue: AttackData[] = [];
  private defenseHistory: { t: number; d: PlayerDefense }[] = [];
  private lastLandT = -Infinity;
  private lastCleanHitT = -Infinity;
  private lastPunchT = -Infinity;
  private lastTiredEventT = -Infinity;
  private guardRerollT = 0;

  constructor(
    readonly fighter: FighterData,
    private readonly cfg: FightConfig,
    private readonly rng: Rng,
    format: FightFormat = DEFAULT_FORMAT,
  ) {
    this.state = {
      time: 0,
      phase: "countdown",
      countdownLeft: cfg.countdownMs,
      format,
      round: 1,
      roundLeft: format.roundMs,
      restLeft: 0,
      player: {
        health: cfg.playerHealth,
        maxHealth: cfg.playerHealth,
        stamina: cfg.staminaMax,
        staminaMax: cfg.staminaMax,
        exhausted: false,
        combo: 0,
        defense: { guard: "none", slip: null, duck: false },
        knockdowns: 0,
      },
      opponent: {
        name: "guard",
        t: 0,
        duration: Infinity,
        attack: null,
        guarding: true,
        health: fighter.stats.health,
        maxHealth: fighter.stats.health,
        stamina: fighter.stats.staminaMax,
        staminaMax: fighter.stats.staminaMax,
        stunHits: 0,
        knockdowns: 0,
      },
      knockdown: null,
      rounds: [newRound()],
      result: null,
      stats: {
        thrown: 0,
        landed: 0,
        blocked: 0,
        counters: 0,
        defended: 0,
        defendedBy: { guard: 0, slip: 0, duck: 0 },
        damageDealt: 0,
        damageTaken: 0,
        knockdownsScored: 0,
        knockdownsSuffered: 0,
        activeMs: 0,
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

  private get currentRound(): RoundRecord {
    return this.state.rounds[this.state.round - 1]!;
  }

  step(input: FightInput): void {
    const s = this.state;
    s.time += STEP_MS;
    s.player.defense = input.defense;
    this.defenseHistory.push({ t: s.time, d: input.defense });
    while (this.defenseHistory.length && s.time - this.defenseHistory[0]!.t > this.cfg.defenseWindowMs + STEP_MS) {
      this.defenseHistory.shift();
    }

    switch (s.phase) {
      case "countdown":
        s.countdownLeft -= STEP_MS;
        if (s.countdownLeft <= 0) this.startRound();
        return;
      case "fighting":
        return this.stepFighting(input);
      case "knockdown":
        return this.stepKnockdown(input);
      case "rest":
        s.restLeft -= STEP_MS;
        if (s.restLeft <= 0) {
          s.round++;
          s.rounds.push(newRound());
          s.roundLeft = s.format.roundMs;
          this.startRound();
        }
        return;
      case "over":
        s.opponent.t += STEP_MS;
        return;
    }
  }

  /** Skip the rest of the break between rounds (the player is ready). */
  skipRest(): void {
    if (this.state.phase === "rest") this.state.restLeft = 0;
  }

  private startRound(): void {
    this.state.phase = "fighting";
    this.queue = [];
    this.enterGuard();
    this.emit({ type: "round-start", time: this.state.time, round: this.state.round });
  }

  private stepFighting(input: FightInput): void {
    const s = this.state;
    s.stats.activeMs += STEP_MS;
    s.roundLeft -= STEP_MS;
    this.regenStamina();
    for (const p of input.punches) {
      this.resolvePunch(p);
      if (s.phase !== "fighting") return;
    }
    this.updateOpponent();
    if (s.phase === "fighting" && s.roundLeft <= 0) this.endRound();
  }

  // ---- stamina ----

  private regenStamina(): void {
    const s = this.state;
    const p = s.player;
    if (s.time - this.lastPunchT >= this.cfg.staminaRegenDelayMs) {
      p.stamina = Math.min(p.staminaMax, p.stamina + (this.cfg.staminaRegenPerSec * STEP_MS) / 1000);
    }
    if (p.exhausted && p.stamina > this.cfg.exhaustedRecover) p.exhausted = false;
    const o = s.opponent;
    o.stamina = Math.min(o.staminaMax, o.stamina + (this.cfg.opponentStaminaRegenPerSec * STEP_MS) / 1000);
  }

  private staminaCost(type: PunchType): number {
    const c = this.cfg;
    return { jab: c.costJab, cross: c.costCross, hook: c.costHook, uppercut: c.costUppercut }[type];
  }

  /** Opponent below his tired threshold: slower tells, longer openings. */
  private tiredFactor(): number {
    const o = this.state.opponent;
    return o.stamina < o.staminaMax * this.cfg.opponentTiredAt ? this.cfg.opponentTiredSlowdown : 1;
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
    const pl = s.player;
    if (pl.exhausted) {
      if (s.time - this.lastTiredEventT > 1000) {
        this.lastTiredEventT = s.time;
        this.emit({ type: "too-tired", time: s.time });
      }
      return;
    }
    pl.stamina = Math.max(0, pl.stamina - this.staminaCost(p.type));
    if (pl.stamina <= 0) pl.exhausted = true;
    this.lastPunchT = s.time;
    s.stats.thrown++;
    s.stats.thrownByType[p.type]++;
    this.currentRound.punchesThrown++;

    const chained = s.time - this.lastLandT <= this.cfg.comboWindowMs;
    let damage = this.baseDamage(p.type) * this.snapModifier(p.snapMs);
    if (pl.stamina < this.cfg.lowStamina) damage *= this.cfg.lowStaminaDamage;

    if (o.name === "guard" && o.guarding && this.guardCovers(p.target)) {
      damage *= this.cfg.blockedDamage;
      this.damageOpponent(damage);
      s.stats.blocked++;
      pl.combo = 0;
      this.emit({ type: "punch-blocked", time: s.time, punch: p.type, damage });
      if (o.health <= 0) this.knockDown("opponent");
      return;
    }

    pl.combo = chained ? pl.combo + 1 : 1;
    damage *= 1 + Math.min(this.cfg.comboMax, (pl.combo - 1) * this.cfg.comboStep);
    const counter = o.name === "open";
    if (counter) {
      damage *= this.cfg.counterMultiplier;
      s.stats.counters++;
    }
    this.lastLandT = s.time;
    s.stats.landed++;
    s.stats.landedByType[p.type]++;
    this.currentRound.punchesLanded++;
    this.damageOpponent(damage);
    if (p.target === "body") o.stamina = Math.max(0, o.stamina - this.cfg.bodyStaminaDrain);
    this.emit({ type: "punch-landed", time: s.time, punch: p.type, damage, counter, combo: pl.combo, target: p.target });
    if (o.health <= 0) return this.knockDown("opponent");

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

  private damageOpponent(d: number): void {
    const o = this.state.opponent;
    const dealt = Math.min(o.health, d);
    o.health -= dealt;
    this.state.stats.damageDealt += dealt;
    this.currentRound.damageDealt += dealt;
  }

  private damagePlayer(d: number): void {
    const p = this.state.player;
    const taken = Math.min(p.health, d);
    p.health -= taken;
    this.state.stats.damageTaken += taken;
    this.currentRound.damageTaken += taken;
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
    return this.fighter.roundBehavior[String(this.state.round)] ?? 1;
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
    this.enter("windup", (attack.windupMs ?? this.fighter.stats.windupMs) * this.tiredFactor(), attack);
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
        return this.enter("open", this.openMs("slip"), o.attack);
      case "open":
      case "hit":
      case "stunned":
      case "getup":
        this.queue = [];
        return this.enterGuard();
    }
  }

  private openMs(defense: Defense): number {
    const base = (this.fighter.stats.recoveryMs || this.cfg.openMs) * this.tiredFactor();
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
      s.stats.defendedBy[best.defense]++;
      this.emit({ type: "attack-defended", time: s.time, attack: attack.id, defense: best.defense, damage: 0, clean: true });
      this.queue = [];
      // A slip or duck makes him miss and stumble; a block stops him short. Either way he's open.
      if (best.defense === "guard") this.enter("open", this.openMs("guard"), attack);
      else this.enter("whiff", this.cfg.whiffMs, attack);
      return;
    }
    const damage = best ? full * best.through : full;
    this.damagePlayer(damage);
    if (best) this.emit({ type: "attack-defended", time: s.time, attack: attack.id, defense: best.defense, damage, clean: false });
    else this.emit({ type: "attack-hit", time: s.time, attack: attack.id, damage });
    if (s.player.health <= 0) return this.knockDown("player");
    this.enter("recover", this.queue.length ? this.cfg.comboGapMs : this.cfg.recoverMs, attack);
  }

  // ---- knockdowns ----

  private knockDown(who: Fighter): void {
    const s = this.state;
    const round = this.currentRound;
    this.queue = [];
    s.player.combo = 0;
    let downs: number;
    if (who === "opponent") {
      s.opponent.knockdowns++;
      s.stats.knockdownsScored++;
      downs = ++round.knockdownsScored;
    } else {
      s.player.knockdowns++;
      s.stats.knockdownsSuffered++;
      downs = ++round.knockdownsSuffered;
    }
    this.emit({ type: "knockdown", time: s.time, who });
    if (downs >= this.cfg.tkoKnockdowns) return this.finish(who === "opponent" ? "player" : "opponent", "TKO");

    const getUpAt = who === "opponent" ? (this.fighter.stats.getUpCounts[s.opponent.knockdowns - 1] ?? null) : null;
    s.knockdown = {
      who,
      t: 0,
      count: 0,
      getUp: 0,
      getUpNeeded: this.cfg.getUpPunches + this.cfg.getUpPunchesExtra * (s.player.knockdowns - 1),
      getUpAt: getUpAt !== null && getUpAt < FULL_COUNT ? getUpAt : null,
      resumeLeft: null,
    };
    s.phase = "knockdown";
    this.enter(who === "opponent" ? "knockdown" : "victory", Infinity, null);
  }

  private stepKnockdown(input: FightInput): void {
    const s = this.state;
    const kd = s.knockdown!;
    s.opponent.t += STEP_MS;

    if (kd.resumeLeft !== null) {
      kd.resumeLeft -= STEP_MS;
      if (kd.resumeLeft <= 0) {
        s.knockdown = null;
        s.phase = "fighting";
        if (s.opponent.name !== "getup") this.enterGuard();
      }
      return;
    }

    kd.t += STEP_MS;
    if (kd.who === "player") {
      // Every punch counts toward getting up; stamina doesn't matter on the canvas.
      kd.getUp = Math.min(kd.getUpNeeded, kd.getUp + input.punches.length);
      if (kd.getUp >= kd.getUpNeeded) return this.getUp("player");
    }
    const count = Math.floor(kd.t / this.cfg.countMs);
    if (count > kd.count) {
      kd.count = count;
      this.emit({ type: "count", time: s.time, who: kd.who, n: count });
      if (count >= FULL_COUNT) return this.finish(kd.who === "opponent" ? "player" : "opponent", "KO");
      if (kd.who === "opponent" && kd.getUpAt !== null && count >= kd.getUpAt) this.getUp("opponent");
    }
  }

  private getUp(who: Fighter): void {
    const s = this.state;
    const kd = s.knockdown!;
    kd.resumeLeft = this.cfg.resumeMs;
    if (who === "player") {
      s.player.health = Math.min(s.player.maxHealth, this.cfg.getUpHealth);
      s.player.stamina = Math.max(s.player.stamina, s.player.staminaMax / 2);
      s.player.exhausted = false;
      this.enter("guard", Infinity, null);
      s.opponent.guarding = true;
    } else {
      s.opponent.health = s.opponent.maxHealth * this.cfg.opponentGetUpHealth;
      s.opponent.stunHits = 0;
      this.enter("getup", this.cfg.resumeMs, null);
    }
    this.emit({ type: "get-up", time: s.time, who });
  }

  // ---- rounds and results ----

  private scoreRound(r: RoundRecord): RoundScore {
    const score: RoundScore =
      r.damageDealt > r.damageTaken
        ? { player: 10, opponent: 9 }
        : r.damageDealt < r.damageTaken
          ? { player: 9, opponent: 10 }
          : { player: 10, opponent: 10 };
    // A knockdown costs the fighter who went down a point (10-8 rounds).
    score.player -= r.knockdownsSuffered;
    score.opponent -= r.knockdownsScored;
    return score;
  }

  private endRound(): void {
    const s = this.state;
    const r = this.currentRound;
    r.score = this.scoreRound(r);
    this.emit({ type: "round-end", time: s.time, round: s.round, score: r.score });
    if (s.round >= s.format.rounds) return this.decision();
    s.phase = "rest";
    s.restLeft = s.format.restMs;
    s.player.health = Math.min(s.player.maxHealth, s.player.health + this.cfg.restHealth);
    s.player.stamina = s.player.staminaMax;
    s.player.exhausted = false;
    s.opponent.stamina = s.opponent.staminaMax;
    this.queue = [];
    this.enter("guard", Infinity, null);
  }

  private totals(): RoundScore {
    return this.state.rounds.reduce(
      (t, r) => (r.score ? { player: t.player + r.score.player, opponent: t.opponent + r.score.opponent } : t),
      { player: 0, opponent: 0 },
    );
  }

  private decision(): void {
    const t = this.totals();
    this.finish(t.player > t.opponent ? "player" : t.player < t.opponent ? "opponent" : "draw", "Decision");
  }

  private finish(winner: Fighter | "draw", method: WinMethod): void {
    const s = this.state;
    s.phase = "over";
    s.knockdown = null;
    this.queue = [];
    s.result = {
      winner,
      method,
      round: s.round,
      roundTimeMs: s.format.roundMs - Math.max(0, s.roundLeft),
      scores: method === "Decision" ? this.totals() : null,
    };
    this.enter(winner === "player" ? "ko" : winner === "opponent" ? "victory" : "guard", Infinity, null);
    if (method === "Decision") s.opponent.name = winner === "player" ? "guard" : winner === "opponent" ? "victory" : "guard";
    this.emit({ type: "fight-over", time: s.time, winner, method });
  }

  private emit(e: FightEvent): void {
    this.events.push(e);
  }
}
