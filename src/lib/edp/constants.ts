import type { DistrictId, Kind, Priority, Unit, UnitType } from "./types";

export const SLA_MS: Record<Priority, number> = {
  3: 20_000,
  2: 16_000,
  1: 12_000,
};

export const CLEAR_DELAY_MS = 2_500;

export const INCIDENT_INTERVAL: [number, number] = [10_000, 18_000];
export const WEATHER_INTERVAL: [number, number] = [28_000, 48_000];
export const TRAFFIC_INTERVAL: [number, number] = [16_000, 30_000];

export const FIRST_INCIDENT_AT = 8_000;
export const FIRST_WEATHER_AT = 22_000;
export const FIRST_TRAFFIC_AT = 14_000;

export const PREFERRED_UNITS: Record<Kind, readonly UnitType[]> = {
  medical: ["medic", "rescue"],
  fire: ["engine", "rescue"],
  rescue: ["rescue", "engine", "medic"],
  police: ["patrol"],
  utility: ["patrol", "engine"],
};

export interface District {
  id: DistrictId;
  label: string;
  x: number;
  y: number;
}

export const DISTRICTS: Record<DistrictId, District> = {
  harbor: { id: "harbor", label: "Harbor", x: 0, y: 2 },
  mill: { id: "mill", label: "Old Mill", x: 1, y: 1 },
  ridge: { id: "ridge", label: "Ridge", x: 3, y: 0 },
  campus: { id: "campus", label: "Campus", x: 2, y: 2 },
  market: { id: "market", label: "Market", x: 1, y: 3 },
  yards: { id: "yards", label: "Yards", x: 3, y: 3 },
};

export const DISTRICT_ORDER: DistrictId[] = [
  "harbor",
  "mill",
  "ridge",
  "campus",
  "market",
  "yards",
];

export interface MapCell {
  district?: DistrictId;
  hint?: string;
}

export const CITY_MAP: MapCell[][] = [
  [{ hint: "park" }, { hint: "park" }, { hint: "trees" }, { district: "ridge" }],
  [{ hint: "lane" }, { district: "mill" }, { hint: "hill" }, { hint: "hill" }],
  [{ district: "harbor" }, { hint: "channel" }, { district: "campus" }, { hint: "fields" }],
  [{ hint: "quay" }, { district: "market" }, { hint: "tracks" }, { district: "yards" }],
];

export const ROSTER: readonly Unit[] = [
  { id: "M1", callSign: "Medic 1", type: "medic", district: "harbor", status: "available" },
  { id: "M2", callSign: "Medic 2", type: "medic", district: "campus", status: "available" },
  { id: "E1", callSign: "Engine 1", type: "engine", district: "yards", status: "available" },
  { id: "E2", callSign: "Engine 2", type: "engine", district: "ridge", status: "available" },
  { id: "R1", callSign: "Rescue 1", type: "rescue", district: "mill", status: "available" },
  { id: "P1", callSign: "Patrol 1", type: "patrol", district: "market", status: "available" },
  { id: "P2", callSign: "Patrol 2", type: "patrol", district: "harbor", status: "available" },
  { id: "P3", callSign: "Patrol 3", type: "patrol", district: "campus", status: "available" },
];

export interface IncidentScenario {
  kind: Kind;
  priority: Priority;
  district: DistrictId;
  summary: string;
  reporter: string;
}

