<p align="center">
  <img src="src/app/icon.svg" alt="Northline mark" width="72" height="72" />
</p>

<h1 align="center">Northline Desk</h1>

<p align="center">
  A local event-driven dispatch board for a city that fits on one screen.
</p>

<p align="center">
  <a href="events.md">Events</a> ·
  <a href="architecture.md">Architecture</a> ·
  <a href="#start">Start</a>
</p>

<p align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/node-20%2B-1c241c?style=flat-square" />
  <img alt="Queue is local" src="https://img.shields.io/badge/queue-local-f0c14a?style=flat-square&labelColor=1c241c" />
  <img alt="17 events" src="https://img.shields.io/badge/events-17-9ecbff?style=flat-square&labelColor=1c241c" />
</p>

---

Calls, weather, blocked streets, and the station clock are events. A priority queue holds them. Six handlers assign units, raise calls that wait, move crews, and write the radio log.

The queue never leaves the machine. In the browser it lives in the tab. `npm run demo` runs the same queue in one Node process.

```text
operator  ─┐
city      ─┼─▶  event queue  ─▶  audit → projection → dispatch
clock     ─┘         ▲              escalation → movement → radio
                      └──────── follow-up events ────────┘
```

| | |
| --- | --- |
| [events.md](events.md) | All 17 events, payloads, producers, and handlers |
| [architecture.md](architecture.md) | Producers, the two heaps, and the handler order |

## Start

Node.js 20 or newer, and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3847](http://localhost:3847). Leave the terminal running. Stop it with Ctrl+C.

Production build, same address:

```bash
npm run build
npm start
```

The board opens quiet. File a report or arm the city to see the queue move.

## Use it

| Control | What it does |
| --- | --- |
| **File a report** or `N` | Enqueues `incident.reported`. Dispatch assigns the nearest free unit, or holds the call. |
| **Arm the city** or `S` | The simulator emits incidents, weather, and blocked streets. |
| **Event tape** | One line per event that has left the queue. |
| **Right column** | Live counts for producers, the ready and timed queues, and the six handlers. |
| **Hold / Return** | Takes a unit out of service. A waiting call is filled when a suitable unit comes back. |
| **Incident card** | Change priority, or close the call early. Crews also close their own calls. |
| **1x / 2x / 4x** | Simulated speed. |
| **Pause** or Space | Freezes the clock. Timed events stay queued. A new report still goes through. |
| **Reset watch** | Clears the board and the saved snapshot. |

## Trace and tests

Ninety simulated seconds, printed in the terminal. Clock ticks are counted, not printed.

```bash
npm run demo
```

```bash
npm test
```

Tests cover queue order, delayed delivery, assignment, blocked streets, escalation, weather, a handler that throws, a seeded city, and snapshot restore.

## Layout

| Path | Role |
| --- | --- |
| `src/lib/edp/producers.ts` | Operator, city simulator, station clock |
| `src/lib/edp/queue.ts` | Ready heap and delayed heap |
| `src/lib/edp/handlers.ts` | Audit, projection, dispatch, escalation, movement, radio |
| `src/lib/edp/engine.ts` | The clock loop that drains the queue |
| `src/components/desk-app.tsx` | The board |

No account, API key, or network broker. All of the application code is in this repository. The browser and `npm run demo` run the same engine.
