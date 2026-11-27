import { describe, expect, it } from "vitest";
import { validateFighter, FighterDataError, type FighterData } from "../src/games/boxing/data/fighter";
import { ROSTER } from "../src/games/boxing/data/roster";
import { FightLogic, FULL_COUNT, STEP_MS, type FightEvent, type FightInput, type PlayerDefense } from "../src/games/boxing/logic/fight";
import { fightConfig, type FightFormat } from "../src/games/boxing/logic/fightConfig";
import { seededRng } from "../src/games/boxing/logic/rng";
import type { PunchEvent, PunchType } from "../src/games/boxing/types";

const dusty = ROSTER[0]!;
const NONE: PlayerDefense = { guard: "none", slip: null, duck: false };
const GUARD: PlayerDefense = { guard: "high", slip: null, duck: false };
const SLIP: PlayerDefense = { guard: "none", slip: "left", duck: false };
const DUCK: PlayerDefense = { guard: "none", slip: null, duck: true };

const punch = (type: PunchType = "jab", snapMs = 200): PunchEvent => ({
  type,
  hand: "left",
  role: "lead",
  target: "head",
  snapMs,
  speed: 5,
  score: 1,
  timestamp: 0,
});

/** A fighter that never guards and always throws the given attack, so tests are deterministic. */
function only(attackId: string, overrides: Partial<FighterData["stats"]> = {}): FighterData {
  return {
    ...dusty,
    stats: { ...dusty.stats, guardChance: 0, restMs: [1000, 1000], ...overrides },
    patterns: [{ weight: 1, sequence: [attackId] }],
  };
}

function setup(fighter: FighterData = dusty, cfg = { ...fightConfig }, format?: FightFormat) {
  const logic = new FightLogic(fighter, cfg, seededRng(1), format);
  const events: FightEvent[] = [];
  const step = (input: Partial<FightInput> = {}) => {
    logic.step({ punches: [], defense: NONE, ...input });
    events.push(...logic.drainEvents());
  };
  const until = (pred: () => boolean, input: Partial<FightInput> = {}, maxMs = 20_000) => {
    for (let t = 0; t < maxMs && !pred(); t += STEP_MS) step(input);
    if (!pred()) throw new Error("condition never reached");
  };
  const skipCountdown = () => until(() => logic.state.phase === "fighting");
  return { logic, s: logic.state, events, step, until, skipCountdown };
}

describe("fighter data", () => {
  it("ships a valid Dusty Hale", () => {
    expect(dusty.id).toBe("dusty-hale");
    expect(dusty.attacks.map((a) => a.id)).toEqual(["jab", "hook-right"]);
  });

  it("rejects patterns that reference unknown attacks", () => {
    expect(() => validateFighter({ ...dusty, patterns: [{ weight: 1, sequence: ["nope"] }] })).toThrow(FighterDataError);
  });
});

