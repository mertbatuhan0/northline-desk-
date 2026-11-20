import { DeskEngine } from "../src/lib/edp/engine";
import { describeEvent, formatStamp } from "../src/lib/edp/format";

const seed = 1842;
const engine = new DeskEngine(seed);
engine.setSimulator(true);
engine.advance(90_000);

const lines = engine.log.filter((event) => event.type !== "clock.tick");
const ticks = engine.log.filter((event) => event.type === "clock.tick").length;

console.log("NORTHLINE DESK");
console.log(`Headless trace · seed ${seed} · city simulator armed · 90s of simulated time`);
console.log("The queue ran inside this process. Nothing was sent over the network.");
console.log("");
console.log("time       producer         event                  what happened");
console.log("---------  ---------------  ---------------------  ------------------------------");

for (const event of lines) {
  const summary = describeEvent(event, engine.state).replace(/\s+/g, " ");
  console.log(
    [
      formatStamp(event.deliveredAt).padEnd(9),
      event.producer.padEnd(15),
      event.type.padEnd(21),
      summary.length > 72 ? `${summary.slice(0, 69)}...` : summary,
    ].join("  "),
  );
}

console.log("");
console.log(`clock ticks delivered: ${ticks}`);
console.log(`events on the tape: ${engine.state.processed}`);
console.log(
  `queue now: ${engine.queue.readySize} ready, ${engine.queue.delayedSize} waiting on the clock`,
);
console.log("");
console.log("board");
for (const incident of engine.state.incidents) {
  console.log(
    `  ${incident.id}  P${incident.priority} ${incident.kind}  ${incident.district}  ${incident.status}  ${incident.summary}`,
  );
}
console.log("");
console.log("handlers");
for (const handler of engine.handlers) {
  console.log(`  ${handler.name.padEnd(12)} ${engine.state.handlerCounts[handler.name] ?? 0}`);
}

const types = new Set<string>(engine.log.map((event) => event.type));
const required = [
  "incident.reported",
  "unit.dispatched",
  "unit.enroute",
  "unit.onscene",
  "incident.resolved",
  "unit.cleared",
  "radio.transmission",
  "clock.tick",
];
const missing = required.filter((type) => !types.has(type));
if (engine.state.errors.length > 0 || missing.length > 0) {
  console.error("");
  console.error("demo failed");
  if (missing.length > 0) console.error(`missing events: ${missing.join(", ")}`);
  for (const error of engine.state.errors) console.error(`${error.handler}: ${error.message}`);
  process.exit(1);
}
