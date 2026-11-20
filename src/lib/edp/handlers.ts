import {
  CLEAR_DELAY_MS,
  DISTRICTS,
  PREFERRED_UNITS,
  SLA_MS,
  manhattan,
  workDuration,
} from "./constants";
import type { DeskState, Envelope, HandlerHost, Incident, Kind, Unit } from "./types";

export interface Handler {
  name: string;
  handles: "*" | readonly Envelope["type"][];
  handle: (event: Envelope, host: HandlerHost) => void;
}

export const HANDLER_NAMES = [
  "audit",
  "projection",
  "dispatch",
  "escalation",
  "movement",
  "radio",
] as const;

const MAX_LOG = 400;
const MAX_RADIO = 30;
const MAX_NOTES = 8;
const MAX_RESOLVED = 40;

export function createHandlers(host: HandlerHost): Handler[] {
  return [
    {
      name: "audit",
      handles: "*",
      handle(event) {
        host.log.push(event);
        host.state.processed += 1;
        if (host.log.length > MAX_LOG) {
          host.log.splice(0, host.log.length - MAX_LOG);
        }
      },
    },
    {
      name: "projection",
      handles: "*",
      handle(event) {
        project(host.state, event);
      },
    },
    {
      name: "dispatch",
      handles: ["incident.reported", "incident.escalated", "unit.cleared", "unit.status_changed"],
      handle(event) {
        if (event.type === "incident.reported" || event.type === "incident.escalated") {
          const incident = findIncident(host.state, event.payload.incidentId);
          if (!incident) return;
          assignIncident(host, incident, new Set());
          return;
        }
        if (event.type === "unit.status_changed" && event.payload.status !== "available") return;
        const reserved = new Set<string>();
        for (const incident of openIncidents(host.state)) {
          assignIncident(host, incident, reserved);
        }
      },
    },
    {
      name: "escalation",
      handles: ["clock.tick"],
      handle() {
        const waiting = host.state.incidents
          .filter((incident) => incident.status === "open")
          .sort((a, b) => a.priority - b.priority || a.reportedAt - b.reportedAt);
        for (const incident of waiting) {
          const age = host.simNow - incident.prioritySince;
          if (incident.priority === 3 && age >= SLA_MS[3]) {
            emitEscalation(host, incident, 3, 2, "No unit assigned for 20s at priority 3", false);
          } else if (incident.priority === 2 && age >= SLA_MS[2]) {
            emitEscalation(host, incident, 2, 1, "No unit assigned for 16s at priority 2", false);
          } else if (
            incident.priority === 1 &&
            age >= SLA_MS[1] &&
            !incident.supervisorPaged
          ) {
            emitEscalation(
              host,
              incident,
              1,
              1,
              "Priority 1 still waiting after 12s",
              true,
            );
          }
        }
      },
    },
    {
      name: "movement",
      handles: ["unit.dispatched", "unit.onscene", "incident.resolved"],
      handle(event) {
        if (event.type === "unit.dispatched") {
          const incident = findIncident(host.state, event.payload.incidentId);
          if (!incident || incident.status === "resolved") return;
          host.produce({
            type: "unit.enroute",
            producer: "movement",
            correlationId: incident.id,
            notBefore: event.payload.enrouteAt,
            payload: { incidentId: incident.id, unitId: event.payload.unitId },
          });
          host.produce({
            type: "unit.onscene",
            producer: "movement",
            correlationId: incident.id,
            notBefore: event.payload.onSceneAt,
            payload: { incidentId: incident.id, unitId: event.payload.unitId },
          });
          return;
        }
        if (event.type === "unit.onscene") {
          const incident = findIncident(host.state, event.payload.incidentId);
          const unit = findUnit(host.state, event.payload.unitId);
          if (!incident || !unit || incident.status === "resolved") return;
          if (unit.incidentId !== incident.id) return;
          host.produce({
            type: "incident.resolved",
            producer: "movement",
            correlationId: incident.id,
            notBefore: host.simNow + workDuration(incident.priority),
            payload: { incidentId: incident.id, by: unit.callSign },
          });
          return;
        }
        if (event.type === "incident.resolved") {
          const incident = findIncident(host.state, event.payload.incidentId);
          if (!incident) return;
          host.cancel(
            (queued) =>
              queued.correlationId === incident.id &&
              queued.id !== event.id &&
              (queued.type === "unit.enroute" ||
                queued.type === "unit.onscene" ||
                queued.type === "incident.resolved" ||
                queued.type === "unit.cleared"),
          );
          if (!incident.unitId) return;
          const unit = findUnit(host.state, incident.unitId);
          if (!unit || unit.incidentId !== incident.id || unit.status === "available") return;
          host.produce({
            type: "unit.cleared",
            producer: "movement",
            correlationId: incident.id,
            notBefore: host.simNow + CLEAR_DELAY_MS,
            payload: { incidentId: incident.id, unitId: unit.id },
          });
        }
      },
    },
    {
      name: "radio",
      handles: [
        "unit.dispatched",
        "unit.onscene",
        "unit.cleared",
        "unit.status_changed",
        "incident.updated",
        "incident.resolved",
        "incident.escalated",
        "weather.advisory",
        "weather.cleared",
        "traffic.obstruction",
        "dispatch.deferred",
      ],
      handle(event) {
        const line = radioLine(host.state, event);
        if (!line) return;
        host.produce({
          type: "radio.transmission",
          producer: "radio",
          correlationId: event.correlationId,
          payload: line,
        });
      },
    },
  ];
}

