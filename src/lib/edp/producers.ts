import {
  FIRST_INCIDENT_AT,
  FIRST_TRAFFIC_AT,
  FIRST_WEATHER_AT,
  INCIDENT_INTERVAL,
  INCIDENT_SCENARIOS,
  TRAFFIC_INTERVAL,
  TRAFFIC_SCENARIOS,
  WEATHER_INTERVAL,
  WEATHER_SCENARIOS,
} from "./constants";
import type { Rng } from "./rng";
import type {
  DistrictId,
  Kind,
  Priority,
  ProduceInput,
  WeatherLevel,
} from "./types";

export const OPENING_NOTE =
  "Northline watch is open. Eight units on the board. The queue stays on this desk.";

export function watchOpened(): ProduceInput {
  return {
    type: "shift.note",
    producer: "station-clock",
    correlationId: "shift",
    payload: { text: OPENING_NOTE },
  };
}

export function clockTick(tick: number): ProduceInput {
  return {
    type: "clock.tick",
    producer: "station-clock",
    correlationId: "clock",
    payload: { tick },
  };
}

export function reportedByOperator(input: {
  incidentId: string;
  kind: Kind;
  priority: Priority;
  district: DistrictId;
  summary: string;
  reporter: string;
}): ProduceInput {
  return {
    type: "incident.reported",
    producer: "operator",
    correlationId: input.incidentId,
    payload: input,
  };
}

export function updatedByOperator(input: {
  incidentId: string;
  summary?: string;
  priority?: Priority;
}): ProduceInput {
  return {
    type: "incident.updated",
    producer: "operator",
    correlationId: input.incidentId,
    payload: input,
  };
}

export function resolvedByOperator(incidentId: string, by: string): ProduceInput {
  return {
    type: "incident.resolved",
    producer: "operator",
    correlationId: incidentId,
    payload: { incidentId, by },
  };
}

export function unitStatusByOperator(
  unitId: string,
  status: "available" | "unavailable",
  reason: string,
): ProduceInput {
  return {
    type: "unit.status_changed",
    producer: "operator",
    correlationId: unitId,
    payload: { unitId, status, reason },
  };
}

export function obstructionClearedByOperator(obstructionId: string): ProduceInput {
  return {
    type: "traffic.cleared",
    producer: "operator",
    correlationId: obstructionId,
    payload: { obstructionId },
  };
}

export function weatherClearedByOperator(): ProduceInput {
  return {
    type: "weather.cleared",
    producer: "operator",
    correlationId: "weather",
    payload: { summary: "Operator logged a weather all-clear." },
  };
}

export interface CityPlanInput {
  now: number;
  rng: Rng;
  weather: WeatherLevel;
  obstructions: { id: string; district: DistrictId }[];
  nextIncidentAt: number;
  nextWeatherAt: number;
  nextTrafficAt: number;
  takeIncidentId: () => string;
  takeObstructionId: () => string;
}

export interface CityPlan {
  events: ProduceInput[];
  nextIncidentAt: number;
  nextWeatherAt: number;
  nextTrafficAt: number;
}

export function initialSchedule(): {
  nextIncidentAt: number;
  nextWeatherAt: number;
  nextTrafficAt: number;
} {
  return {
    nextIncidentAt: FIRST_INCIDENT_AT,
    nextWeatherAt: FIRST_WEATHER_AT,
    nextTrafficAt: FIRST_TRAFFIC_AT,
  };
}

export function planCityBeat(input: CityPlanInput): CityPlan {
  const events: ProduceInput[] = [];
  let nextIncidentAt = input.nextIncidentAt;
  let nextWeatherAt = input.nextWeatherAt;
  let nextTrafficAt = input.nextTrafficAt;
  const blocked = new Set(input.obstructions.map((item) => item.district));

  if (input.now >= nextIncidentAt) {
    nextIncidentAt = input.now + span(input.rng, INCIDENT_INTERVAL);
    const scenario = INCIDENT_SCENARIOS[Math.floor(input.rng() * INCIDENT_SCENARIOS.length)];
    const incidentId = input.takeIncidentId();
    events.push({
      type: "incident.reported",
      producer: "city-simulator",
      correlationId: incidentId,
      payload: { incidentId, ...scenario },
    });
  }

  if (input.now >= nextWeatherAt) {
    nextWeatherAt = input.now + span(input.rng, WEATHER_INTERVAL);
    if (input.weather !== "clear" && input.rng() < 0.45) {
      events.push({
        type: "weather.cleared",
        producer: "city-simulator",
        correlationId: "weather",
        payload: { summary: "The weather cell has moved off Northline." },
      });
    } else {
      const scenario = WEATHER_SCENARIOS[Math.floor(input.rng() * WEATHER_SCENARIOS.length)];
      events.push({
        type: "weather.advisory",
        producer: "city-simulator",
        correlationId: "weather",
        payload: scenario,
      });
    }
  }

  if (input.now >= nextTrafficAt) {
    nextTrafficAt = input.now + span(input.rng, TRAFFIC_INTERVAL);
    const open = TRAFFIC_SCENARIOS.filter((item) => !blocked.has(item.district));
    if (input.obstructions.length > 0 && (open.length === 0 || input.rng() < 0.45)) {
      const current =
        input.obstructions[Math.floor(input.rng() * input.obstructions.length)];
      events.push({
        type: "traffic.cleared",
        producer: "city-simulator",
        correlationId: current.id,
        payload: { obstructionId: current.id },
      });
    } else if (open.length > 0) {
      const scenario = open[Math.floor(input.rng() * open.length)];
      const obstructionId = input.takeObstructionId();
      events.push({
        type: "traffic.obstruction",
        producer: "city-simulator",
        correlationId: obstructionId,
        payload: { obstructionId, district: scenario.district, summary: scenario.summary },
      });
    }
  }

  return { events, nextIncidentAt, nextWeatherAt, nextTrafficAt };
}

function span(rng: Rng, range: [number, number]): number {
  const [min, max] = range;
  return min + Math.floor(rng() * (max - min));
}

export function armSchedule(
  now: number,
  schedule: { nextIncidentAt: number; nextWeatherAt: number; nextTrafficAt: number },
): { nextIncidentAt: number; nextWeatherAt: number; nextTrafficAt: number } {
  return {
    nextIncidentAt: schedule.nextIncidentAt <= now ? now + 2_000 : schedule.nextIncidentAt,
    nextWeatherAt: schedule.nextWeatherAt <= now ? now + 4_000 : schedule.nextWeatherAt,
    nextTrafficAt: schedule.nextTrafficAt <= now ? now + 3_000 : schedule.nextTrafficAt,
  };
}
