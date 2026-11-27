import type { Storage } from "../../core/storage/storage";
import type { Stance } from "./types";

export interface BoxingSettings {
  stance: Stance;
  /** 1-6 */
  rounds: number;
  /** 1-3 */
  roundMinutes: number;
  restSeconds: number;
  /** Play sound effects and the referee's voice. */
  sound: boolean;
}

export const DEFAULT_BOXING_SETTINGS: BoxingSettings = {
  stance: "orthodox",
  rounds: 3,
  roundMinutes: 3,
  restSeconds: 60,
  sound: true,
};

const KEY = "boxing.settings";

export function loadBoxingSettings(storage: Storage): BoxingSettings {
  return { ...DEFAULT_BOXING_SETTINGS, ...storage.get<Partial<BoxingSettings>>(KEY) };
}

export function saveBoxingSettings(storage: Storage, patch: Partial<BoxingSettings>): void {
  storage.set(KEY, { ...loadBoxingSettings(storage), ...patch });
}
