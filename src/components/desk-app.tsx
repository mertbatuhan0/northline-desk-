"use client";

import { Pause, Play, Plus, Radio, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CityMap } from "@/components/city-map";
import { ReportDialog, type ReportDraft } from "@/components/report-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DISTRICTS, HANDLER_BLURBS, KIND_LABEL, ORIGIN_PRODUCERS } from "@/lib/edp/constants";
import { DeskEngine } from "@/lib/edp/engine";
import { describeEvent, eventTone, formatClock, formatStamp, type EventTone } from "@/lib/edp/format";
import { HANDLER_NAMES } from "@/lib/edp/handlers";
import type { Envelope, Incident, Priority, Speed, Unit, UnitStatus } from "@/lib/edp/types";

const STORAGE_KEY = "northline-desk-v1";

const PRIORITY_EDGE = {
  1: "border-l-[#ff6a45]",
  2: "border-l-[#ffb020]",
  3: "border-l-[#d6de6a]",
} as const;

const TONE_CLASS: Record<EventTone, string> = {
  call: "text-[#ff8d6a]",
  unit: "text-[#9ecbff]",
  radio: "text-[#e7c98a]",
  world: "text-[#d6de6a]",
  time: "text-muted-foreground",
};

const UNIT_STATUS: Record<UnitStatus, string> = {
  available: "Available",
  dispatched: "Dispatched",
  enroute: "En route",
  onscene: "On scene",
  unavailable: "Held",
};

const INCIDENT_STATUS: Record<Incident["status"], string> = {
  open: "Waiting",
  dispatched: "Dispatched",
  enroute: "En route",
  onscene: "On scene",
  resolved: "Closed",
};

type TapeFilter = "all" | EventTone;

