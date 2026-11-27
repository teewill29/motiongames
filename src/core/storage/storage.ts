/**
 * Key-value persistence. Everything that saves data goes through this
 * interface so localStorage can be swapped for a database later.
 */
export interface Storage {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

const PREFIX = "motiongames:";

/** Browser implementation. Values are JSON-encoded under a namespaced key. */
export class LocalStorageStore implements Storage {
  constructor(private readonly backing: globalThis.Storage = window.localStorage) {}

  get<T>(key: string): T | undefined {
    let raw: string | null;
    try {
      raw = this.backing.getItem(PREFIX + key);
    } catch {
      return undefined;
    }
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      this.backing.setItem(PREFIX + key, JSON.stringify(value));
    } catch (err) {
      console.warn(`[storage] could not save "${key}"`, err);
    }
  }

  remove(key: string): void {
    try {
      this.backing.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }
}

/** In-memory implementation for tests and as a fallback. */
export class MemoryStore implements Storage {
  private readonly data = new Map<string, string>();

  get<T>(key: string): T | undefined {
    const raw = this.data.get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }

  set<T>(key: string, value: T): void {
    this.data.set(key, JSON.stringify(value));
  }

  remove(key: string): void {
    this.data.delete(key);
  }
}