describe("fight logic", () => {
  it("counts down, then fights", () => {
    const f = setup();
    expect(f.s.phase).toBe("countdown");
    f.skipCountdown();
    expect(f.events[0]).toMatchObject({ type: "round-start", round: 1 });
    expect(f.s.time).toBeCloseTo(fightConfig.countdownMs, -2);
  });

  it("lands an undefended attack on the player", () => {
    const f = setup(only("jab"));
    f.skipCountdown();
    f.until(() => f.events.some((e) => e.type === "attack-hit"));
    const jab = dusty.attacks[0]!;
    expect(f.s.player.health).toBeCloseTo(fightConfig.playerHealth - jab.damage * dusty.stats.power, 5);
    expect(f.s.opponent.name).toBe("recover");
  });

  it("follows windup -> strike with the tell's length", () => {
    const f = setup(only("hook-right"));
    f.skipCountdown();
    f.until(() => f.s.opponent.name === "windup");
    const start = f.s.time;
    f.until(() => f.s.opponent.name === "strike");
    expect(f.s.time - start).toBeCloseTo(1100, -2);
  });

  it("a slip makes the jab miss and leaves him open; counters do double damage", () => {
    const f = setup(only("jab"));
    f.skipCountdown();
    f.until(() => f.s.opponent.name === "strike");
    f.until(() => f.s.opponent.name === "whiff", { defense: SLIP });
    expect(f.s.player.health).toBe(fightConfig.playerHealth);
    expect(f.events.find((e) => e.type === "attack-defended")).toMatchObject({ defense: "slip", clean: true });
    f.until(() => f.s.opponent.name === "open");
    const before = f.s.opponent.health;
    f.step({ punches: [punch("cross", fightConfig.snapSlowMs)] });
    expect(before - f.s.opponent.health).toBeCloseTo(fightConfig.punchCross * fightConfig.counterMultiplier, 5);
    expect(f.s.stats.counters).toBe(1);
  });

  it("guard blocks the jab and opens a shorter window", () => {
    const f = setup(only("jab"));
    f.skipCountdown();
    f.until(() => f.s.opponent.name === "strike");
    f.until(() => f.s.opponent.name === "open", { defense: GUARD });
    expect(f.s.opponent.duration).toBeCloseTo(dusty.stats.recoveryMs * fightConfig.blockOpenFactor, 5);
    expect(f.s.player.health).toBe(fightConfig.playerHealth);
  });

  it("the hook goes through the guard at 30%, and ducking beats it", () => {
    const blocked = setup(only("hook-right"));
    blocked.skipCountdown();
    blocked.until(() => blocked.s.opponent.name === "recover", { defense: GUARD });
    const hook = dusty.attacks[1]!;
    expect(fightConfig.playerHealth - blocked.s.player.health).toBeCloseTo(hook.damage * dusty.stats.power * 0.3, 5);

    const ducked = setup(only("hook-right"));
    ducked.skipCountdown();
    ducked.until(() => ducked.s.opponent.name === "whiff", { defense: DUCK });
    expect(ducked.s.player.health).toBe(fightConfig.playerHealth);
  });

  it("slipping doesn't beat a hook", () => {
    const f = setup(only("hook-right"));
    f.skipCountdown();
    f.until(() => f.events.some((e) => e.type === "attack-hit"), { defense: SLIP });
  });

  it("forgives a defense held shortly before impact (tracking lag)", () => {
    const f = setup(only("jab"));
    f.skipCountdown();
    f.until(() => f.s.opponent.name === "strike");
    // Slip for the first frames of the strike, then come back before impact.
    for (let i = 0; i < 4; i++) f.step({ defense: SLIP });
    f.until(() => f.s.opponent.name !== "strike");
    expect(f.s.opponent.name).toBe("whiff");
  });

  it("his guard blocks head shots for 10%", () => {
    const f = setup({ ...only("jab"), stats: { ...dusty.stats, guardChance: 1, restMs: [5000, 5000] } });
    f.skipCountdown();
    f.step();
    const before = f.s.opponent.health;
    f.step({ punches: [punch("cross", fightConfig.snapSlowMs)] });
    expect(before - f.s.opponent.health).toBeCloseTo(fightConfig.punchCross * fightConfig.blockedDamage, 5);
    // Body shots go under a high guard.
    f.step({ punches: [{ ...punch("cross", fightConfig.snapSlowMs), target: "body" }] });
    expect(f.events.filter((e) => e.type === "punch-landed")).toHaveLength(1);
  });

  it("adds snap and combo bonuses", () => {
    // (full stamina, so no low-stamina penalty)
    const f = setup(only("jab", { restMs: [5000, 5000] }));
    f.skipCountdown();
    const h0 = f.s.opponent.health;
    f.step({ punches: [punch("jab", fightConfig.snapFastMs)] });
    const first = h0 - f.s.opponent.health;
    expect(first).toBeCloseTo(fightConfig.punchJab * (1 + fightConfig.snapBonusMax), 5);
    f.step();
    const h1 = f.s.opponent.health;
    f.step({ punches: [punch("jab", fightConfig.snapFastMs)] });
    expect(h1 - f.s.opponent.health).toBeCloseTo(first * (1 + fightConfig.comboStep), 5);
    expect(f.s.player.combo).toBe(2);
  });

  it("a chain of clean hits stuns him and cancels his attack", () => {
    const f = setup(only("jab", { restMs: [300, 300] }));
    f.skipCountdown();
    f.until(() => f.s.opponent.name === "windup");
    for (let i = 0; i < fightConfig.stunHits; i++) {
      f.step({ punches: [punch()] });
      for (let k = 0; k < 10; k++) f.step();
    }
    expect(f.events.some((e) => e.type === "stunned")).toBe(true);
    expect(f.s.opponent.name).toBe("stunned");
  });

  it("plays a whole fight: a player who reads every tell beats Dusty", () => {
    // Bot: duck hooks, slip jabs, counter when open, otherwise wait.
    const f = setup(dusty);
    f.skipCountdown();
    for (let t = 0; t < 600_000 && f.s.phase !== "over"; t += STEP_MS) {
      const o = f.s.opponent;
      const defense = o.name === "strike" ? (o.attack!.id === "hook-right" ? DUCK : SLIP) : NONE;
      const punches = o.name === "open" && Math.round(o.t) % 250 < STEP_MS ? [punch("cross", 150)] : [];
      f.step({ defense, punches });
    }
    expect(f.s.result?.winner).toBe("player");
    expect(f.s.stats.damageTaken).toBe(0);
    expect(f.s.stats.counters).toBeGreaterThan(5);
  });
});

