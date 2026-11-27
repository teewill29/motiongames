import "./style.css";
import { InputEventBus } from "./core/events/inputEvents";
import { poseConfig, poseConfigSpecs } from "./core/pose/config";
import { SettingsStore } from "./core/settings/settings";
import { LocalStorageStore } from "./core/storage/storage";
import { TunableRegistry } from "./core/tuning/tunables";
import { HubScreen } from "./ui/hub/hubScreen";
import { PoseTestScreen } from "./ui/posetest/poseTestScreen";
import type { AppContext, Route, Screen } from "./ui/screen";
import { SettingsScreen } from "./ui/settings/settingsScreen";

const storage = new LocalStorageStore();
const tunables = new TunableRegistry(storage);
tunables.register("pose", "Pose smoothing", poseConfig, poseConfigSpecs);

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
      return new PoseTestScreen(
        app,
        route.mode === "live"
          ? { kind: "live" }
          : { kind: "replay", recording: route.recording, fileName: route.fileName },
      );
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
