import type { Storage } from "../../core/storage/storage";
import type { Stance } from "./types";

export interface BoxingSettings {
  stance: Stance;
}

const KEY = "boxing.settings";

export function loadBoxingSettings(storage: Storage): BoxingSettings {
  return { stance: "orthodox", ...storage.get<Partial<BoxingSettings>>(KEY) };
}

export function saveBoxingSettings(storage: Storage, s: BoxingSettings): void {
  storage.set(KEY, s);
}
