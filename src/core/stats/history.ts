import type { Storage } from "../storage/storage";

/** One finished session of any game. Games put their own details in `stats`. */
export interface SessionRecord {
  id: string;
  gameId: string;
  /** ISO time the session started. */
  startedAt: string;
  durationMs: number;
  /** Short result line, e.g. "Win by KO, round 2". */
  result: string;
  stats: Record<string, unknown>;
}

const KEY = "stats.sessions";
/** Oldest sessions drop off past this, to keep localStorage small. */
const MAX_SESSIONS = 500;

/** Session history shared across games, behind the storage interface. */
export class SessionHistory {
  constructor(private readonly storage: Storage) {}

  list(gameId?: string): SessionRecord[] {
    const all = this.storage.get<SessionRecord[]>(KEY) ?? [];
    return gameId ? all.filter((s) => s.gameId === gameId) : all;
  }

  add(record: Omit<SessionRecord, "id">): SessionRecord {
    const all = this.list();
    const full = { ...record, id: `${record.gameId}-${Date.parse(record.startedAt) || Date.now()}-${all.length}` };
    all.push(full);
    this.storage.set(KEY, all.slice(-MAX_SESSIONS));
    return full;
  }
}