export function DeskApp() {
  const engineRef = useRef<DeskEngine | null>(null);
  const [engine, setEngine] = useState<DeskEngine | null>(null);
  const [, setFrame] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [filter, setFilter] = useState<TapeFilter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reportOpenRef = useRef(false);
  reportOpenRef.current = reportOpen;

  useEffect(() => {
    const next = new DeskEngine(1842);
    let restored = false;
    let failed = false;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        restored = next.restore(JSON.parse(raw) as unknown);
        failed = !restored;
      }
    } catch {
      failed = true;
    }
    engineRef.current = next;
    setEngine(next);
    if (failed) {
      setNotice("The saved watch could not be read. Started a fresh board.");
    } else if (restored) {
      setNotice("Continued the watch saved in this browser.");
    }

    let last = performance.now();
    const timer = window.setInterval(() => {
      const current = engineRef.current;
      if (!current || current.paused) return;
      const now = performance.now();
      const elapsed = Math.min(1_000, now - last);
      last = now;
      const before = current.log.at(-1)?.id;
      current.tick(elapsed);
      const latest = current.log.at(-1);
      if (latest && latest.id !== before && latest.type !== "clock.tick") {
        setAnnouncement(describeEvent(latest, current.state));
      }
      setFrame((value) => value + 1);
    }, 200);

    const persist = () => {
      const current = engineRef.current;
      if (!current) return;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current.snapshot()));
      } catch {
        // The desk still runs when the browser refuses storage.
      }
    };
    const saveTimer = window.setInterval(persist, 2_000);
    window.addEventListener("beforeunload", persist);

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || reportOpenRef.current) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      const current = engineRef.current;
      if (!current) return;
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        setReportOpen(true);
      } else if (event.key === " " && (target === document.body || tag === "MAIN")) {
        event.preventDefault();
        current.paused = !current.paused;
        setFrame((value) => value + 1);
      } else if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        current.setSimulator(!current.simulator);
        setFrame((value) => value + 1);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(saveTimer);
      window.removeEventListener("beforeunload", persist);
      window.removeEventListener("keydown", onKey);
      persist();
    };
  }, []);

  function refresh(latest?: Envelope) {
    if (latest && latest.type !== "clock.tick" && engine) {
      setAnnouncement(describeEvent(latest, engine.state));
    }
    setFrame((value) => value + 1);
  }

  if (!engine) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="text-center">
          <p className="text-[11px] tracking-[0.22em] text-muted-foreground uppercase">Northline</p>
          <p className="font-display mt-2 text-3xl">Opening the watch</p>
        </div>
      </main>
    );
  }

  const openIncidents = engine.state.incidents.filter((incident) => incident.status !== "resolved");
  const resolvedIncidents = engine.state.incidents.filter((incident) => incident.status === "resolved");
  const visibleIncidents = [...(showResolved ? engine.state.incidents : openIncidents)].sort((a, b) => {
    const closedA = a.status === "resolved" ? 1 : 0;
    const closedB = b.status === "resolved" ? 1 : 0;
    return closedA - closedB || a.priority - b.priority || a.reportedAt - b.reportedAt;
  });
  const ready = engine.queue.readyValues();
  const delayed = engine.queue.delayedValues();
  const latestError = engine.state.errors.at(-1);
  const note = engine.state.notes.at(-1);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <p className="text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            Local event queue · seed {engine.seed}
          </p>
          <h1 className="font-display mt-1 text-4xl leading-none sm:text-5xl">Northline</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Municipal dispatch for a city that fits on one screen. Producers put events on a local queue. Handlers assign crews, raise waits, and keep this tape.
          </p>
          {note ? <p className="mt-2 text-sm text-foreground/80">{note.text}</p> : null}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Sim time</div>
              <div className="font-mono text-2xl tabular-nums">{formatClock(engine.simNow)}</div>
            </div>
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Queue</div>
              <div className="font-mono text-sm tabular-nums">
                {ready.length} ready · {delayed.length} timed
              </div>
            </div>
            <div className="flex rounded-xl border border-border bg-card p-1">
              {([1, 2, 4] as Speed[]).map((speed) => (
                <Button
                  key={speed}
                  size="sm"
                  variant={engine.speed === speed ? "default" : "ghost"}
                  aria-pressed={engine.speed === speed}
                  onClick={() => {
                    engine.speed = speed;
                    refresh();
                  }}
                >
                  {speed}x
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              aria-pressed={engine.paused}
              onClick={() => {
                engine.paused = !engine.paused;
                refresh();
              }}
            >
              {engine.paused ? <Play /> : <Pause />}
              {engine.paused ? "Resume" : "Pause"}
            </Button>
            <Button
              variant={engine.simulator ? "default" : "outline"}
              aria-pressed={engine.simulator}
              onClick={() => {
                engine.setSimulator(!engine.simulator);
                refresh();
              }}
            >
              {engine.simulator ? "City live" : "Arm the city"}
            </Button>
            <Button onClick={() => setReportOpen(true)}>
              <Plus />
              File a report
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                engine.reset();
                window.localStorage.removeItem(STORAGE_KEY);
                setSelectedId(null);
                setNotice(null);
                setAnnouncement("Watch reset.");
                refresh();
              }}
            >
              <RotateCcw />
              Reset watch
            </Button>
          </div>
        </div>
      </header>

      {engine.paused ? (
        <p className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          Paused. Timed events stay in the queue until you resume. A new report still goes through immediately.
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">{notice}</p>
      ) : null}
      {latestError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <p>
            Handler {latestError.handler} failed on {latestError.eventType}: {latestError.message}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              engine.dismissErrors();
              refresh();
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_300px]">
        <section className="flex flex-col gap-4 xl:col-span-1">
          <Panel
            title="City"
            aside={<span className="text-xs text-muted-foreground">{openIncidents.length} open</span>}
          >
            <CityMap incidents={engine.state.incidents} units={engine.state.units} />
            <Conditions engine={engine} onChange={() => refresh(engine.log.at(-1))} />
          </Panel>
          <Panel
            title="Incidents"
            aside={
              <Button size="sm" variant="ghost" onClick={() => setShowResolved((value) => !value)}>
                {showResolved ? "Hide closed" : `Closed ${resolvedIncidents.length}`}
              </Button>
            }
          >
            {visibleIncidents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <p className="font-display text-2xl">The board is clear.</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  File a report, or arm the city simulator and let the clock bring the calls in.
                </p>
              </div>
            ) : (
              <div className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto pr-1">
                {visibleIncidents.map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    engine={engine}
                    selected={selectedId === incident.id}
                    onSelect={() => setSelectedId((current) => (current === incident.id ? null : incident.id))}
                    onChange={() => refresh(engine.log.at(-1))}
                  />
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="flex flex-col gap-4">
          <Panel title="Units" aside={<span className="text-xs text-muted-foreground">Eight on the watch</span>}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {engine.state.units.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  onHold={() => {
                    engine.setUnitStatus(
                      unit.id,
                      unit.status === "available" ? "unavailable" : "available",
                      unit.status === "available" ? "Held by the operator" : "Returned by the operator",
                    );
                    refresh(engine.log.at(-1));
                  }}
                />
              ))}
            </div>
          </Panel>
          <Panel
            title="Event tape"
            aside={<span className="font-mono text-xs text-muted-foreground">{engine.state.processed} delivered</span>}
          >
            <div className="mb-3 flex flex-wrap gap-1">
              {(
                [
                  ["all", "All"],
                  ["call", "Calls"],
                  ["unit", "Units"],
                  ["radio", "Radio"],
                  ["world", "City"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={filter === value ? "secondary" : "ghost"}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Tape engine={engine} filter={filter} />
            <Separator className="my-3" />
            <div className="flex items-center gap-2 text-xs tracking-[0.14em] text-muted-foreground uppercase">
              <Radio className="size-3.5" />
              Radio
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {engine.state.radio.length === 0 ? (
                <li className="text-sm text-muted-foreground">The channel is quiet.</li>
              ) : (
                engine.state.radio.slice(-5).reverse().map((line) => (
                  <li key={line.id} className="text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{formatStamp(line.at)}</span>{" "}
                    <span className="text-[#e7c98a]">{line.from}.</span> {line.text}
                  </li>
                ))
              )}
            </ul>
          </Panel>
        </section>

        <aside className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto">
          <Architecture engine={engine} ready={ready} delayed={delayed} />
        </aside>
      </div>

      <footer className="pb-4 text-xs text-muted-foreground">
        N files a report. Space pauses the clock when nothing else is focused. S arms the city. Clock ticks stay off the tape and show up as the sim clock and the escalation count.
      </footer>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        onSubmit={(report: ReportDraft) => {
          const id = engine.report(report);
          setSelectedId(id);
          refresh(engine.log.at(-1));
        }}
      />
    </main>
  );
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/90">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{title}</h2>
        {aside}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Conditions({ engine, onChange }: { engine: DeskEngine; onChange: () => void }) {
  const { weather, obstructions } = engine.state;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/50 px-3 py-2 text-sm">
        <p>
          <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Weather </span>
          {weather.level === "clear" ? "Clear" : weather.level === "warning" ? "Warning" : "Advisory"}
          <span className="text-muted-foreground"> · {weather.summary}</span>
        </p>
        {weather.level !== "clear" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              engine.clearWeather();
              onChange();
            }}
          >
            Log all-clear
          </Button>
        ) : null}
      </div>
      {obstructions.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/50 px-3 py-2 text-sm"
        >
          <p>
            <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Blocked </span>
            {DISTRICTS[item.district].label}
            <span className="text-muted-foreground"> · {item.summary}</span>
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              engine.clearObstruction(item.id);
              onChange();
            }}
          >
            Open street
          </Button>
        </div>
      ))}
    </div>
  );
}

