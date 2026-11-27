import type { FightEvent, FightState } from "../logic/fight";

/** Where the player's gloves are, from tracking. View data for drawing only. */
export interface GloveView {
  /** 0-1 across the screen (already mirrored: your right hand on the right). */
  x: number;
  /** 0-1 down the screen. */
  y: number;
  /** 0 = in guard, 1 = fully extended toward the opponent. */
  reach: number;
}

export interface PlayerView {
  left: GloveView | null;
  right: GloveView | null;
}

/**
 * Draws a fight. The logic never imports this; the 3D renderer will implement
 * the same interface. Renderers read state and events, and never change them.
 */
export interface BoxingRenderer {
  /** New events since the last frame, for effects (flashes, pops, shake). */
  onEvents(events: readonly FightEvent[], now: number): void;
  render(state: Readonly<FightState>, view: PlayerView, now: number): void;
}
