# Northline Desk

Northline Desk is a local event-driven dispatch board for a small city. Calls, weather, street closures, and the station clock are events. A priority queue holds them. Handlers assign units, escalate calls that wait too long, move crews, and write the radio log.

The queue is not a network service. In the browser it lives in the tab. `npm run demo` runs the same queue inside one Node process. Refreshing the page continues the watch from `localStorage`.

The full event list is in [events.md](events.md). The producers, queue, and handlers are drawn in [architecture.md](architecture.md).

## Requirements

- Node.js 20 or newer
- npm

## Start the desk

```bash
npm install
npm run dev
```

Open [http://localhost:3847](http://localhost:3847).

Leave that terminal running. Stop it with Ctrl+C.

To run the production build locally:

```bash
npm run build
npm start
```

That also serves [http://localhost:3847](http://localhost:3847).

## Use the board

1. Press **File a report** (or the `N` key) and describe a call. That produces `incident.reported`. Dispatch assigns the nearest suitable unit, or holds the call if none is free.
2. Press **Arm the city** (or `S`) to let the simulator produce incidents, weather, and blocked streets. The station clock produces one tick per simulated second.
3. Watch the **event tape**. Each line is one event that has left the queue. The right-hand column shows the producers, the queue, and the handlers with live counts.
4. Press a unit's **Hold** to take it out of service. A waiting call is assigned when a suitable unit returns.
5. Open an incident to change its priority or close it early. Crews also close their own calls after they work the scene.
6. **1x / 2x / 4x** changes simulated speed. **Pause** (or Space, when you are not typing) freezes the clock. Timed events stay queued. A report you file while paused is still delivered at once.
7. **Reset watch** clears the board and the saved snapshot.

The opening board is quiet on purpose. Arm the city or file a report to see the queue move.

## Headless trace

This runs the city for 90 simulated seconds and prints every delivered event except clock ticks.

```bash
npm run demo
```

The process exits with code 0 when the trace includes a reported call, a dispatch, travel, a close, a clear, radio, and clock ticks.

## Tests

```bash
npm test
```

The tests cover queue order, delayed delivery, assignment, blocked streets, escalation timers, weather slowdown, handler failures, a deterministic simulator, and snapshot restore.

## Project layout

| Path | What it is |
| --- | --- |
| `src/lib/edp/producers.ts` | Operator, city simulator, and station clock |
| `src/lib/edp/queue.ts` | Ready heap and delayed heap |
| `src/lib/edp/handlers.ts` | Audit, projection, dispatch, escalation, movement, radio |
| `src/lib/edp/engine.ts` | Clock loop that drains the queue |
| `src/components/desk-app.tsx` | The board |
| `events.md` | Every event, its payload, who produces it, who handles it |
| `architecture.md` | Producers, queue, and handlers |

## Notes for marking

- All of the application code is in this repository.
- No account, API key, or network broker is required.
- The same engine runs in the browser and in `npm run demo`.
