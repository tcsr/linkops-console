/**
 * Fixed-capacity circular buffer.
 *
 * - O(1) `push`; when full, the oldest element is overwritten.
 * - Never grows beyond `capacity` (bounded memory).
 * - `toArray()` returns elements oldest-first (chronological insertion order).
 *
 * Deliberately generic and domain-agnostic: the repository composes one buffer
 * per link to store {@link TelemetrySample}s, but nothing here knows that.
 */
export class RingBuffer<T> {
  private readonly slots: (T | undefined)[];
  /** Index of the oldest element (only meaningful when `count > 0`). */
  private head = 0;
  /** Number of live elements currently stored. */
  private count = 0;

  constructor(public readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(
        `RingBuffer capacity must be a positive integer, got ${capacity}`,
      );
    }
    this.slots = new Array<T | undefined>(capacity);
  }

  /** Number of live elements (0..capacity). */
  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /** Append one element. Overwrites the oldest once at capacity. O(1). */
  push(item: T): void {
    const tail = (this.head + this.count) % this.capacity;
    if (this.isFull) {
      // Overwrite oldest: advance head, capacity unchanged.
      this.slots[this.head] = item;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.slots[tail] = item;
      this.count++;
    }
  }

  /** Most recently pushed element, or `undefined` when empty. */
  last(): T | undefined {
    if (this.count === 0) {
      return undefined;
    }
    const idx = (this.head + this.count - 1) % this.capacity;
    return this.slots[idx];
  }

  /** All live elements, oldest-first. */
  toArray(): T[] {
    const out = new Array<T>(this.count);
    for (let i = 0; i < this.count; i++) {
      // Non-null assertion is safe: indices [head, head+count) are all live.
      out[i] = this.slots[(this.head + i) % this.capacity] as T;
    }
    return out;
  }
}
