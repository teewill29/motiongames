import "./style.css";
import { InputEventBus } from "./core/events/inputEvents";
import { calibrationConfig, calibrationConfigSpecs } from "./core/calibration/config";
import { poseConfig, poseConfigSpecs } from "./core/pose/config";
import { SettingsStore } from "./core/settings/settings";
import { LocalStorageStore } from "./core/storage/storage";
import { TunableRegistry } from "./core/tuning/tunables";
import { loadBoxingCalibration } from "./games/boxing/calibration/boxingCalibration";
import { deriveBoxingConfig } from "./games/boxing/calibration/derive";
import { BOXING_SPEC_DEFAULTS, boxingConfig, boxingConfigSpecs } from "./games/boxing/config";
import { BoxingCalibrationScreen } from "./games/boxing/ui/calibrationScreen";
import { DetectionTestScreen } from "./games/boxing/ui/detectionTestScreen";
import { FightScreen } from "./games/boxing/ui/fightScreen";
import { fightConfig, fightConfigSpecs } from "./games/boxing/logic/fightConfig";
import { fighterById, ROSTER } from "./games/boxing/data/roster";
import { HubScreen } from "./ui/hub/hubScreen";
import { PoseTestScreen } from "./ui/posetest/poseTestScreen";
import type { AppContext, Route, Screen } from "./ui/screen";
import { SettingsScreen } from "./ui/settings/settingsScreen";

const storage = new LocalStorageStore();
const tunables = new TunableRegistry(storage);
tunables.register("fight", "Fight rules", fightConfig, fightConfigSpecs);
tunables.register("boxing", "Boxing detection", boxingConfig, boxingConfigSpecs);
tunables.register("pose", "Pose smoothing", poseConfig, poseConfigSpecs);
tunables.register("calibration", "Calibration", calibrationConfig, calibrationConfigSpecs);
// Slider Reset returns to the player's calibrated thresholds, not the spec defaults.
const savedBoxingCalibration = loadBoxingCalibration(storage);
if (savedBoxingCalibration) {
  // Apply them too if nothing has been tuned yet.
  const untuned = storage.get("tunables.boxing") === undefined;
  tunables.setDefaults("boxing", deriveBoxingConfig(savedBoxingCalibration, BOXING_SPEC_DEFAULTS, calibrationConfig), untuned);
}

const root = document.getElementById("app")!;
let current: Screen | null = null;

const app: AppContext = {
  storage,
  settings: new SettingsStore(storage),
  tunables,
  events: new InputEventBus(),
  navigate,
};

function createScreen(route: Route): Screen {
  switch (route.name) {
    case "hub":
      return new HubScreen(app);
    case "settings":
      return new SettingsScreen(app);
    case "poseTest":
      return new PoseTestScreen(app, route.mode);
    case "boxingCalibration":
      return new BoxingCalibrationScreen(app);
    case "boxingDetection":
      return new DetectionTestScreen(app, route.mode);
    case "boxingFight":
      return new FightScreen(app, fighterById(route.fighterId) ?? ROSTER[0]!);
  }
}

function navigate(route: Route): void {
  current?.unmount();
  root.replaceChildren();
  current = createScreen(route);
  current.mount(root);
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
}

window.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) {
    if (e.code !== "Escape") return;
  }
  if (current?.onKey?.(e)) {
    e.preventDefault();
    return;
  }
  if (e.code === "KeyF") {
    toggleFullscreen();
    e.preventDefault();
  }
});

navigate({ name: "hub" });
