import type { Storage } from "../storage/storage";

/**
 * Live-tunable numeric config. Detectors and filters keep their thresholds in
 * config objects; registering a group here exposes each value as a slider in
 * the debug overlay and saves changes to storage.
 *
 * Code reads values straight from the config object (`config.minCutoff`), so
 * there is no lookup cost in hot paths. The registry mutates the object in place.
 */
export interface TunableSpec {
  min: number;
  max: number;
  step: number;
  label?: string;
}

export type TunableSpecs<T> = { [K in keyof T]: TunableSpec };

export interface TunableGroup<T extends Record<string, number> = Record<string, number>> {
  id: string;
  label: string;
  values: T;
  defaults: Readonly<T>;
  specs: TunableSpecs<T>;
}

type Listener = (groupId: string, key: string, value: number) => void;

const storageKey = (groupId: string) => `tunables.${groupId}`;

export class TunableRegistry {
  private readonly groups = new Map<string, TunableGroup>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage?: Storage) {}

  /**
   * Register a config object. Saved overrides are applied to `values` in place.
   * Registering the same id twice returns the existing group.
   */
  register<T extends Record<string, number>>(
    id: string,
    label: string,
    values: T,
    specs: TunableSpecs<T>,
  ): TunableGroup<T> {
    const existing = this.groups.get(id);
    if (existing) return existing as unknown as TunableGroup<T>;

    const group: TunableGroup<T> = { id, label, values, defaults: { ...values } as Readonly<T>, specs };
    const saved = this.storage?.get<Record<string, number>>(storageKey(id));
    if (saved) {
      for (const key of Object.keys(values) as (keyof T & string)[]) {
        const v = saved[key];
        if (typeof v === "number" && Number.isFinite(v)) (values as Record<string, number>)[key] = v;
      }
    }
    this.groups.set(id, group as unknown as TunableGroup);
    return group;
  }

  /** What Reset would return a group to. */
  defaultsOf(groupId: string): Readonly<Record<string, number>> | undefined {
    return this.groups.get(groupId)?.defaults;
  }

  list(): TunableGroup[] {
    return [...this.groups.values()];
  }

  set(groupId: string, key: string, value: number): void {
    const group = this.groups.get(groupId);
    if (!group || !(key in group.values)) return;
    const spec = group.specs[key];
    const clamped = spec ? Math.min(spec.max, Math.max(spec.min, value)) : value;
    group.values[key] = clamped;
    this.save(group);
    for (const l of this.listeners) l(groupId, key, clamped);
  }

  /**
   * Replaces a group's defaults (what Reset returns to), e.g. with values
   * derived from calibration. With `apply`, also sets the current values,
   * overriding saved tweaks.
   */
  setDefaults(groupId: string, values: Record<string, number>, apply: boolean): void {
    const group = this.groups.get(groupId);
    if (!group) return;
    const defaults = group.defaults as Record<string, number>;
    for (const [key, v] of Object.entries(values)) {
      if (!(key in group.values) || !Number.isFinite(v)) continue;
      defaults[key] = v;
      if (apply) {
        group.values[key] = v;
        for (const l of this.listeners) l(groupId, key, v);
      }
    }
    if (apply) this.save(group);
  }

  reset(groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;
    for (const [key, v] of Object.entries(group.defaults)) {
      group.values[key] = v;
      for (const l of this.listeners) l(groupId, key, v);
    }
    this.storage?.remove(storageKey(groupId));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private save(group: TunableGroup): void {
    this.storage?.set(storageKey(group.id), { ...group.values });
  }
}
