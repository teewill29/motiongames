import dustyHale from "./opponents/dusty-hale.json";
import { validateFighter, type FighterData } from "./fighter";

/** Ladder order. Phase 4 adds the rest of the roster. */
// JSON imports are loosely typed; validateFighter checks what the type system cannot.
export const ROSTER: readonly FighterData[] = [validateFighter(dustyHale as unknown as FighterData)];

export function fighterById(id: string): FighterData | undefined {
  return ROSTER.find((f) => f.id === id);
}
