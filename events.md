# Events

Northline Desk uses seventeen event types. An event is a fact that already happened. Producers enqueue events. The queue delivers each ready event to the handlers in a fixed order. Some handlers enqueue follow-up events. Those follow-ups are produced by the handler name (`dispatch`, `escalation`, `movement`, `radio`).

## Envelope

Every event has the same envelope. The `payload` shape depends on `type`.

| Field | Meaning |
| --- | --- |
| `id` | `evt-1`, `evt-2`, … assigned when the event is enqueued |
| `type` | One of the names below |
| `priority` | Delivery rank. A lower number leaves the ready queue first |
| `producer` | Who enqueued it |
| `producedAt` | Simulated time when it was enqueued, in milliseconds |
| `notBefore` | Simulated time before which the queue will not deliver it |
| `deliveredAt` | Simulated time when a handler actually received it. `0` while it is still queued |
| `correlationId` | Ties a cascade together. Incident events use the incident id |
| `sequence` | Arrival number. Equal ranks are FIFO by this number |
| `payload` | The body documented on each event |

Ranks used by the desk:

| Rank | Events |
| --- | --- |
| 8 | `incident.escalated` when a supervisor is paged |
| 10 / 20 / 30 | `incident.reported` at priority 1 / 2 / 3 |
| 12 | `incident.escalated` that raises priority |
| 18 | `incident.resolved` |
| 22 | `incident.updated` |
| 28 | `unit.status_changed` |
| 32 | `unit.dispatched` |
| 36 | `dispatch.deferred` |
| 40 | `unit.enroute`, `unit.onscene`, `unit.cleared` |
| 60 | weather and traffic events |
| 70 | `radio.transmission` |
| 80 | `shift.note` |
| 90 | `clock.tick` |

## shift.note

The station clock opens the watch with one note. The board shows the latest note under the title.

- Producer: `station-clock`
- Handlers: audit, projection
- Payload: `{ text: string }`

## clock.tick

One tick per simulated second. The tape hides these so they do not bury the calls. Escalation reads them.

- Producer: `station-clock`
- Handlers: audit, projection, escalation
- Payload: `{ tick: number }` where `tick` is the second index (`1` at 00:01)

Escalation may enqueue `incident.escalated`.

## incident.reported

A new call. The operator files one from the report dialog. The city simulator files one on its timer.

- Producers: `operator`, `city-simulator`
- Handlers: audit, projection, dispatch
- Payload:

```json
{
  "incidentId": "inc-1",
  "kind": "medical",
  "priority": 1,
  "district": "harbor",
  "summary": "Person down on pier 4 beside the crane",
  "reporter": "Pier office"
}
```

`kind` is `medical`, `fire`, `rescue`, `police`, or `utility`. `priority` is `1`, `2`, or `3`. `district` is `harbor`, `mill`, `ridge`, `campus`, `market`, or `yards`.

Dispatch may enqueue `unit.dispatched` or `dispatch.deferred`.

## incident.updated

The operator changes the priority of an open call. A summary change uses the same event. Changing priority restarts that call's escalation timer.

- Producer: `operator`
- Handlers: audit, projection, radio (only when priority is present)
- Payload: `{ incidentId: string, summary?: string, priority?: 1 | 2 | 3 }`

Radio may enqueue `radio.transmission`.

## incident.escalated

A call still has no unit and its wait exceeded the timer for its current priority.

| From | Wait | Result |
| --- | --- | --- |
| P3 | 20s | raised to P2 |
| P2 | 16s | raised to P1 |
| P1 | 12s | supervisor paged once |

- Producer: `escalation`
- Handlers: audit, projection, dispatch, radio
- Payload:

```json
{
  "incidentId": "inc-4",
  "from": 3,
  "to": 2,
  "reason": "No unit assigned for 20s at priority 3",
  "pageSupervisor": false
}
```

`from` and `to` are both `1` when the supervisor is paged. Dispatch tries again and may enqueue `unit.dispatched` or `dispatch.deferred`.

## incident.resolved

The call is closed. The operator can close it early. Otherwise movement enqueues this event after the crew has worked the scene (`6s + priority * 2s`: 8s at P1, 10s at P2, 12s at P3).

- Producers: `operator`, `movement`
- Handlers: audit, projection, movement, radio
- Payload: `{ incidentId: string, by: string }`

Movement cancels any trip or later close still queued for that call, then enqueues `unit.cleared` 2.5s later when a unit is still assigned.

## dispatch.deferred

No suitable unit is free. The incident stays open and shows the reason. A repeat with the same reason is not enqueued again.