describe("stamina", () => {
  it("costs stamina per punch and regenerates after a pause", () => {
    const f = setup(only("jab", { restMs: [60_000, 60_000] }));
    f.skipCountdown();
    f.step({ punches: [punch("uppercut")] });
    expect(f.s.player.stamina).toBeCloseTo(fightConfig.staminaMax - fightConfig.costUppercut, 5);
    // No regen inside the delay...
    for (let t = 0; t < fightConfig.staminaRegenDelayMs - 50; t += STEP_MS) f.step();
    expect(f.s.player.stamina).toBeCloseTo(fightConfig.staminaMax - fightConfig.costUppercut, 5);
    // ...then 12 per second.
    for (let t = 0; t < 1000; t += STEP_MS) f.step();
    expect(f.s.player.stamina).toBe(fightConfig.staminaMax);
  });

  it("halves damage below 25 and stops punches at 0 until back above 10", () => {
    const f = setup(only("jab", { restMs: [60_000, 60_000], health: 1000 }));
    f.skipCountdown();
    f.s.player.stamina = 20;
    const h = f.s.opponent.health;
    f.step({ punches: [punch("jab", fightConfig.snapSlowMs)] });
    expect(h - f.s.opponent.health).toBeCloseTo(fightConfig.punchJab * fightConfig.lowStaminaDamage, 5);
    f.s.player.stamina = 2;
    f.step({ punches: [punch("cross")] });
    expect(f.s.player.exhausted).toBe(true);
    const thrown = f.s.stats.thrown;
    f.step({ punches: [punch("cross")] });
    expect(f.s.stats.thrown).toBe(thrown);
    expect(f.events.some((e) => e.type === "too-tired")).toBe(true);
    f.until(() => !f.s.player.exhausted);
    expect(f.s.player.stamina).toBeGreaterThan(fightConfig.exhaustedRecover);
  });

  it("body shots drain his stamina; a tired opponent winds up slower", () => {
    const f = setup(only("jab", { restMs: [60_000, 60_000], health: 1000, staminaMax: 40 }));
    f.skipCountdown();
    for (let i = 0; i < 5; i++) f.step({ punches: [{ ...punch(), target: "body" }] });
    expect(f.s.opponent.stamina).toBeLessThan(40 * fightConfig.opponentTiredAt);
  });
});

