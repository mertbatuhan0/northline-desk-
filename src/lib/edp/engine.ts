import { createHandlers, type Handler } from "./handlers";
import {
  armSchedule,
  clockTick,
  initialSchedule,
  obstructionClearedByOperator,
  planCityBeat,
  reportedByOperator,
  resolvedByOperator,
  unitStatusByOperator,
  updatedByOperator,
  watchOpened,
  weatherClearedByOperator,
} from "./producers";
import { EventQueue } from "./queue";
import type { Rng } from "./rng";
import { mulberry32 } from "./rng";
import { createInitialState } from "./state";
import type {
  DeskState,
  DistrictId,
  Envelope,
  Kind,
  Priority,
  ProduceInput,
  Speed,
} from "./types";

export interface DeskSnapshot {
  version: 1;
  seed: number;
  rng: number;
  simNow: number;
  paused: boolean;
  speed: Speed;
  simulator: boolean;
  sequence: number;
  eventSerial: number;
  nextIncident: number;
  nextObstruction: number;
  lastTickIssued: number;
  nextIncidentAt: number;
  nextWeatherAt: number;
  nextTrafficAt: number;
  state: DeskState;
  log: Envelope[];
  ready: Envelope[];
  delayed: Envelope[];
}

const DRAIN_LIMIT = 500;

export class DeskEngine {
  simNow = 0;
  paused = false;
  speed: Speed = 1;
  simulator = false;
  seed: number;
  rng: Rng;
  readonly queue = new EventQueue();
  state: DeskState;
  log: Envelope[] = [];
  readonly handlers: Handler[];

  private sequence = 0;
  private eventSerial = 0;
  private nextIncident = 1;
  private nextObstruction = 1;
  private lastTickIssued = 0;
  private draining = false;
  private nextIncidentAt = initialSchedule().nextIncidentAt;
  private nextWeatherAt = initialSchedule().nextWeatherAt;
  private nextTrafficAt = initialSchedule().nextTrafficAt;

