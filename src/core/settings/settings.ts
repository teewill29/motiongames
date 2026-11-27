import type { Storage } from "../storage/storage";

export type PoseModel = "full" | "lite";

export interface AppSettings {
  /** deviceId of the chosen camera, or null for the browser default. */
  cameraDeviceId: string | null;
  /** Requested camera frame rate. The camera may deliver less. */
  cameraFps: 30 | 60;
  poseModel: PoseModel;
  /** Whether the debug overlay starts open on game screens. */
  debugOverlayDefault: boolean;
  /** 0 to 1. Used once audio exists. */
  volume: number;
  units: "miles" | "kilometers";
}

export const DEFAULT_SETTINGS: AppSettings = {
  cameraDeviceId: null,
  cameraFps: 30,
  poseModel: "full",
  debugOverlayDefault: true,
  volume: 0.8,
  units: "miles",
};

const KEY = "settings.app";

type Listener = (settings: AppSettings) => void;

export class SettingsStore {
  private current: AppSettings;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage: Storage) {
    const saved = storage.get<Partial<AppSettings>>(KEY) ?? {};
    // Merge over defaults so new settings get sane values on old saves.
    this.current = { ...DEFAULT_SETTINGS, ...saved };
  }

  get(): Readonly<AppSettings> {
    return this.current;
  }

  update(patch: Partial<AppSettings>): void {
    this.current = { ...this.current, ...patch };
    this.storage.set(KEY, this.current);
    for (const l of this.listeners) l(this.current);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