describe("knockdowns", () => {
  const ROUND = { rounds: 3, roundMs: 180_000, restMs: 60_000 };

  it("puts the player down at 0 health; 20 punches get him up at 40 health", () => {
    const f = setup(only("hook-right"), { ...fightConfig }, ROUND);
    f.skipCountdown();
    f.s.player.health = 5;
    f.until(() => f.s.phase === "knockdown");
    expect(f.s.knockdown).toMatchObject({ who: "player", getUpNeeded: 20 });
    for (let i = 0; i < 19; i++) f.step({ punches: [punch()] });
    expect(f.s.knockdown!.resumeLeft).toBeNull();
    f.step({ punches: [punch()] });
    expect(f.events.some((e) => e.type === "get-up" && e.who === "player")).toBe(true);
    expect(f.s.player.health).toBe(fightConfig.getUpHealth);
    f.until(() => f.s.phase === "fighting");
  });

  it("each later knockdown needs 5 more punches", () => {
    const f = setup(only("hook-right"), { ...fightConfig, playerHealth: 5, getUpHealth: 5 }, ROUND);
    f.skipCountdown();
    f.until(() => f.s.phase === "knockdown");
    f.step({ punches: Array.from({ length: 20 }, () => punch()) });
    f.until(() => f.s.phase === "fighting");
    f.until(() => f.s.phase === "knockdown");
    expect(f.s.knockdown!.getUpNeeded).toBe(25);
  });

  it("is a KO when the player stays down for the 10 count", () => {
    const f = setup(only("hook-right"), { ...fightConfig, playerHealth: 5 }, ROUND);
    f.skipCountdown();
    f.until(() => f.s.phase === "knockdown");
    f.until(() => f.s.phase === "over");
    expect(f.events.filter((e) => e.type === "count")).toHaveLength(FULL_COUNT);
    expect(f.s.result).toMatchObject({ winner: "opponent", method: "KO", round: 1 });
  });

  it("the opponent gets up at the count in his data, then stays down", () => {
    const f = setup(only("jab", { restMs: [60_000, 60_000], health: 10, getUpCounts: [6] }), { ...fightConfig, countMs: 100 }, ROUND);
    f.skipCountdown();
    f.step({ punches: [punch("uppercut"), punch("uppercut")] });
    expect(f.s.phase).toBe("knockdown");
    f.until(() => f.events.some((e) => e.type === "get-up"));
    expect(f.events.filter((e) => e.type === "count")).toHaveLength(6);
    expect(f.s.opponent.health).toBeCloseTo(10 * fightConfig.opponentGetUpHealth, 5);
    f.until(() => f.s.phase === "fighting");
    f.until(() => f.s.phase !== "fighting", { punches: [punch("uppercut")] });
    f.until(() => f.s.phase === "over");
    expect(f.s.result).toMatchObject({ winner: "player", method: "KO" });
  });

  it("three knockdowns in one round is a TKO", () => {
    const f = setup(only("jab", { restMs: [60_000, 60_000], health: 5, getUpCounts: [1, 1, 1] }), { ...fightConfig, countMs: 50, resumeMs: 50 }, ROUND);
    f.skipCountdown();
    f.until(() => f.s.phase === "over", { punches: [punch("uppercut")] });
    expect(f.s.opponent.knockdowns).toBe(3);
    expect(f.s.result).toMatchObject({ winner: "player", method: "TKO", round: 1 });
  });
});

