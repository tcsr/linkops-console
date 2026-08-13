import { linkId } from '@linkops/domain';
import { FleetEventBus } from './fleet-event-bus.js';
import type { FleetEvent } from './fleet-event.js';

function statusEvent(name: string): FleetEvent {
  return {
    type: 'link.status',
    data: { linkId: linkId(name), status: 'up', previous: null },
  };
}

describe('FleetEventBus', () => {
  it('delivers a published event to a subscriber', () => {
    const bus = new FleetEventBus();
    const received: FleetEvent[] = [];
    const sub = bus.events$().subscribe((e) => received.push(e));

    const event = statusEvent('link-0001');
    bus.publish(event);

    expect(received).toEqual([event]);
    sub.unsubscribe();
  });

  it('multicasts the same event to multiple subscribers', () => {
    const bus = new FleetEventBus();
    const a: FleetEvent[] = [];
    const b: FleetEvent[] = [];
    const subA = bus.events$().subscribe((e) => a.push(e));
    const subB = bus.events$().subscribe((e) => b.push(e));

    const event = statusEvent('link-0002');
    bus.publish(event);

    expect(a).toEqual([event]);
    expect(b).toEqual([event]);
    subA.unsubscribe();
    subB.unsubscribe();
  });

  it('stops delivering to a subscriber after it unsubscribes; others continue', () => {
    const bus = new FleetEventBus();
    const a: FleetEvent[] = [];
    const b: FleetEvent[] = [];
    const subA = bus.events$().subscribe((e) => a.push(e));
    const subB = bus.events$().subscribe((e) => b.push(e));

    bus.publish(statusEvent('link-0003'));
    subA.unsubscribe();
    bus.publish(statusEvent('link-0004'));

    expect(a).toHaveLength(1); // only the first event
    expect(b).toHaveLength(2); // both events
    subB.unsubscribe();
  });

  it('does not replay history to a late subscriber', () => {
    const bus = new FleetEventBus();
    bus.publish(statusEvent('link-0005')); // published before anyone subscribes

    const late: FleetEvent[] = [];
    const sub = bus.events$().subscribe((e) => late.push(e));
    expect(late).toHaveLength(0); // no replay buffer

    bus.publish(statusEvent('link-0006'));
    expect(late).toHaveLength(1); // only events after subscription
    sub.unsubscribe();
  });

  it('completes the stream on module destroy', () => {
    const bus = new FleetEventBus();
    let completed = false;
    const sub = bus.events$().subscribe({
      complete: () => {
        completed = true;
      },
    });

    bus.onModuleDestroy();
    expect(completed).toBe(true);
    sub.unsubscribe();
  });
});
