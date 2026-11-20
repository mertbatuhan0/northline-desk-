import type { Envelope } from "./types";

class Heap<T> {
  private items: T[] = [];

  constructor(private readonly before: (a: T, b: T) => boolean) {}

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop();
    if (last !== undefined && this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  values(): T[] {
    return [...this.items];
  }

  load(items: T[]): void {
    this.items = [...items];
    for (let index = Math.floor(this.items.length / 2) - 1; index >= 0; index -= 1) {
      this.siftDown(index);
    }
  }

  clear(): void {
    this.items = [];
  }

  private siftUp(index: number): void {
    let cursor = index;
    while (cursor > 0) {
      const parent = Math.floor((cursor - 1) / 2);
      if (!this.before(this.items[cursor], this.items[parent])) break;
      [this.items[cursor], this.items[parent]] = [this.items[parent], this.items[cursor]];
      cursor = parent;
    }
  }

  private siftDown(index: number): void {
    let cursor = index;
    const count = this.items.length;
    while (true) {
      let best = cursor;
      const left = cursor * 2 + 1;
      const right = left + 1;
      if (left < count && this.before(this.items[left], this.items[best])) best = left;
      if (right < count && this.before(this.items[right], this.items[best])) best = right;
      if (best === cursor) break;
      [this.items[cursor], this.items[best]] = [this.items[best], this.items[cursor]];
      cursor = best;
    }
  }
}

function readyBefore(a: Envelope, b: Envelope): boolean {
  if (a.priority !== b.priority) return a.priority < b.priority;
  return a.sequence < b.sequence;
}

function delayedBefore(a: Envelope, b: Envelope): boolean {
  if (a.notBefore !== b.notBefore) return a.notBefore < b.notBefore;
  return a.sequence < b.sequence;
}

/**
 * Local event queue.
 *
 * Ready events sit in a min-heap ordered by priority, then by sequence.
 * A lower priority number leaves first. Equal priority is FIFO.
 * Events with notBefore in the future sit in a second heap ordered by time.
 * promote(now) moves due events onto the ready heap before anything is delivered.
 */
export class EventQueue {
  private readonly ready = new Heap<Envelope>(readyBefore);
  private readonly delayed = new Heap<Envelope>(delayedBefore);

  get readySize(): number {
    return this.ready.size;
  }

  get delayedSize(): number {
    return this.delayed.size;
  }

  enqueue(event: Envelope, now: number): void {
    if (event.notBefore <= now) this.ready.push(event);
    else this.delayed.push(event);
  }

  promote(now: number): number {
    let moved = 0;
    while (this.delayed.size > 0) {
      const next = this.delayed.peek();
      if (!next || next.notBefore > now) break;
      const due = this.delayed.pop();
      if (!due) break;
      this.ready.push(due);
      moved += 1;
    }
    return moved;
  }

  peekReady(): Envelope | undefined {
    return this.ready.peek();
  }

  dequeueReady(): Envelope | undefined {
    return this.ready.pop();
  }

  readyValues(): Envelope[] {
    return this.ready
      .values()
      .sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
  }

  delayedValues(): Envelope[] {
    return this.delayed
      .values()
      .sort((a, b) => a.notBefore - b.notBefore || a.sequence - b.sequence);
  }

  removeWhere(predicate: (event: Envelope) => boolean): number {
    const readyKept = this.ready.values().filter((event) => !predicate(event));
    const delayedKept = this.delayed.values().filter((event) => !predicate(event));
    const removed =
      this.ready.size - readyKept.length + (this.delayed.size - delayedKept.length);
    this.ready.load(readyKept);
    this.delayed.load(delayedKept);
    return removed;
  }

  clear(): void {
    this.ready.clear();
    this.delayed.clear();
  }

  load(ready: Envelope[], delayed: Envelope[]): void {
    this.ready.load(ready);
    this.delayed.load(delayed);
  }
}
