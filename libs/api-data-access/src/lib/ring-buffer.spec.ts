import { RingBuffer } from './ring-buffer.js';

describe('RingBuffer', () => {
  it('rejects a non-positive capacity', () => {
    expect(() => new RingBuffer<number>(0)).toThrow(RangeError);
    expect(() => new RingBuffer<number>(-1)).toThrow(RangeError);
  });

  it('starts empty', () => {
    const buf = new RingBuffer<number>(3);
    expect(buf.size).toBe(0);
    expect(buf.isFull).toBe(false);
    expect(buf.last()).toBeUndefined();
    expect(buf.toArray()).toEqual([]);
  });

  it('appends up to capacity and preserves chronological order', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size).toBe(3);
    expect(buf.isFull).toBe(true);
    expect(buf.toArray()).toEqual([1, 2, 3]);
    expect(buf.last()).toBe(3);
  });

  it('overwrites the oldest element once full', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // overwrites 1
    expect(buf.size).toBe(3);
    expect(buf.toArray()).toEqual([2, 3, 4]);
    expect(buf.last()).toBe(4);
  });

  describe('capacity 300 (5 minutes at 1 Hz)', () => {
    it('holds exactly 300 after appending 300', () => {
      const buf = new RingBuffer<number>(300);
      for (let i = 1; i <= 300; i++) buf.push(i);
      expect(buf.size).toBe(300);
      expect(buf.toArray()[0]).toBe(1);
      expect(buf.last()).toBe(300);
    });

    it('drops the oldest on the 301st append', () => {
      const buf = new RingBuffer<number>(300);
      for (let i = 1; i <= 301; i++) buf.push(i);
      expect(buf.size).toBe(300);
      const arr = buf.toArray();
      expect(arr[0]).toBe(2); // 1 was overwritten
      expect(arr[arr.length - 1]).toBe(301);
      expect(buf.last()).toBe(301);
    });

    it('stays bounded at 300 after appending 400 (key invariant)', () => {
      const buf = new RingBuffer<number>(300);
      for (let i = 1; i <= 400; i++) buf.push(i);
      expect(buf.size).toBe(300);
      const arr = buf.toArray();
      expect(arr).toHaveLength(300);
      expect(arr[0]).toBe(101); // 1..100 overwritten
      expect(arr[299]).toBe(400);
    });
  });
});