export const INCIDENT_SCENARIOS: readonly IncidentScenario[] = [
  {
    kind: "medical",
    priority: 1,
    district: "market",
    summary: "Person collapsed outside the Saturday bakery",
    reporter: "Market stall 12",
  },
  {
    kind: "medical",
    priority: 2,
    district: "campus",
    summary: "Student with a suspected fracture at the gym",
    reporter: "Campus security",
  },
  {
    kind: "medical",
    priority: 3,
    district: "harbor",
    summary: "Dock worker with a cut hand, bleeding controlled",
    reporter: "Pier office",
  },
  {
    kind: "fire",
    priority: 1,
    district: "harbor",
    summary: "Smoke from the fish-smokehouse roof",
    reporter: "Passing ferry",
  },
  {
    kind: "fire",
    priority: 2,
    district: "mill",
    summary: "Kitchen alarm at the wool warehouse cafe",
    reporter: "Alarm company",
  },
  {
    kind: "fire",
    priority: 3,
    district: "yards",
    summary: "Rubbish fire in a skip behind the depot",
    reporter: "Yard watchman",
  },
  {
    kind: "rescue",
    priority: 1,
    district: "ridge",
    summary: "Walker slipped on the cliff path above the ridge",
    reporter: "Hiking partner",
  },
  {
    kind: "rescue",
    priority: 2,
    district: "harbor",
    summary: "Line tangled around a moored mast, person still aboard",
    reporter: "Harbor master",
  },
  {
    kind: "police",
    priority: 1,
    district: "yards",
    summary: "Driver refusing to stop at the freight gate",
    reporter: "Gate house",
  },
  {
    kind: "police",
    priority: 2,
    district: "market",
    summary: "Disturbance between two stallholders on the east aisle",
    reporter: "Market steward",
  },
  {
    kind: "police",
    priority: 3,
    district: "campus",
    summary: "Noise complaint from the late studio block",
    reporter: "Resident advisor",
  },
  {
    kind: "utility",
    priority: 2,
    district: "mill",
    summary: "Gas smell in the lane behind the mill wheel",
    reporter: "Neighbor",
  },
  {
    kind: "utility",
    priority: 3,
    district: "campus",
    summary: "Streetlight cable down, no sparking",
    reporter: "Night porter",
  },
  {
    kind: "medical",
    priority: 2,
    district: "ridge",
    summary: "Cyclist down at the ridge switchback",
    reporter: "Following rider",
  },
  {
    kind: "fire",
    priority: 1,
    district: "market",
    summary: "Oil fire in a fryer, stall being cleared",
    reporter: "Stallholder",
  },
];

export const WEATHER_SCENARIOS: readonly { level: "advisory" | "warning"; summary: string }[] = [
  { level: "advisory", summary: "Fog bank moving up the harbor channel" },
  { level: "warning", summary: "High wind on the ridge, gusts past the crane limit" },
  { level: "advisory", summary: "Freezing drizzle on the mill cobbles" },
  { level: "warning", summary: "Thunderstorm cell sitting over the yards" },
];

export const TRAFFIC_SCENARIOS: readonly { district: DistrictId; summary: string }[] = [
  { district: "harbor", summary: "Bascule bridge stuck open" },
  { district: "market", summary: "Saturday parade blocking the east aisle" },
  { district: "mill", summary: "Flooded underpass on Mill Lane" },
  { district: "campus", summary: "Bus broken down at the campus gate" },
  { district: "yards", summary: "Freight train holding the yard crossing" },
  { district: "ridge", summary: "Rockfall on the ridge road" },
];

export const KIND_LABEL: Record<Kind, string> = {
  medical: "Medical",
  fire: "Fire",
  rescue: "Rescue",
  police: "Police",
  utility: "Utility",
};

export const ORIGIN_PRODUCERS = [
  {
    id: "operator",
    label: "Operator console",
    detail: "Files reports, amends priority, resolves, holds a unit, clears a street",
  },
  {
    id: "city-simulator",
    label: "City simulator",
    detail: "Drops incidents, weather, and blocked streets while it is armed",
  },
  {
    id: "station-clock",
    label: "Station clock",
    detail: "Opens the watch and emits one tick each simulated second",
  },
] as const;

export const HANDLER_BLURBS: Record<string, string> = {
  audit: "Writes every delivered event onto the tape",
  projection: "Folds the event into the board you see",
  dispatch: "Assigns the nearest suitable free unit",
  escalation: "Raises a waiting call when its timer expires",
  movement: "Schedules en route, on scene, wrap-up, and clear",
  radio: "Turns an action into one spoken line",
};

export function workDuration(priority: Priority): number {
  return 6_000 + priority * 2_000;
}

export function manhattan(from: DistrictId, to: DistrictId): number {
  const a = DISTRICTS[from];
  const b = DISTRICTS[to];
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
