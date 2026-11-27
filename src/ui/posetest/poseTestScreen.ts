import { loadProfile } from "../../core/calibration/profile";
import { h } from "../dom";
import { PoseStage, type StageMode } from "../pose/poseStage";
import type { AppContext, Screen } from "../screen";

/** Camera feed or replay with the skeleton and recorder. No game logic. */
export class PoseTestScreen implements Screen {
  private stage!: PoseStage;
  private root!: HTMLElement;
  private lastTracked = false;

  constructor(
    private readonly app: AppContext,
    private readonly mode: StageMode,
  ) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.stage = new PoseStage(this.app, {
      mode: this.mode,
      profile: loadProfile(this.app.storage),
      onFrame: (frame) => {
        if (frame.tracked !== this.lastTracked) {
          this.lastTracked = frame.tracked;
          this.app.events.emit({ type: frame.tracked ? "tracking:found" : "tracking:lost", timestamp: frame.timestamp });
        }
      },
    });
    this.stage.mount(root);
    const back = h("button", { class: "corner-button", type: "button" }, "← Hub (Esc)");
    back.addEventListener("click", () => this.app.navigate({ name: "hub" }));
    root.append(back);
  }

  unmount(): void {
    this.stage.unmount();
    this.root.replaceChildren();
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.code === "Escape") {
      this.app.navigate({ name: "hub" });
      return true;
    }
    return this.stage.onKey(e);
  }
}
