import type { InputEventBus } from "../core/events/inputEvents";
import type { SettingsStore } from "../core/settings/settings";
import type { Storage } from "../core/storage/storage";
import type { TunableRegistry } from "../core/tuning/tunables";
import type { PoseRecording } from "../core/recorder/format";

/** Shared services handed to every screen. */
export interface AppContext {
  storage: Storage;
  settings: SettingsStore;
  tunables: TunableRegistry;
  events: InputEventBus;
  navigate(route: Route): void;
}

export type Route =
  | { name: "hub" }
  | { name: "settings" }
  | { name: "poseTest"; mode: "live" }
  | { name: "poseTest"; mode: "replay"; recording: PoseRecording; fileName: string };

export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
  /** Return true if the key was handled. */
  onKey?(e: KeyboardEvent): boolean;
}
