import { ROSTER } from "./constants";
import type { DeskState } from "./types";

export function createInitialState(): DeskState {
  return {
    incidents: [],
    units: ROSTER.map((unit) => ({ ...unit })),
    obstructions: [],
    weather: { level: "clear", summary: "Clear over the harbor", since: 0 },
    radio: [],
    notes: [],
    tick: 0,
    processed: 0,
    handlerCounts: {},
    producerCounts: {},
    errors: [],
  };
}
