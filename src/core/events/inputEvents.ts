/**
 * Discrete events produced by a game's input layer (e.g. `punch:jab`,
 * `slip:left`). The debug overlay lists them; game logic consumes them.
 */
export interface InputEvent {
  type: string;
  /** BodyFrame timestamp (ms) the event was detected on. */
  timestamp: number;
  data?: Record<string, number | string | boolean>;
}

type Listener = (event: InputEvent) => void;

export class InputEventBus {
  private readonly listeners = new Set<Listener>();

  emit(event: InputEvent): void {
    for (const l of this.listeners) l(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