function emitEscalation(
  host: HandlerHost,
  incident: Incident,
  from: Incident["priority"],
  to: Incident["priority"],
  reason: string,
  pageSupervisor: boolean,
): void {
  host.produce({
    type: "incident.escalated",
    producer: "escalation",
    correlationId: incident.id,
    payload: { incidentId: incident.id, from, to, reason, pageSupervisor },
  });
}

function at(event: Envelope): number {
  return event.deliveredAt > 0 ? event.deliveredAt : event.producedAt;
}

export function project(state: DeskState, event: Envelope): void {
  switch (event.type) {
    case "shift.note": {
      state.notes.push({ id: event.id, at: at(event), text: event.payload.text });
      if (state.notes.length > MAX_NOTES) state.notes.splice(0, state.notes.length - MAX_NOTES);
      return;
    }
    case "clock.tick": {
      state.tick = event.payload.tick;
      return;
    }
    case "incident.reported": {
      const payload = event.payload;
      state.incidents.push({
        id: payload.incidentId,
        kind: payload.kind,
        priority: payload.priority,
        initialPriority: payload.priority,
        district: payload.district,
        summary: payload.summary,
        reporter: payload.reporter,
        status: "open",
        reportedAt: at(event),
        prioritySince: at(event),
        supervisorPaged: false,
        escalationCount: 0,
      });
      return;
    }
    case "incident.updated": {
      const incident = findIncident(state, event.payload.incidentId);
      if (!incident || incident.status === "resolved") return;
      if (event.payload.summary) incident.summary = event.payload.summary;
      if (event.payload.priority && event.payload.priority !== incident.priority) {
        incident.priority = event.payload.priority;
        incident.prioritySince = at(event);
      }
      return;
    }
    case "incident.escalated": {
      const incident = findIncident(state, event.payload.incidentId);
      if (!incident || incident.status === "resolved") return;
      incident.priority = event.payload.to;
      incident.prioritySince = at(event);
      incident.escalationCount += 1;
      if (event.payload.pageSupervisor) incident.supervisorPaged = true;
      return;
    }
    case "incident.resolved": {
      const incident = findIncident(state, event.payload.incidentId);
      if (!incident || incident.status === "resolved") return;
      incident.status = "resolved";
      incident.resolvedAt = at(event);
      incident.holdReason = undefined;
      trimResolved(state);
      return;
    }
    case "dispatch.deferred": {
      const incident = findIncident(state, event.payload.incidentId);
      if (!incident || incident.status !== "open") return;
      incident.holdReason = event.payload.reason;
      return;
    }
    case "unit.dispatched": {
      const incident = findIncident(state, event.payload.incidentId);
      const unit = findUnit(state, event.payload.unitId);
      if (!incident || !unit || incident.status === "resolved") return;
      if (unit.status !== "available") return;
      incident.status = "dispatched";
      incident.unitId = unit.id;
      incident.holdReason = undefined;
      unit.status = "dispatched";
      unit.incidentId = incident.id;
      return;
    }
    case "unit.enroute": {
      const incident = findIncident(state, event.payload.incidentId);
      const unit = findUnit(state, event.payload.unitId);
      if (!incident || !unit || incident.status === "resolved") return;
      if (unit.incidentId !== incident.id) return;
      incident.status = "enroute";
      unit.status = "enroute";
      return;
    }
    case "unit.onscene": {
      const incident = findIncident(state, event.payload.incidentId);
      const unit = findUnit(state, event.payload.unitId);
      if (!incident || !unit || incident.status === "resolved") return;
      if (unit.incidentId !== incident.id) return;
      incident.status = "onscene";
      incident.onSceneAt = at(event);
      unit.status = "onscene";
      return;
    }
    case "unit.cleared": {
      const unit = findUnit(state, event.payload.unitId);
      if (!unit) return;
      if (unit.incidentId && unit.incidentId !== event.payload.incidentId) return;
      unit.status = "available";
      unit.incidentId = undefined;
      return;
    }
    case "unit.status_changed": {
      const unit = findUnit(state, event.payload.unitId);
      if (!unit) return;
      if (unit.status !== "available" && unit.status !== "unavailable") return;
      unit.status = event.payload.status;
      if (event.payload.status === "unavailable") unit.incidentId = undefined;
      return;
    }
    case "radio.transmission": {
      state.radio.push({
        id: event.id,
        at: at(event),
        from: event.payload.from,
        text: event.payload.text,
      });
      if (state.radio.length > MAX_RADIO) state.radio.splice(0, state.radio.length - MAX_RADIO);
      return;
    }
    case "weather.advisory": {
      state.weather = {
        level: event.payload.level,
        summary: event.payload.summary,
        since: at(event),
      };
      return;
    }
    case "weather.cleared": {
      state.weather = {
        level: "clear",
        summary: event.payload.summary,
        since: at(event),
      };
      return;
    }
    case "traffic.obstruction": {
      if (state.obstructions.some((item) => item.id === event.payload.obstructionId)) return;
      state.obstructions.push({
        id: event.payload.obstructionId,
        district: event.payload.district,
        summary: event.payload.summary,
        since: at(event),
      });
      return;
    }
    case "traffic.cleared": {
      state.obstructions = state.obstructions.filter(
        (item) => item.id !== event.payload.obstructionId,
      );
      return;
    }
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

function trimResolved(state: DeskState): void {
  const busy = new Set(state.units.map((unit) => unit.incidentId).filter(Boolean));
  const resolved = state.incidents.filter(
    (incident) => incident.status === "resolved" && !busy.has(incident.id),
  );
  const extra = resolved.length - MAX_RESOLVED;
  if (extra <= 0) return;
  const drop = new Set(resolved.slice(0, extra).map((incident) => incident.id));
  state.incidents = state.incidents.filter((incident) => !drop.has(incident.id));
}

function assignIncident(host: HandlerHost, incident: Incident, reserved: Set<string>): void {
  if (incident.status !== "open" || incident.unitId) return;
  const unit = chooseUnit(host.state, incident, reserved);
  if (!unit) {
    const reason = deferredReason(incident.kind);
    if (incident.holdReason === reason) return;
    host.produce({
      type: "dispatch.deferred",
      producer: "dispatch",
      correlationId: incident.id,
      payload: { incidentId: incident.id, reason },
    });
    return;
  }
  reserved.add(unit.id);
  const travel = movementWindow(host.state, unit, incident, host.simNow);
  host.produce({
    type: "unit.dispatched",
    producer: "dispatch",
    correlationId: incident.id,
    payload: {
      incidentId: incident.id,
      unitId: unit.id,
      enrouteAt: travel.enrouteAt,
      onSceneAt: travel.onSceneAt,
    },
  });
}

export function chooseUnit(
  state: DeskState,
  incident: Incident,
  reserved: Set<string>,
): Unit | undefined {
  const preferred = PREFERRED_UNITS[incident.kind];
  let best: { unit: Unit; score: number } | undefined;
  for (const unit of state.units) {
    if (unit.status !== "available" || reserved.has(unit.id)) continue;
    const rank = preferred.indexOf(unit.type);
    if (rank < 0) continue;
    const distance = effectiveDistance(state, unit, incident);
    const score = rank * 100 + distance;
    if (!best || score < best.score || (score === best.score && unit.id < best.unit.id)) {
      best = { unit, score };
    }
  }
  return best?.unit;
}

function effectiveDistance(state: DeskState, unit: Unit, incident: Incident): number {
  let distance = manhattan(unit.district, incident.district);
  if (state.obstructions.some((item) => item.district === unit.district)) distance += 4;
  if (state.obstructions.some((item) => item.district === incident.district)) distance += 2;
  return distance;
}

export function movementWindow(
  state: DeskState,
  unit: Unit,
  incident: Incident,
  now: number,
): { distance: number; enrouteAt: number; onSceneAt: number } {
  const distance = manhattan(unit.district, incident.district);
  let factor = 1;
  if (state.weather.level === "warning") factor *= 1.55;
  else if (state.weather.level === "advisory") factor *= 1.2;
  if (
    state.obstructions.some(
      (item) => item.district === unit.district || item.district === incident.district,
    )
  ) {
    factor *= 1.35;
  }
  const enrouteIn = Math.round((1_600 + distance * 800) * factor);
  const onSceneIn = enrouteIn + Math.round((2_000 + distance * 600) * factor);
  return { distance, enrouteAt: now + enrouteIn, onSceneAt: now + onSceneIn };
}

function deferredReason(kind: Kind): string {
  const names = PREFERRED_UNITS[kind].join(" or ");
  return `No free ${names} for this ${kind} call`;
}

function openIncidents(state: DeskState): Incident[] {
  return state.incidents
    .filter((incident) => incident.status === "open")
    .sort((a, b) => a.priority - b.priority || a.reportedAt - b.reportedAt);
}

function radioLine(
  state: DeskState,
  event: Envelope,
): { from: string; text: string } | undefined {
  switch (event.type) {
    case "unit.dispatched": {
      const incident = findIncident(state, event.payload.incidentId);
      const unit = findUnit(state, event.payload.unitId);
      if (!incident || !unit) return undefined;
      return {
        from: "Dispatch",
        text: `${unit.callSign}, ${DISTRICTS[incident.district].label}. ${incident.summary}.`,
      };
    }
    case "unit.onscene": {
      const unit = findUnit(state, event.payload.unitId);
      const incident = findIncident(state, event.payload.incidentId);
      if (!unit || !incident) return undefined;
      return {
        from: unit.callSign,
        text: `${unit.callSign} on scene, ${DISTRICTS[incident.district].label}.`,
      };
    }
    case "unit.cleared": {
      const unit = findUnit(state, event.payload.unitId);
      if (!unit) return undefined;
      return { from: unit.callSign, text: `${unit.callSign} clear and available.` };
    }
    case "incident.resolved": {
      const incident = findIncident(state, event.payload.incidentId);
      if (!incident) return undefined;
      return {
        from: event.payload.by,
        text: `${event.payload.by} reports ${DISTRICTS[incident.district].label} wrapped up.`,
      };
    }
    case "incident.escalated": {
      const incident = findIncident(state, event.payload.incidentId);
      if (!incident) return undefined;
      if (event.payload.pageSupervisor) {
        return {
          from: "Dispatch",
          text: `Supervisor page. ${DISTRICTS[incident.district].label} still waiting. ${incident.summary}.`,
        };
      }
      return {
        from: "Dispatch",
        text: `${DISTRICTS[incident.district].label} raised from P${event.payload.from} to P${event.payload.to}.`,
      };
    }
    case "dispatch.deferred": {
      const incident = findIncident(state, event.payload.incidentId);
      if (!incident) return undefined;
      return {
        from: "Dispatch",
        text: `Holding ${DISTRICTS[incident.district].label}. ${event.payload.reason}.`,
      };
    }
    case "unit.status_changed": {
      const unit = findUnit(state, event.payload.unitId);
      if (!unit) return undefined;
      return {
        from: "Dispatch",
        text:
          event.payload.status === "unavailable"
            ? `${unit.callSign} held. ${event.payload.reason}.`
            : `${unit.callSign} back in service. ${event.payload.reason}.`,
      };
    }
    case "incident.updated": {
      const incident = findIncident(state, event.payload.incidentId);
      if (!incident || !event.payload.priority) return undefined;
      return {
        from: "Dispatch",
        text: `${DISTRICTS[incident.district].label} set to P${event.payload.priority} by the operator.`,
      };
    }
    case "weather.advisory":
      return { from: "Watch office", text: event.payload.summary };
    case "weather.cleared":
      return { from: "Watch office", text: event.payload.summary };
    case "traffic.obstruction":
      return {
        from: "Watch office",
        text: `${DISTRICTS[event.payload.district].label}: ${event.payload.summary}.`,
      };
    default:
      return undefined;
  }
}

function findIncident(state: DeskState, id: string): Incident | undefined {
  return state.incidents.find((incident) => incident.id === id);
}

function findUnit(state: DeskState, id: string): Unit | undefined {
  return state.units.find((unit) => unit.id === id);
}