  constructor(seed = 1842) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.state = createInitialState();
    this.handlers = createHandlers(this);
    this.produce(watchOpened());
  }

  report(input: {
    kind: Kind;
    priority: Priority;
    district: DistrictId;
    summary: string;
    reporter: string;
  }): string {
    const incidentId = `inc-${this.nextIncident}`;
    this.nextIncident += 1;
    const summary = input.summary.trim().slice(0, 180);
    this.produce(
      reportedByOperator({
        ...input,
        incidentId,
        summary,
        reporter: input.reporter.trim().slice(0, 80) || "Desk operator",
      }),
    );
    return incidentId;
  }

  updateIncident(incidentId: string, patch: { summary?: string; priority?: Priority }): void {
    this.produce(
      updatedByOperator({
        incidentId,
        summary: patch.summary?.trim().slice(0, 180),
        priority: patch.priority,
      }),
    );
  }

  resolve(incidentId: string, by = "Desk operator"): void {
    this.produce(resolvedByOperator(incidentId, by));
  }

  setUnitStatus(unitId: string, status: "available" | "unavailable", reason: string): void {
    this.produce(unitStatusByOperator(unitId, status, reason));
  }

  clearObstruction(obstructionId: string): void {
    this.produce(obstructionClearedByOperator(obstructionId));
  }

  clearWeather(): void {
    this.produce(weatherClearedByOperator());
  }

  setSimulator(armed: boolean): void {
    this.simulator = armed;
    if (!armed) return;
    const schedule = armSchedule(this.simNow, {
      nextIncidentAt: this.nextIncidentAt,
      nextWeatherAt: this.nextWeatherAt,
      nextTrafficAt: this.nextTrafficAt,
    });
    this.nextIncidentAt = schedule.nextIncidentAt;
    this.nextWeatherAt = schedule.nextWeatherAt;
    this.nextTrafficAt = schedule.nextTrafficAt;
  }

  dismissErrors(): void {
    this.state.errors = [];
  }

  tick(realMs: number): void {
    if (this.paused) return;
    const bounded = Math.max(0, Math.min(1_000, realMs));
    this.advance(bounded * this.speed);
  }

  /**
   * Move simulated time forward. Each whole second, the city simulator may
   * enqueue events and the station clock enqueues one tick. The queue drains
   * after each of those, so handlers see time pass one second at a time.
   */
  advance(ms: number): void {
    if (ms < 0) return;
    const target = this.simNow + ms;
    while (this.lastTickIssued + 1_000 <= target) {
      this.simNow = this.lastTickIssued + 1_000;
      this.lastTickIssued = this.simNow;
      this.runCity();
      this.produce(clockTick(this.simNow / 1_000));
    }
    this.simNow = target;
    this.drain();
  }

  batch(run: () => void): void {
    const previous = this.draining;
    this.draining = true;
    try {
      run();
    } finally {
      this.draining = previous;
    }
    if (!previous) this.drain();
  }

  produce(input: ProduceInput): Envelope {
    this.sequence += 1;
    this.eventSerial += 1;
    const event = {
      id: `evt-${this.eventSerial}`,
      type: input.type,
      priority: input.priority ?? defaultPriority(input),
      producer: input.producer,
      producedAt: this.simNow,
      deliveredAt: 0,
      notBefore: input.notBefore ?? this.simNow,
      correlationId: input.correlationId ?? input.type,
      sequence: this.sequence,
      payload: input.payload,
    } as Envelope;
    this.queue.enqueue(event, this.simNow);
    this.state.producerCounts[input.producer] =
      (this.state.producerCounts[input.producer] ?? 0) + 1;
    if (!this.draining) this.drain();
    return event;
  }

  cancel(predicate: (event: Envelope) => boolean): number {
    return this.queue.removeWhere(predicate);
  }

  drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      let steps = 0;
      while (steps < DRAIN_LIMIT) {
        this.queue.promote(this.simNow);
        const next = this.queue.peekReady();
        if (!next) break;
        this.queue.dequeueReady();
        this.dispatch(next);
        steps += 1;
      }
      if (steps >= DRAIN_LIMIT && this.queue.readySize > 0) {
        this.pushError("queue", "-", "-", "Drain stopped after 500 events.");
      }
    } finally {
      this.draining = false;
    }
  }

  reset(seed = 1842): void {
    this.simNow = 0;
    this.paused = false;
    this.speed = 1;
    this.simulator = false;
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.queue.clear();
    this.state = createInitialState();
    this.log = [];
    this.sequence = 0;
    this.eventSerial = 0;
    this.nextIncident = 1;
    this.nextObstruction = 1;
    this.lastTickIssued = 0;
    const schedule = initialSchedule();
    this.nextIncidentAt = schedule.nextIncidentAt;
    this.nextWeatherAt = schedule.nextWeatherAt;
    this.nextTrafficAt = schedule.nextTrafficAt;
    this.produce(watchOpened());
  }

  snapshot(): DeskSnapshot {
    return {
      version: 1,
      seed: this.seed,
      rng: this.rng.state(),
      simNow: this.simNow,
      paused: this.paused,
      speed: this.speed,
      simulator: this.simulator,
      sequence: this.sequence,
      eventSerial: this.eventSerial,
      nextIncident: this.nextIncident,
      nextObstruction: this.nextObstruction,
      lastTickIssued: this.lastTickIssued,
      nextIncidentAt: this.nextIncidentAt,
      nextWeatherAt: this.nextWeatherAt,
      nextTrafficAt: this.nextTrafficAt,
      state: this.state,
      log: this.log,
      ready: this.queue.readyValues(),
      delayed: this.queue.delayedValues(),
    };
  }

  restore(raw: unknown): boolean {
    if (!raw || typeof raw !== "object") return false;
    const snap = raw as Partial<DeskSnapshot>;
    if (snap.version !== 1 || !snap.state || !snap.rng) return false;
    if (!Array.isArray(snap.state.units) || snap.state.units.length !== 8) return false;
    if (!Array.isArray(snap.state.incidents) || !Array.isArray(snap.log)) return false;
    if (!Array.isArray(snap.ready) || !Array.isArray(snap.delayed)) return false;
    if (snap.speed !== 1 && snap.speed !== 2 && snap.speed !== 4) return false;

    this.seed = snap.seed ?? this.seed;
    this.rng = mulberry32(this.seed);
    this.rng.set(snap.rng);
    this.simNow = snap.simNow ?? 0;
    this.paused = Boolean(snap.paused);
    this.speed = snap.speed;
    this.simulator = Boolean(snap.simulator);
    this.sequence = snap.sequence ?? 0;
    this.eventSerial = snap.eventSerial ?? 0;
    this.nextIncident = snap.nextIncident ?? 1;
    this.nextObstruction = snap.nextObstruction ?? 1;
    this.lastTickIssued = snap.lastTickIssued ?? 0;
    this.nextIncidentAt = snap.nextIncidentAt ?? initialSchedule().nextIncidentAt;
    this.nextWeatherAt = snap.nextWeatherAt ?? initialSchedule().nextWeatherAt;
    this.nextTrafficAt = snap.nextTrafficAt ?? initialSchedule().nextTrafficAt;
    this.state = snap.state;
    this.log = snap.log ?? [];
    this.queue.load(snap.ready, snap.delayed);
    return true;
  }

  private runCity(): void {
    if (!this.simulator) return;
    const plan = planCityBeat({
      now: this.simNow,
      rng: this.rng,
      weather: this.state.weather.level,
      obstructions: this.state.obstructions.map((item) => ({
        id: item.id,
        district: item.district,
      })),
      nextIncidentAt: this.nextIncidentAt,
      nextWeatherAt: this.nextWeatherAt,
      nextTrafficAt: this.nextTrafficAt,
      takeIncidentId: () => {
        const id = `inc-${this.nextIncident}`;
        this.nextIncident += 1;
        return id;
      },
      takeObstructionId: () => {
        const id = `blk-${this.nextObstruction}`;
        this.nextObstruction += 1;
        return id;
      },
    });
    this.nextIncidentAt = plan.nextIncidentAt;
    this.nextWeatherAt = plan.nextWeatherAt;
    this.nextTrafficAt = plan.nextTrafficAt;
    if (plan.events.length === 0) return;
    this.batch(() => {
      for (const event of plan.events) this.produce(event);
    });
  }

  private dispatch(event: Envelope): void {
    event.deliveredAt = this.simNow;
    for (const handler of this.handlers) {
      if (handler.handles !== "*" && !handler.handles.includes(event.type)) continue;
      try {
        handler.handle(event, this);
        this.state.handlerCounts[handler.name] =
          (this.state.handlerCounts[handler.name] ?? 0) + 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Handler failed";
        this.pushError(handler.name, event.id, event.type, message);
      }
    }
  }

  private pushError(handler: string, eventId: string, eventType: string, message: string): void {
    this.state.errors.push({ at: this.simNow, handler, eventId, eventType, message });
    if (this.state.errors.length > 20) this.state.errors.shift();
  }
}

export function defaultPriority(input: ProduceInput): number {
  switch (input.type) {
    case "incident.reported":
      return input.payload.priority === 1 ? 10 : input.payload.priority === 2 ? 20 : 30;
    case "incident.escalated":
      return input.payload.pageSupervisor ? 8 : 12;
    case "incident.resolved":
      return 18;
    case "incident.updated":
      return 22;
    case "unit.status_changed":
      return 28;
    case "unit.dispatched":
      return 32;
    case "dispatch.deferred":
      return 36;
    case "unit.enroute":
    case "unit.onscene":
    case "unit.cleared":
      return 40;
    case "weather.advisory":
    case "weather.cleared":
    case "traffic.obstruction":
    case "traffic.cleared":
      return 60;
    case "radio.transmission":
      return 70;
    case "shift.note":
      return 80;
    case "clock.tick":
      return 90;
    default: {
      const unreachable: never = input;
      return unreachable;
    }
  }
}
