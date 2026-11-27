import { listCameras, openCamera, stopStream } from "../../core/camera/camera";
import type { AppSettings } from "../../core/settings/settings";
import { loadBoxingSettings, saveBoxingSettings } from "../../games/boxing/settings";
import { h } from "../dom";
import type { AppContext, Screen } from "../screen";

export class SettingsScreen implements Screen {
  private root!: HTMLElement;

  constructor(private readonly app: AppContext) {}

  mount(root: HTMLElement): void {
    this.root = root;
    const s = this.app.settings.get();
    const update = (patch: Partial<AppSettings>) => this.app.settings.update(patch);

    const camera = h("select", {}, h("option", { value: "" }, "Default camera"));
    camera.addEventListener("change", () => update({ cameraDeviceId: camera.value || null }));
    const camHint = h("span", { class: "hint" });
    void this.fillCameras(camera, camHint, s.cameraDeviceId);

    const fps = h(
      "select",
      {},
      h("option", { value: 30, selected: s.cameraFps === 30 }, "30 fps"),
      h("option", { value: 60, selected: s.cameraFps === 60 }, "60 fps (if the camera supports it)"),
    );
    fps.addEventListener("change", () => update({ cameraFps: Number(fps.value) === 60 ? 60 : 30 }));

    const model = h(
      "select",
      {},
      h("option", { value: "full", selected: s.poseModel === "full" }, "Full (more accurate)"),
      h("option", { value: "lite", selected: s.poseModel === "lite" }, "Lite (faster, for slower laptops)"),
    );
    model.addEventListener("change", () => update({ poseModel: model.value === "lite" ? "lite" : "full" }));

    const debug = h("input", { type: "checkbox", checked: s.debugOverlayDefault });
    debug.addEventListener("change", () => update({ debugOverlayDefault: debug.checked }));

    const volume = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: s.volume });
    volume.addEventListener("input", () => update({ volume: Number(volume.value) }));

    // Boxing.
    const bs = loadBoxingSettings(this.app.storage);
    const select = (values: number[], current: number, label: (v: number) => string, save: (v: number) => void) => {
      const el = h("select", {}, ...values.map((v) => h("option", { value: v, selected: v === current }, label(v))));
      el.addEventListener("change", () => save(Number(el.value)));
      return el;
    };
    const rounds = select([1, 2, 3, 4, 5, 6], bs.rounds, (v) => `${v} round${v > 1 ? "s" : ""}`, (v) => saveBoxingSettings(this.app.storage, { rounds: v }));
    const roundMin = select([1, 2, 3], bs.roundMinutes, (v) => `${v} minute${v > 1 ? "s" : ""}`, (v) => saveBoxingSettings(this.app.storage, { roundMinutes: v }));
    const rest = select([30, 60], bs.restSeconds, (v) => `${v} seconds`, (v) => saveBoxingSettings(this.app.storage, { restSeconds: v }));
    const sound = h("input", { type: "checkbox", checked: bs.sound });
    sound.addEventListener("change", () => saveBoxingSettings(this.app.storage, { sound: sound.checked }));

    const back = h("button", { type: "button" }, "← Back (Esc)");
    back.addEventListener("click", () => this.app.navigate({ name: "hub" }));

    root.append(
      h(
        "main",
        { class: "settings" },
        h("h1", {}, "Settings"),
        h("label", {}, h("span", {}, "Camera"), camera, camHint),
        h("label", {}, h("span", {}, "Camera frame rate"), fps),
        h("label", {}, h("span", {}, "Pose model"), model),
        h("label", { class: "inline" }, debug, h("span", {}, "Show debug overlay when a screen opens")),
        h("label", {}, h("span", {}, "Volume"), volume),
        h("h2", {}, "Boxing"),
        h("label", {}, h("span", {}, "Rounds"), rounds),
        h("label", {}, h("span", {}, "Round length"), roundMin),
        h("label", {}, h("span", {}, "Rest between rounds"), rest),
        h("label", { class: "inline" }, sound, h("span", {}, "Sound and referee voice")),
        back,
      ),
    );
  }

  unmount(): void {
    this.root.replaceChildren();
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.code === "Escape") {
      this.app.navigate({ name: "hub" });
      return true;
    }
    return false;
  }

  private async fillCameras(select: HTMLSelectElement, hint: HTMLElement, current: string | null): Promise<void> {
    try {
      let cams = await listCameras();
      // Labels stay blank until permission is granted once; ask so the list is readable.
      if (cams.length > 0 && cams.every((c) => /^Camera \d+$/.test(c.label))) {
        const stream = await openCamera({ deviceId: null, fps: 30 }).catch(() => null);
        stopStream(stream);
        cams = await listCameras();
      }
      for (const c of cams) select.append(h("option", { value: c.deviceId, selected: c.deviceId === current }, c.label));
      hint.textContent = cams.length === 0 ? "No cameras found" : `${cams.length} found`;
    } catch {
      hint.textContent = "Could not list cameras";
    }
  }
}