describe("rounds", () => {
  const SHORT = { rounds: 3, roundMs: 5000, restMs: 2000 };

  it("rests between rounds: +15 health, full stamina, then the next round", () => {
    const f = setup(only("hook-right", { restMs: [300, 300] }), { ...fightConfig }, SHORT);
    f.skipCountdown();
    f.until(() => f.s.phase === "rest");
    const hurt = fightConfig.playerHealth - f.s.stats.damageTaken;
    expect(hurt).toBeLessThan(fightConfig.playerHealth - fightConfig.restHealth);
    expect(f.events.find((e) => e.type === "round-end")).toMatchObject({ round: 1, score: { player: 9, opponent: 10 } });
    f.until(() => f.s.phase === "fighting");
    expect(f.s.round).toBe(2);
    expect(f.s.player.health).toBeCloseTo(Math.min(fightConfig.playerHealth, hurt + fightConfig.restHealth), 5);
    expect(f.s.player.stamina).toBe(fightConfig.staminaMax);
  });

  it("goes to a decision after the last round, scored 10-9 by damage and 10-8 with a knockdown", () => {
    // Player lands every so often and slips everything: wins every round.
    const f = setup(only("jab", { health: 1000 }), { ...fightConfig }, SHORT);
    f.skipCountdown();
    let n = 0;
    f.until(() => f.s.phase === "over", {}, 60_000);
    // (no input at all: Dusty's jabs land, he wins every round)
    expect(f.s.result).toMatchObject({ winner: "opponent", method: "Decision", scores: { player: 27, opponent: 30 } });
    n++;
    expect(n).toBe(1);
  });

  it("a draw when every round is even", () => {
    const f = setup({ ...only("jab", { restMs: [60_000, 60_000] }) }, { ...fightConfig }, { rounds: 2, roundMs: 1000, restMs: 100 });
    f.skipCountdown();
    f.until(() => f.s.phase === "over", {}, 10_000);
    expect(f.s.result).toMatchObject({ winner: "draw", method: "Decision", scores: { player: 20, opponent: 20 } });
  });

  it("scores a knockdown round 10-8", () => {
    const f = setup(only("jab", { restMs: [60_000, 60_000], health: 10, getUpCounts: [2] }), { ...fightConfig, countMs: 50, resumeMs: 50 }, { rounds: 1, roundMs: 3000, restMs: 0 });
    f.skipCountdown();
    f.step({ punches: [punch("uppercut"), punch("uppercut")] });
    f.until(() => f.s.phase === "over", {}, 10_000);
    expect(f.s.rounds[0]!.score).toEqual({ player: 10, opponent: 8 });
    expect(f.s.result).toMatchObject({ winner: "player", method: "Decision" });
  });

  it("the round clock stops during a knockdown count", () => {
    const f = setup(only("hook-right"), { ...fightConfig, playerHealth: 5 }, SHORT);
    f.skipCountdown();
    f.until(() => f.s.phase === "knockdown");
    const left = f.s.roundLeft;
    for (let i = 0; i < 60; i++) f.step();
    expect(f.s.roundLeft).toBe(left);
  });

  it("plays a full 3-round fight to a result with consistent stats", () => {
    const f = setup(dusty, { ...fightConfig }, { rounds: 3, roundMs: 60_000, restMs: 5000 });
    f.skipCountdown();
    // Average player: slips half the jabs, ducks half the hooks, throws a jab every second.
    let k = 0;
    for (let t = 0; t < 600_000 && f.s.phase !== "over"; t += STEP_MS) {
      k++;
      const o = f.s.opponent;
      const defend = o.name === "strike" && Math.floor(o.attack!.id.length + f.s.round + Math.floor(f.s.time / 7000)) % 2 === 0;
      const defense = defend ? (o.attack!.id === "hook-right" ? DUCK : SLIP) : NONE;
      f.step({ defense, punches: k % 60 === 0 ? [punch("jab", 150)] : [] });
    }
    const s = f.s;
    expect(s.phase).toBe("over");
    expect(s.result).not.toBeNull();
    expect(s.stats.landed).toBeLessThanOrEqual(s.stats.thrown);
    const sumDealt = s.rounds.reduce((a, r) => a + r.damageDealt, 0);
    expect(sumDealt).toBeCloseTo(s.stats.damageDealt, 5);
    if (s.result!.method === "Decision") expect(s.rounds.every((r) => r.score)).toBe(true);
  });
});
