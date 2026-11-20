import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventQueue } from "./queue";
import type { Envelope } from "./types";

function event(sequence: number, priority: number, notBefore = 0): Envelope {
  return {
    id: `evt-${sequence}`,
    type: "clock.tick",
    priority,
    producer: "station-clock",
    producedAt: 0,
    deliveredAt: 0,
    notBefore,
    correlationId: "clock",
    sequence,
    payload: { tick: sequence },
  };
}

describe("event queue", () => {
  it("delivers a higher priority event before an earlier lower priority one", () => {
    const queue = new EventQueue();
    queue.enqueue(event(1, 30), 0);
    queue.enqueue(event(2, 10), 0);
    queue.promote(0);
    assert.equal(queue.dequeueReady()?.id, "evt-2");
    assert.equal(queue.dequeueReady()?.id, "evt-1");
  });

  it("keeps equal priority in arrival order", () => {
    const queue = new EventQueue();
    queue.enqueue(event(1, 40), 0);
    queue.enqueue(event(2, 40), 0);
    queue.enqueue(event(3, 40), 0);
    assert.deepEqual(
      [queue.dequeueReady()?.sequence, queue.dequeueReady()?.sequence, queue.dequeueReady()?.sequence],
      [1, 2, 3],
    );
  });

  it("holds an event until its notBefore time, then respects priority", () => {
    const queue = new EventQueue();
    queue.enqueue(event(1, 10, 5_000), 0);
    queue.enqueue(event(2, 30, 0), 0);
    assert.equal(queue.promote(4_999), 0);
    assert.equal(queue.dequeueReady()?.id, "evt-2");
    assert.equal(queue.readySize, 0);
    assert.equal(queue.promote(5_000), 1);
    assert.equal(queue.dequeueReady()?.id, "evt-1");
  });

  it("removes cancelled events from both heaps", () => {
    const queue = new EventQueue();
    queue.enqueue(event(1, 10, 0), 0);
    queue.enqueue(event(2, 10, 8_000), 0);
    const removed = queue.removeWhere((item) => item.sequence === 1 || item.sequence === 2);
    assert.equal(removed, 2);
    assert.equal(queue.readySize, 0);
    assert.equal(queue.delayedSize, 0);
  });
});
