import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsStore } from "../src/core/settings/settings";
import { MemoryStore } from "../src/core/storage/storage";
import { TunableRegistry } from "../src/core/tuning/tunables";

const specs = {
  a: { min: 0, max: 1, step: 0.1 },
  b: { min: 10, max: 20, step: 1 },
};

describe("TunableRegistry", () => {
  it("mutates the config object in place, clamps, and persists", () => {
    const storage = new MemoryStore();
    const cfg = { a: 0.5, b: 15 };
    const reg = new TunableRegistry(storage);
    reg.register("g", "Group", cfg, specs);
    reg.set("g", "a", 0.8);
    reg.set("g", "b", 99);
    expect(cfg).toEqual({ a: 0.8, b: 20 });

    const cfg2 = { a: 0.5, b: 15 };
    new TunableRegistry(storage).register("g", "Group", cfg2, specs);
    expect(cfg2).toEqual({ a: 0.8, b: 20 });
  });

  it("resets to defaults and clears saved values", () => {
    const storage = new MemoryStore();
    const cfg = { a: 0.5, b: 15 };
    const reg = new TunableRegistry(storage);
    reg.register("g", "Group", cfg, specs);
    const seen: string[] = [];
    reg.subscribe((g, k, v) => seen.push(`${g}.${k}=${v}`));
    reg.set("g", "a", 0.1);
    reg.reset("g");
    expect(cfg).toEqual({ a: 0.5, b: 15 });
    expect(storage.get("tunables.g")).toBeUndefined();
    expect(seen).toContain("g.a=0.5");
  });

  it("ignores unknown groups and keys", () => {
    const reg = new TunableRegistry();
    reg.set("nope", "a", 1);
    const cfg = { a: 0.5 };
    reg.register("g", "G", cfg, { a: specs.a });
    reg.set("g", "zzz", 1);
    expect(cfg).toEqual({ a: 0.5 });
  });
});

describe("SettingsStore", () => {
  it("merges saved values over defaults and notifies on update", () => {
    const storage = new MemoryStore();
    storage.set("settings.app", { poseModel: "lite" });
    const s = new SettingsStore(storage);
    expect(s.get()).toEqual({ ...DEFAULT_SETTINGS, poseModel: "lite" });
    let notified = false;
    s.subscribe(() => (notified = true));
    s.update({ cameraFps: 60 });
    expect(notified).toBe(true);
    expect(new SettingsStore(storage).get().cameraFps).toBe(60);
  });
});
