import { describe, expect, it } from "vitest";
import { validateFighter, FighterDataError, type FighterData } from "../src/games/boxing/data/fighter";
import { ROSTER } from "../src/games/boxing/data/roster";
import { FightLogic, STEP_MS, type FightEvent, type FightInput, type PlayerDefense } from "../src/games/boxing/logic/fight";
import { fightConfig } from "../src/games/boxing/logic/fightConfig";
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

function setup(fighter: FighterData = dusty, cfg = { ...fightConfig }) {
  const logic = new FightLogic(fighter, cfg, seededRng(1));
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
    expect(f.events[0]!.type).toBe("fight-start");
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

  it("ends in a KO either way", () => {
    const win = setup(only("jab", { restMs: [5000, 5000], health: 10 }));
    win.skipCountdown();
    win.until(() => win.s.phase === "over", { punches: [punch("uppercut")] });
    expect(win.s.result).toMatchObject({ winner: "player", method: "KO" });
    expect(win.s.opponent.name).toBe("ko");

    const loss = setup(only("hook-right"), { ...fightConfig, playerHealth: 10 });
    loss.skipCountdown();
    loss.until(() => loss.s.phase === "over");
    expect(loss.s.result).toMatchObject({ winner: "opponent" });
    expect(loss.s.opponent.name).toBe("victory");
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
    expect(f.s.player.health).toBe(fightConfig.playerHealth);
    expect(f.s.stats.counters).toBeGreaterThan(5);
  });
});