- Producer: `dispatch`
- Handlers: audit, projection, radio
- Payload: `{ incidentId: string, reason: string }`

Suitable types:

| Kind | Units tried, in order |
| --- | --- |
| medical | medic, rescue |
| fire | engine, rescue |
| rescue | rescue, engine, medic |
| police | patrol |
| utility | patrol, engine |

## unit.dispatched

A free unit is assigned. The payload carries the times movement should use, so travel is calculated once.

- Producer: `dispatch`
- Handlers: audit, projection, movement, radio
- Payload: `{ incidentId: string, unitId: string, enrouteAt: number, onSceneAt: number }`

Movement enqueues `unit.enroute` at `enrouteAt` and `unit.onscene` at `onSceneAt`.

Travel, before weather and street multipliers:

- en route after `1600 + distance * 800` ms
- on scene after that plus `2000 + distance * 600` ms

Distance is the Manhattan distance between district coordinates. A weather advisory multiplies by 1.2, a warning by 1.55. A blocked street on the unit's home district or the incident district multiplies by 1.35.

Choosing the unit is separate from travel time. Rank of unit type comes first, then effective distance. A blocked home district adds 4 to that distance. A blocked incident district adds 2. Ties break toward the lower unit id.

## unit.enroute

The crew is moving. Ignored if the call is already closed or the unit was given a different call.

- Producer: `movement`
- Handlers: audit, projection
- Payload: `{ incidentId: string, unitId: string }`
- `notBefore`: the `enrouteAt` from dispatch

## unit.onscene

The crew has arrived.

- Producer: `movement`
- Handlers: audit, projection, movement, radio
- Payload: `{ incidentId: string, unitId: string }`
- `notBefore`: the `onSceneAt` from dispatch

Movement enqueues `incident.resolved` for the end of the work interval.

## unit.cleared

The unit is available again.

- Producer: `movement`
- Handlers: audit, projection, dispatch, radio
- Payload: `{ incidentId: string, unitId: string }`
- `notBefore`: 2.5s after the call closed

Dispatch then tries to fill every open call, highest priority and oldest first.

## unit.status_changed

The operator holds a unit or returns it. A unit that is already on a call ignores this event.

- Producer: `operator`
- Handlers: audit, projection, dispatch, radio
- Payload: `{ unitId: string, status: "available" | "unavailable", reason: string }`

Returning a unit makes dispatch try the open calls.

## radio.transmission

One spoken line. Radio never handles its own transmissions, so this cannot loop.

- Producer: `radio`
- Handlers: audit, projection
- Payload: `{ from: string, text: string }`

## weather.advisory

Fog, wind, drizzle, or a storm. Advisory and warning both slow travel. Warning slows it more. The citywide weather does not change which unit is chosen.

- Producer: `city-simulator`
- Handlers: audit, projection, radio
- Payload: `{ level: "advisory" | "warning", summary: string }`

## weather.cleared

The cell moved off, or the operator logged an all-clear.

- Producers: `city-simulator`, `operator`
- Handlers: audit, projection, radio
- Payload: `{ summary: string }`

## traffic.obstruction

A street in one district is blocked. That changes both unit choice and travel time.

- Producer: `city-simulator`
- Handlers: audit, projection, radio
- Payload: `{ obstructionId: string, district: DistrictId, summary: string }`

## traffic.cleared

The street is open again.

- Producers: `city-simulator`, `operator`
- Handlers: audit, projection
- Payload: `{ obstructionId: string }`

## Who produces what

| Producer | Events it originates |
| --- | --- |
| Operator console | `incident.reported`, `incident.updated`, `incident.resolved`, `unit.status_changed`, `traffic.cleared`, `weather.cleared` |
| City simulator | `incident.reported`, `weather.advisory`, `weather.cleared`, `traffic.obstruction`, `traffic.cleared` |
| Station clock | `shift.note`, `clock.tick` |
| Dispatch handler | `unit.dispatched`, `dispatch.deferred` |
| Escalation handler | `incident.escalated` |
| Movement handler | `unit.enroute`, `unit.onscene`, `incident.resolved`, `unit.cleared` |
| Radio handler | `radio.transmission` |

The first three are the originating producers. The last four are handlers that put consequential events back on the same queue.

## City timers

While the simulator is armed, measured in simulated time:

| What | First event | Later gap |
| --- | --- | --- |
| Incident | 8s | 10–18s |
| Blocked street | 14s | 16–30s |
| Weather | 22s | 28–48s |

The gaps are chosen by a seeded generator (`mulberry32`, default seed `1842`), so `npm run demo` prints the same trace every run. Arming the simulator late does not dump every overdue event at once. Due timers are pushed a few seconds into the future.
