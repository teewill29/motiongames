import type { SessionHistory } from "../../core/stats/history";
import type { Storage } from "../../core/storage/storage";
import type { FightState } from "./logic/fight";

/** What a boxing fight saves in its session record. */
export interface BoxingFightStats {
  opponentId: string;
  winner: "player" | "opponent" | "draw";
  method: "KO" | "TKO" | "Decision";
  round: number;
  roundTimeMs: number;
  rounds: number;
  scores: { player: number; opponent: number } | null;
  thrown: number;
  landed: number;
  thrownByType: Record<string, number>;
  landedByType: Record<string, number>;
  counters: number;
  defendedBy: Record<string, number>;
  damageDealt: number;
  damageTaken: number;
  knockdownsScored: number;
  knockdownsSuffered: number;
  activeMs: number;
  punchesPerMinute: number;
}

export function fightStats(s: Readonly<FightState>, opponentId: string): BoxingFightStats {
  const r = s.result!;
  const st = s.stats;
  return {
    opponentId,
    winner: r.winner,
    method: r.method,
    round: r.round,
    roundTimeMs: r.roundTimeMs,
    rounds: s.format.rounds,
    scores: r.scores,
    thrown: st.thrown,
    landed: st.landed,
    thrownByType: { ...st.thrownByType },
    landedByType: { ...st.landedByType },
    counters: st.counters,
    defendedBy: { ...st.defendedBy },
    damageDealt: Math.round(st.damageDealt),
    damageTaken: Math.round(st.damageTaken),
    knockdownsScored: st.knockdownsScored,
    knockdownsSuffered: st.knockdownsSuffered,
    activeMs: Math.round(st.activeMs),
    punchesPerMinute: st.activeMs > 0 ? Math.round((st.thrown / st.activeMs) * 60_000) : 0,
  };
}

export function describeResult(b: BoxingFightStats, opponentName: string): string {
  if (b.winner === "draw") return `Draw with ${opponentName}`;
  const verb = b.winner === "player" ? `Beat ${opponentName}` : `Lost to ${opponentName}`;
  return b.method === "Decision" ? `${verb} by decision` : `${verb} by ${b.method}, round ${b.round}`;
}

/**
 * Ranks results for "best against this fighter": wins beat draws beat losses;
 * among wins, stoppages beat decisions, and earlier is better.
 */
export function resultRank(b: BoxingFightStats): number {
  const outcome = b.winner === "player" ? 2 : b.winner === "draw" ? 1 : 0;
  const stoppage = b.method === "Decision" ? 0 : 1;
  const speed = 1 - Math.min(1, ((b.round - 1) * 180_000 + b.roundTimeMs) / (6 * 180_000));
  return outcome * 10 + stoppage * 2 + speed * (b.winner === "player" ? 1 : 0);
}

const BEST_KEY = "boxing.bests";

export function bestAgainst(storage: Storage, opponentId: string): BoxingFightStats | null {
  return storage.get<Record<string, BoxingFightStats>>(BEST_KEY)?.[opponentId] ?? null;
}

/** Saves the fight to history and updates the best result. Returns the previous best. */
export function saveFight(
  storage: Storage,
  history: SessionHistory,
  s: Readonly<FightState>,
  opponentId: string,
  opponentName: string,
  startedAt: Date,
): { stats: BoxingFightStats; previousBest: BoxingFightStats | null; newBest: boolean } {
  const stats = fightStats(s, opponentId);
  history.add({
    gameId: "boxing",
    startedAt: startedAt.toISOString(),
    durationMs: Math.round(s.time),
    result: describeResult(stats, opponentName),
    stats: stats as unknown as Record<string, unknown>,
  });
  const bests = storage.get<Record<string, BoxingFightStats>>(BEST_KEY) ?? {};
  const previousBest = bests[opponentId] ?? null;
  const newBest = !previousBest || resultRank(stats) > resultRank(previousBest);
  if (newBest) storage.set(BEST_KEY, { ...bests, [opponentId]: stats });
  return { stats, previousBest, newBest };
}
