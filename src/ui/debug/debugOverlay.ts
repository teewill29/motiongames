import type { InputEvent, InputEventBus } from "../../core/events/inputEvents";
import type { TunableRegistry } from "../../core/tuning/tunables";
import { h } from "../dom";

const MAX_EVENTS = 12;
const STATS_INTERVAL_MS = 100;

/**
 * Debug overlay DOM: stats readout, detected-event log and live threshold
 * sliders. Toggled with D. The skeleton itself is drawn on the screen's canvas.
 */
export class DebugOverlay {
  readonly element: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly eventsEl: HTMLElement;
  private readonly tunablesEl: HTMLElement;
  private readonly events: { e: InputEvent; at: number }[] = [];
  private lastStats = 0;
  private readonly unsubs: (() => void)[] = [];
  private readonly sliders = new Map<string, { input: HTMLInputElement; out: HTMLElement }>();

  constructor(
    private readonly tunables: TunableRegistry,
    bus: InputEventBus,
    visible: boolean,
  ) {
    this.statsEl = h("div", { class: "debug-stats" });
    this.eventsEl = h("ol", { class: "debug-events" });
    this.tunablesEl = h("div", { class: "debug-tunables" });
    this.element = h(
      "div",
      { class: "debug" },
      h("section", { class: "debug-panel debug-left" }, h("h3", {}, "Debug (D)"), this.statsEl, h("h3", {}, "Events"), this.eventsEl),
      h("section", { class: "debug-panel debug-right" }, h("h3", {}, "Thresholds"), this.tunablesEl),
    );
    this.visible = visible;
    this.buildTunables();
    this.unsubs.push(bus.subscribe((e) => this.pushEvent(e)));
    this.unsubs.push(
      tunables.subscribe((g, k, v) => {
        const s = this.sliders.get(`${g}.${k}`);
        if (s && document.activeElement !== s.input) {
          s.input.value = String(v);
          s.out.textContent = fmt(v);
        }
      }),
    );
    this.renderEvents();
  }

  get visible(): boolean {
    return !this.element.hidden;
  }
  set visible(v: boolean) {
    this.element.hidden = !v;
  }

  toggle(): void {
    this.visible = !this.visible;
  }

  /** Stats rows, updated at most 10 times a second. */
  setStats(rows: [string, string][], now: number): void {
    if (!this.visible || now - this.lastStats < STATS_INTERVAL_MS) return;
    this.lastStats = now;
    this.statsEl.replaceChildren(
      ...rows.map(([k, v]) => h("div", { class: "debug-row" }, h("span", {}, k), h("b", {}, v))),
    );
  }

  destroy(): void {
    this.unsubs.forEach((u) => u());
    this.element.remove();
  }

  private pushEvent(e: InputEvent): void {
    this.events.unshift({ e, at: performance.now() });
    this.events.length = Math.min(this.events.length, MAX_EVENTS);
    this.renderEvents();
  }

  private renderEvents(): void {
    if (this.events.length === 0) {
      this.eventsEl.replaceChildren(h("li", { class: "muted" }, "No events yet"));
      return;
    }
    this.eventsEl.replaceChildren(
      ...this.events.map(({ e }) => {
        const data = e.data ? " " + Object.entries(e.data).map(([k, v]) => `${k}=${typeof v === "number" ? fmt(v) : v}`).join(" ") : "";
        return h("li", {}, h("b", {}, e.type), data);
      }),
    );
  }

  private buildTunables(): void {
    for (const group of this.tunables.list()) {
      const rows = Object.keys(group.values).map((key) => {
        const spec = group.specs[key]!;
        const out = h("output", {}, fmt(group.values[key]!));
        const input = h("input", {
          type: "range",
          min: spec.min,
          max: spec.max,
          step: spec.step,
          value: group.values[key]!,
        });
        input.addEventListener("input", () => {
          const v = Number(input.value);
          out.textContent = fmt(v);
          this.tunables.set(group.id, key, v);
        });
        // Keep arrow keys and space on the slider from reaching game hotkeys.
        input.addEventListener("keydown", (e) => e.stopPropagation());
        this.sliders.set(`${group.id}.${key}`, { input, out });
        return h("label", { class: "tunable" }, h("span", {}, spec.label ?? key), input, out);
      });
      const reset = h("button", { class: "small", type: "button" }, "Reset");
      reset.addEventListener("click", () => this.tunables.reset(group.id));
      this.tunablesEl.append(h("fieldset", {}, h("legend", {}, group.label, " ", reset), ...rows));
    }
  }
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}
