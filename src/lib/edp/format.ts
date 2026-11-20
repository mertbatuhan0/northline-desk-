import { DISTRICTS, KIND_LABEL } from "./constants";
import type { DeskState, Envelope, EventType } from "./types";

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatStamp(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const fraction = Math.floor(clamped % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`;
}

export type EventTone = "call" | "unit" | "radio" | "world" | "time";

export function eventTone(type: EventType): EventTone {
  if (type.startsWith("incident") || type.startsWith("dispatch")) return "call";
  if (type.startsWith("unit")) return "unit";
  if (type === "radio.transmission") return "radio";
  if (type.startsWith("weather") || type.startsWith("traffic")) return "world";
  return "time";
}

export function describeEvent(event: Envelope, state?: DeskState): string {
  const unitName = (id: string) => state?.units.find((unit) => unit.id === id)?.callSign ?? id;
  const districtName = (id: keyof typeof DISTRICTS) => DISTRICTS[id].label;

  switch (event.type) {
    case "shift.note":
      return event.payload.text;
    case "clock.tick":
      return `Tick ${event.payload.tick}`;
    case "incident.reported":
      return `P${event.payload.priority} ${KIND_LABEL[event.payload.kind]} · ${districtName(event.payload.district)} · ${event.payload.summary}`;
    case "incident.updated":
      return `Updated ${event.payload.incidentId}${event.payload.priority ? ` to P${event.payload.priority}` : ""}`;
    case "incident.escalated":
      return event.payload.pageSupervisor
        ? `Supervisor paged · ${event.payload.reason}`
        : `P${event.payload.from} raised to P${event.payload.to}`;
    case "incident.resolved":
      return `${event.payload.by} closed ${event.payload.incidentId}`;
    case "dispatch.deferred":
      return event.payload.reason;
    case "unit.dispatched":
      return `${unitName(event.payload.unitId)} assigned to ${event.payload.incidentId}`;
    case "unit.enroute":
      return `${unitName(event.payload.unitId)} en route`;
    case "unit.onscene":
      return `${unitName(event.payload.unitId)} on scene`;
    case "unit.cleared":
      return `${unitName(event.payload.unitId)} clear`;
    case "unit.status_changed":
      return `${unitName(event.payload.unitId)} ${event.payload.status === "available" ? "returned" : "held"} · ${event.payload.reason}`;
    case "radio.transmission":
      return `${event.payload.from}: ${event.payload.text}`;
    case "weather.advisory":
      return `${event.payload.level === "warning" ? "Warning" : "Advisory"} · ${event.payload.summary}`;
    case "weather.cleared":
      return event.payload.summary;
    case "traffic.obstruction":
      return `${districtName(event.payload.district)} blocked · ${event.payload.summary}`;
    case "traffic.cleared":
      return `Street open · ${event.payload.obstructionId}`;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
