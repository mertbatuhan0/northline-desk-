import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SLA_MS, workDuration } from "./constants";
import { DeskEngine } from "./engine";
import type { Envelope } from "./types";

const HARBOR_MEDICAL = {
  kind: "medical" as const,
  priority: 1 as const,
  district: "harbor" as const,
  summary: "Person down on pier 4 beside the crane",
  reporter: "Pier office",
};

function dispatched(engine: DeskEngine): Extract<Envelope, { type: "unit.dispatched" }> {
  const event = engine.log.find((item) => item.type === "unit.dispatched");
  assert.ok(event && event.type === "unit.dispatched");
  return event;
}

describe("desk engine", () => {
  it("assigns the home medic to a harbor medical call", () => {
    const engine = new DeskEngine(1);
    const incidentId = engine.report(HARBOR_MEDICAL);
    const assignment = dispatched(engine);
    assert.equal(assignment.payload.unitId, "M1");
    assert.equal(assignment.payload.incidentId, incidentId);
    assert.equal(engine.state.incidents[0]?.status, "dispatched");
    assert.equal(engine.state.units.find((unit) => unit.id === "M1")?.status, "dispatched");
    assert.equal(
      engine.log.some((event) => event.type === "unit.enroute"),
      false,
    );
    assert.ok(engine.queue.delayedValues().some((event) => event.type === "unit.enroute"));
  });

  it("sends the other medic when the home district is blocked", () => {
    const engine = new DeskEngine(1);
    engine.produce({
      type: "traffic.obstruction",
      producer: "city-simulator",
      correlationId: "blk-harbor",
      payload: {
        obstructionId: "blk-harbor",
        district: "harbor",
        summary: "Bascule bridge stuck open",
      },
    });
    engine.report(HARBOR_MEDICAL);
    assert.equal(dispatched(engine).payload.unitId, "M2");
  });

  it("delivers a priority 1 report before a priority 3 report queued with it", () => {
    const engine = new DeskEngine(1);
    engine.batch(() => {
      engine.report({
        ...HARBOR_MEDICAL,
        priority: 3,
        summary: "Small cut at the pier office, patient walking",
      });
      engine.report({
        kind: "fire",
        priority: 1,
        district: "ridge",
        summary: "Smoke pushing from the ridge lookout cabin",
        reporter: "Lookout",
      });
    });
    const reports = engine.log.filter((event) => event.type === "incident.reported");
    assert.equal(reports[0]?.type === "incident.reported" && reports[0].payload.priority, 1);
    assert.equal(reports[1]?.type === "incident.reported" && reports[1].payload.priority, 3);
  });

  it("moves the crew only after simulated time reaches the scheduled events", () => {
    const engine = new DeskEngine(1);
    engine.report(HARBOR_MEDICAL);
    const assignment = dispatched(engine);
    engine.advance(assignment.payload.enrouteAt - engine.simNow - 1);
    assert.equal(engine.state.incidents[0]?.status, "dispatched");
    engine.advance(2);
    assert.equal(engine.state.incidents[0]?.status, "enroute");
    engine.advance(assignment.payload.onSceneAt - engine.simNow);
    assert.equal(engine.state.incidents[0]?.status, "onscene");
  });

  it("lets the crew close the call and return to service", () => {
    const engine = new DeskEngine(1);
    engine.report(HARBOR_MEDICAL);
    const assignment = dispatched(engine);
    engine.advance(assignment.payload.onSceneAt - engine.simNow);
    assert.equal(engine.state.incidents[0]?.status, "onscene");
    engine.advance(workDuration(1));
    assert.equal(engine.state.incidents[0]?.status, "resolved");
    assert.equal(engine.state.units.find((unit) => unit.id === "M1")?.status, "onscene");
    engine.advance(2_500);
    assert.equal(engine.state.units.find((unit) => unit.id === "M1")?.status, "available");
  });

  it("cancels the trip when the operator closes the call early", () => {
    const engine = new DeskEngine(1);
    const incidentId = engine.report(HARBOR_MEDICAL);
    assert.ok(engine.queue.delayedValues().some((event) => event.type === "unit.enroute"));
    engine.resolve(incidentId);
    assert.equal(
      engine.queue.delayedValues().some((event) => event.type === "unit.enroute"),
      false,
    );
    const clear = engine.queue.delayedValues().find((event) => event.type === "unit.cleared");
    assert.ok(clear);
    engine.advance(clear.notBefore - engine.simNow);
    assert.equal(engine.state.units.find((unit) => unit.id === "M1")?.status, "available");
    assert.equal(engine.state.incidents[0]?.status, "resolved");
  });

  it("holds a call with no suitable unit, then assigns one the moment a unit returns", () => {
    const engine = new DeskEngine(1);
    for (const unit of engine.state.units) {
      engine.setUnitStatus(unit.id, "unavailable", "Drill");
    }
    engine.report(HARBOR_MEDICAL);
    assert.equal(engine.state.incidents[0]?.status, "open");
    assert.ok(engine.log.some((event) => event.type === "dispatch.deferred"));
    engine.setUnitStatus("M2", "available", "Back from the drill");
    assert.equal(engine.state.incidents[0]?.unitId, "M2");
    assert.equal(engine.state.incidents[0]?.status, "dispatched");
  });

  it("escalates a waiting call on the published timers and pages a supervisor at priority 1", () => {
    const engine = new DeskEngine(1);
    for (const unit of engine.state.units) {
      engine.setUnitStatus(unit.id, "unavailable", "Drill");
    }
    engine.report({
      kind: "utility",
      priority: 3,
      district: "mill",
      summary: "Lamp cable down beside the mill wheel, no sparking",
      reporter: "Neighbor",
    });
    const incident = () => engine.state.incidents[0];
    engine.advance(SLA_MS[3]);
    assert.equal(incident()?.priority, 2);
    engine.advance(SLA_MS[2]);
    assert.equal(incident()?.priority, 1);
    engine.advance(SLA_MS[1]);
    assert.equal(incident()?.supervisorPaged, true);
    assert.ok(
      engine.log.some(
        (event) => event.type === "incident.escalated" && event.payload.pageSupervisor,
      ),
    );
  });

  it("slows travel while a weather warning is up and says so on the radio", () => {
    const calm = new DeskEngine(3);
    calm.report({
      kind: "medical",
      priority: 2,
      district: "ridge",
      summary: "Cyclist down at the ridge switchback",
      reporter: "Following rider",
    });
    const storm = new DeskEngine(3);
    storm.produce({
      type: "weather.advisory",
      producer: "city-simulator",
      correlationId: "weather",
      payload: { level: "warning", summary: "High wind on the ridge" },
    });
    storm.report({
      kind: "medical",
      priority: 2,
      district: "ridge",
      summary: "Cyclist down at the ridge switchback",
      reporter: "Following rider",
    });
    const calmTrip = dispatched(calm);
    const stormTrip = dispatched(storm);
    assert.equal(calmTrip.payload.unitId, stormTrip.payload.unitId);
    assert.ok(stormTrip.payload.onSceneAt > calmTrip.payload.onSceneAt);
    assert.ok(storm.log.some((event) => event.type === "radio.transmission"));
  });

  it("keeps going when one handler throws", () => {
    const engine = new DeskEngine(1);
    engine.handlers.splice(1, 0, {
      name: "boom",
      handles: ["shift.note"],
      handle() {
        throw new Error("radio room fuse");
      },
    });
    engine.produce({
      type: "shift.note",
      producer: "station-clock",
      correlationId: "shift",
      payload: { text: "Second note from the clock room" },
    });
    assert.equal(engine.state.errors.at(-1)?.message, "radio room fuse");
    assert.ok(engine.log.some((event) => event.type === "shift.note" && event.payload.text.includes("Second note")));
    assert.ok(engine.state.notes.some((note) => note.text.includes("Second note")));
  });

  it("replays the same city from the same seed", () => {
    const trace = (seed: number) => {
      const engine = new DeskEngine(seed);
      engine.setSimulator(true);
      engine.advance(45_000);
      return engine.log.map((event) => `${event.type}:${event.producer}:${event.correlationId}`).join("|");
    };
    assert.equal(trace(1842), trace(1842));
    assert.notEqual(trace(1842), trace(99));
  });

  it("restores a watch from a snapshot", () => {
    const engine = new DeskEngine(11);
    engine.report(HARBOR_MEDICAL);
    engine.advance(1_000);
    const saved = JSON.parse(JSON.stringify(engine.snapshot())) as unknown;
    const revived = new DeskEngine(1);
    assert.equal(revived.restore(saved), true);
    assert.equal(revived.seed, 11);
    assert.equal(revived.state.incidents[0]?.summary, HARBOR_MEDICAL.summary);
    assert.equal(revived.simNow, engine.simNow);
    assert.equal(revived.restore({ version: 2 }), false);
  });
});
