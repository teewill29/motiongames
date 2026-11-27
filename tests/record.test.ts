import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/core/storage/storage";
import { SessionHistory } from "../src/core/stats/history";
import { ROSTER } from "../src/games/boxing/data/roster";
import { FightLogic, STEP_MS } from "../src/games/boxing/logic/fight";
import { fightConfig } from "../src/games/boxing/logic/fightConfig";
import { seededRng } from "../src/games/boxing/logic/rng";
import { bestAgainst, describeResult, resultRank, saveFight, type BoxingFightStats } from "../src/games/boxing/record";
import { loadBoxingSettings, saveBoxingSettings } from "../src/games/boxing/settings";

const base: BoxingFightStats = {
  opponentId: "dusty-hale", winner: "player", method: "KO", round: 2, roundTimeMs: 60_000, rounds: 3, scores: null,
  thrown: 10, landed: 5, thrownByType: {}, landedByType: {}, counters: 0, defendedBy: {}, damageDealt: 0, damageTaken: 0,
  knockdownsScored: 0, knockdownsSuffered: 0, activeMs: 0, punchesPerMinute: 0,
};

describe("fight records", () => {
  it("ranks wins over draws over losses, stoppages over decisions, earlier over later", () => {
    const loss = { ...base, winner: "opponent" as const };
    const draw = { ...base, winner: "draw" as const, method: "Decision" as const };
    const decision = { ...base, method: "Decision" as const, round: 3 };
    const late = { ...base, round: 3 };
    expect(resultRank(base)).toBeGreaterThan(resultRank(late));
    expect(resultRank(late)).toBeGreaterThan(resultRank(decision));
    expect(resultRank(decision)).toBeGreaterThan(resultRank(draw));
    expect(resultRank(draw)).toBeGreaterThan(resultRank(loss));
    expect(describeResult(base, "Dusty Hale")).toBe("Beat Dusty Hale by KO, round 2");
  });

  it("saves a finished fight to history and keeps the best result", () => {
    const storage = new MemoryStore();
    const history = new SessionHistory(storage);
    const play = (seed: number) => {
      const f = new FightLogic(ROSTER[0]!, { ...fightConfig }, seededRng(seed), { rounds: 1, roundMs: 20_000, restMs: 0 });
      while (f.state.phase !== "over") f.step({ punches: [], defense: { guard: "none", slip: null, duck: false } });
      return f.state;
    };
    const first = saveFight(storage, history, play(1), "dusty-hale", "Dusty Hale", new Date("2026-11-27T10:00:00Z"));
    expect(first.previousBest).toBeNull();
    expect(first.newBest).toBe(true);
    expect(first.stats.winner).toBe("opponent");
    const second = saveFight(storage, history, play(2), "dusty-hale", "Dusty Hale", new Date("2026-11-27T10:05:00Z"));
    expect(second.previousBest).not.toBeNull();
    expect(history.list("boxing")).toHaveLength(2);
    expect(history.list("boxing")[0]!.result).toMatch(/Dusty Hale/);
    expect(bestAgainst(storage, "dusty-hale")).not.toBeNull();
    expect(STEP_MS).toBeGreaterThan(0);
  });
});

describe("boxing settings", () => {
  it("defaults to 3 rounds of 3 minutes and saves patches", () => {
    const storage = new MemoryStore();
    expect(loadBoxingSettings(storage)).toMatchObject({ rounds: 3, roundMinutes: 3, restSeconds: 60, stance: "orthodox" });
    saveBoxingSettings(storage, { rounds: 5 });
    saveBoxingSettings(storage, { stance: "southpaw" });
    expect(loadBoxingSettings(storage)).toMatchObject({ rounds: 5, stance: "southpaw" });
  });
});