function IncidentCard({
  incident,
  engine,
  selected,
  onSelect,
  onChange,
}: {
  incident: Incident;
  engine: DeskEngine;
  selected: boolean;
  onSelect: () => void;
  onChange: () => void;
}) {
  const unit = engine.state.units.find((item) => item.id === incident.unitId);
  const related = engine.log.filter((event) => event.correlationId === incident.id).slice(-8).reverse();
  let crew = incident.holdReason ?? "Waiting for a unit";
  if (unit && incident.status !== "resolved") crew = `${unit.callSign} · ${UNIT_STATUS[unit.status]}`;
  if (incident.status === "resolved" && unit?.incidentId === incident.id) crew = `${unit.callSign} is clearing`;
  if (incident.status === "resolved" && unit?.incidentId !== incident.id) crew = "Closed";

  return (
    <article className={`rounded-xl border border-border border-l-4 bg-background/40 ${PRIORITY_EDGE[incident.priority]}`}>
      <button type="button" className="w-full px-3 py-2.5 text-left" onClick={onSelect}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">P{incident.priority}</Badge>
            <span className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
              {KIND_LABEL[incident.kind]}
            </span>
            {incident.supervisorPaged ? (
              <span className="text-xs text-[#ff8d6a]">Supervisor paged</span>
            ) : null}
          </div>
          <span className="font-mono text-xs text-muted-foreground">{formatClock(incident.reportedAt)}</span>
        </div>
        <p className="mt-1 text-sm">{incident.summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {DISTRICTS[incident.district].label} · {incident.reporter} · {INCIDENT_STATUS[incident.status]} · {crew}
        </p>
      </button>
      {selected ? (
        <div className="border-t border-border px-3 py-3">
          {incident.status !== "resolved" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Set priority</span>
              {([1, 2, 3] as Priority[]).map((priority) => (
                <Button
                  key={priority}
                  size="sm"
                  variant={incident.priority === priority ? "default" : "outline"}
                  onClick={() => {
                    if (incident.priority === priority) return;
                    engine.updateIncident(incident.id, { priority });
                    onChange();
                  }}
                >
                  P{priority}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  engine.resolve(incident.id);
                  onChange();
                }}
              >
                Close call
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">This call is closed. The crew event is still on the tape.</p>
          )}
          <ul className="mt-3 flex flex-col gap-1">
            {related.map((event) => (
              <li key={event.id} className="font-mono text-[11px] text-muted-foreground">
                <span className={TONE_CLASS[eventTone(event.type)]}>{formatStamp(event.deliveredAt || event.producedAt)}</span>{" "}
                {event.type} · {describeEvent(event, engine.state)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function UnitCard({ unit, onHold }: { unit: Unit; onHold: () => void }) {
  const busy = unit.status !== "available" && unit.status !== "unavailable";
  return (
    <div className="rounded-xl border border-border bg-background/40 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm">{unit.id}</span>
        <span className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{unit.type}</span>
      </div>
      <p className="mt-1 text-sm">{unit.callSign}</p>
      <p className="text-xs text-muted-foreground">
        {DISTRICTS[unit.district].label} · {UNIT_STATUS[unit.status]}
      </p>
      {busy ? null : (
        <Button className="mt-2" size="sm" variant="outline" onClick={onHold}>
          {unit.status === "available" ? "Hold" : "Return"}
        </Button>
      )}
    </div>
  );
}

function Tape({ engine, filter }: { engine: DeskEngine; filter: TapeFilter }) {
  const rows = engine.log
    .filter((event) => event.type !== "clock.tick")
    .filter((event) => filter === "all" || eventTone(event.type) === filter)
    .slice(-16)
    .reverse();

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No events on this filter yet.</p>;
  }

  return (
    <ol className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto pr-1">
      {rows.map((event) => (
        <li key={event.id} className="grid grid-cols-[4.6rem_1fr] gap-x-3 text-sm sm:grid-cols-[4.6rem_8.5rem_1fr]">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatStamp(event.deliveredAt || event.producedAt)}
          </span>
          <span className={`hidden font-mono text-[11px] sm:block ${TONE_CLASS[eventTone(event.type)]}`}>
            {event.type}
          </span>
          <span>
            <span className="text-muted-foreground">{event.producer}</span>
            <span className="text-muted-foreground"> · </span>
            {describeEvent(event, engine.state)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Architecture({
  engine,
  ready,
  delayed,
}: {
  engine: DeskEngine;
  ready: Envelope[];
  delayed: Envelope[];
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/90 p-4">
      <h2 className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">How this desk runs</h2>
      <ol className="mt-4 space-y-5 border-l border-border pl-4">
        <li className="relative">
          <Dot />
          <h3 className="text-sm font-medium">Producers</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {ORIGIN_PRODUCERS.map((producer) => {
              const count = engine.state.producerCounts[producer.id] ?? 0;
              const live = producer.id === "city-simulator" ? engine.simulator : producer.id === "station-clock";
              return (
                <li key={producer.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm">{producer.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{count}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {producer.detail}
                    {producer.id === "city-simulator" ? (live ? " Live." : " Quiet.") : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </li>
        <li className="relative">
          <Dot />
          <h3 className="text-sm font-medium">Event queue</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ready events leave by priority, then arrival. Timed events wait until the sim clock reaches them. Lower rank goes first.
          </p>
          <QueueList label="Ready" events={ready} empty="Nothing is waiting." />
          <QueueList label="Timed" events={delayed} empty="No events are waiting on the clock." timed />
        </li>
        <li className="relative">
          <Dot />
          <h3 className="text-sm font-medium">Handlers</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Each delivered event runs these in order. Dispatch, escalation, movement, and radio may put new events back on the queue.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {HANDLER_NAMES.map((name) => (
              <li key={name} className="flex items-start justify-between gap-3">
                <span>
                  <span className="font-mono text-xs">{name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{HANDLER_BLURBS[name]}</span>
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {engine.state.handlerCounts[name] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </li>
      </ol>
    </section>
  );
}

function QueueList({
  label,
  events,
  empty,
  timed = false,
}: {
  label: string;
  events: Envelope[];
  empty: string;
  timed?: boolean;
}) {
  return (
    <div className="mt-2">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label} · {events.length}
      </p>
      {events.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {events.slice(0, 4).map((event) => (
            <li key={event.id} className="font-mono text-[11px] text-foreground/80">
              {timed ? formatStamp(event.notBefore) : `rank ${event.priority}`} · {event.type}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dot() {
  return (
    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" aria-hidden="true" />
  );
}
