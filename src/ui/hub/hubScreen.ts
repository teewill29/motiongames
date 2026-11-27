import { parseRecording, RecordingFormatError } from "../../core/recorder/format";
import { h } from "../dom";
import type { AppContext, Screen } from "../screen";

/** Home screen. Mouse and keyboard only. */
export class HubScreen implements Screen {
  private root!: HTMLElement;
  private error!: HTMLElement;
  private fileInput!: HTMLInputElement;

  constructor(private readonly app: AppContext) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.error = h("p", { class: "hub-error", hidden: true });
    this.fileInput = h("input", { type: "file", accept: ".json,application/json", hidden: true });
    this.fileInput.addEventListener("change", () => {
      const file = this.fileInput.files?.[0];
      if (file) void this.openRecording(file);
      this.fileInput.value = "";
    });

    const tile = (title: string, sub: string, onClick: (() => void) | null, key?: string) => {
      const el = h(
        "button",
        { class: "tile", type: "button", disabled: !onClick },
        h("span", { class: "tile-title" }, title),
        h("span", { class: "tile-sub" }, sub),
        key ? h("kbd", {}, key) : null,
      );
      if (onClick) el.addEventListener("click", onClick);
      return el;
    };

    const grid = h(
      "div",
      { class: "tiles" },
      tile("Boxing", "Coming in Phase 2", null),
      tile("Treadmill Runner", "Planned", null),
      tile("Pose Test", "Camera, skeleton and recorder", () => this.app.navigate({ name: "poseTest", mode: "live" }), "1"),
      tile("Replay", "Load a recorded pose session", () => this.fileInput.click(), "2"),
      tile("Settings", "Camera and tracking model", () => this.app.navigate({ name: "settings" }), "3"),
    );

    const drop = h("p", { class: "hub-hint" }, "Drop a recording .json anywhere to replay it. F toggles fullscreen.");

    root.append(
      h("main", { class: "hub" }, h("h1", {}, "Motion Games"), grid, this.error, drop, this.fileInput),
    );

    root.addEventListener("dragover", this.onDragOver);
    root.addEventListener("drop", this.onDrop);
  }

  unmount(): void {
    this.root.removeEventListener("dragover", this.onDragOver);
    this.root.removeEventListener("drop", this.onDrop);
    this.root.replaceChildren();
  }

  onKey(e: KeyboardEvent): boolean {
    switch (e.key) {
      case "1":
        this.app.navigate({ name: "poseTest", mode: "live" });
        return true;
      case "2":
        this.fileInput.click();
        return true;
      case "3":
        this.app.navigate({ name: "settings" });
        return true;
    }
    return false;
  }

  private readonly onDragOver = (e: DragEvent) => e.preventDefault();
  private readonly onDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) void this.openRecording(file);
  };

  private async openRecording(file: File): Promise<void> {
    try {
      const recording = parseRecording(await file.text());
      this.app.navigate({ name: "poseTest", mode: "replay", recording, fileName: file.name });
    } catch (err) {
      this.error.hidden = false;
      this.error.textContent =
        err instanceof RecordingFormatError ? `${file.name}: ${err.message}` : `Could not open ${file.name}.`;
    }
  }
}
