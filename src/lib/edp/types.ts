export const EVENT_TYPES = [
  "shift.note",
  "clock.tick",
  "incident.reported",
  "incident.updated",
  "incident.escalated",
  "incident.resolved",
  "dispatch.deferred",
  "unit.dispatched",
  "unit.enroute",
  "unit.onscene",
  "unit.cleared",
  "unit.status_changed",
  "radio.transmission",
  "weather.advisory",
  "weather.cleared",
  "traffic.obstruction",
  "traffic.cleared",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type ProducerId =
  | "operator"
  | "city-simulator"
  | "station-clock"
  | "dispatch"
  | "escalation"
  | "movement"
  | "radio";

export type Kind = "medical" | "fire" | "rescue" | "police" | "utility";
export type Priority = 1 | 2 | 3;
export type DistrictId = "harbor" | "mill" | "ridge" | "campus" | "market" | "yards";
export type UnitType = "medic" | "engine" | "rescue" | "patrol";
export type UnitStatus = "available" | "dispatched" | "enroute" | "onscene" | "unavailable";
export type IncidentStatus = "open" | "dispatched" | "enroute" | "onscene" | "resolved";
export type WeatherLevel = "clear" | "advisory" | "warning";
export type Speed = 1 | 2 | 4;

export interface PayloadMap {
  "shift.note": { text: string };
  "clock.tick": { tick: number };
  "incident.reported": {
    incidentId: string;
    kind: Kind;
    priority: Priority;
    district: DistrictId;
    summary: string;
    reporter: string;
  };
  "incident.updated": {
    incidentId: string;
    summary?: string;
    priority?: Priority;
  };
  "incident.escalated": {
    incidentId: string;
    from: Priority;
    to: Priority;
    reason: string;
    pageSupervisor: boolean;
  };
  "incident.resolved": { incidentId: string; by: string };
  "dispatch.deferred": { incidentId: string; reason: string };
  "unit.dispatched": {
    incidentId: string;
    unitId: string;
    enrouteAt: number;
    onSceneAt: number;
  };
  "unit.enroute": { incidentId: string; unitId: string };
  "unit.onscene": { incidentId: string; unitId: string };
  "unit.cleared": { incidentId: string; unitId: string };
  "unit.status_changed": {
    unitId: string;
    status: "available" | "unavailable";
    reason: string;
  };
  "radio.transmission": { from: string; text: string };
  "weather.advisory": { level: "advisory" | "warning"; summary: string };
  "weather.cleared": { summary: string };
  "traffic.obstruction": { obstructionId: string; district: DistrictId; summary: string };
  "traffic.cleared": { obstructionId: string };
}

export type Envelope = {
  [T in EventType]: {
    id: string;
    type: T;
    priority: number;
    producer: ProducerId;
    producedAt: number;
    deliveredAt: number;
    notBefore: number;
    correlationId: string;
    sequence: number;
    payload: PayloadMap[T];
  };
}[EventType];

export type ProduceInput = {
  [T in EventType]: {
    type: T;
    producer: ProducerId;
    payload: PayloadMap[T];
    notBefore?: number;
    correlationId?: string;
    priority?: number;
  };
}[EventType];

export interface Incident {
  id: string;
  kind: Kind;
  priority: Priority;
  initialPriority: Priority;
  district: DistrictId;
  summary: string;
  reporter: string;
  status: IncidentStatus;
  unitId?: string;
  reportedAt: number;
  prioritySince: number;
  onSceneAt?: number;
  resolvedAt?: number;
  supervisorPaged: boolean;
  escalationCount: number;
  holdReason?: string;
}

export interface Unit {
  id: string;
  callSign: string;
  type: UnitType;
  district: DistrictId;
  status: UnitStatus;
  incidentId?: string;
}

export interface Obstruction {
  id: string;
  district: DistrictId;
  summary: string;
  since: number;
}

export interface RadioLine {
  id: string;
  at: number;
  from: string;
  text: string;
}

export interface ShiftNote {
  id: string;
  at: number;
  text: string;
}

export interface WeatherState {
  level: WeatherLevel;
  summary: string;
  since: number;
}

export interface HandlerError {
  at: number;
  handler: string;
  eventId: string;
  eventType: string;
  message: string;
}

export interface DeskState {
  incidents: Incident[];
  units: Unit[];
  obstructions: Obstruction[];
  weather: WeatherState;
  radio: RadioLine[];
  notes: ShiftNote[];
  tick: number;
  processed: number;
  handlerCounts: Record<string, number>;
  producerCounts: Record<string, number>;
  errors: HandlerError[];
}

export interface HandlerHost {
  simNow: number;
  state: DeskState;
  log: Envelope[];
  produce: (input: ProduceInput) => void;
  cancel: (predicate: (event: Envelope) => boolean) => number;
}
