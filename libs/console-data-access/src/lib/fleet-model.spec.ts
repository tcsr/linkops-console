import { linkId, type Link, type TelemetrySample } from '@linkops/domain';
import {
  applyEvents,
  fromSnapshot,
  type FleetLinkView,
} from './fleet-model';
import type { ConsoleFleetEvent } from './fleet-event';

function link(id: string, capacity = 100): Link {
  return {
    id: linkId(id),
    name: id,
    siteA: 'A',
    siteB: 'B',
    band: '5GHz',
    mode: 'PtP',
    channelWidthMhz: 40,
    capacityMbps: capacity,
    txPowerDbm: 20,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function view(id: string): FleetLinkView {
  return { ...link(id), status: 'up', latestSample: null };
}

function sample(id: string, tput: number): TelemetrySample {
  return {
    linkId: linkId(id),
    ts: '2026-08-05T09:00:01.000Z',
    rssiDbm: -55,
    snrDb: 25,
    throughputMbps: tput,
  };
}

describe('fleet-model', () => {
  it('builds a keyed model from a REST snapshot', () => {
    const model = fromSnapshot([view('link-1'), view('link-2')], {
      total: 2,
      up: 2,
      degraded: 0,
      down: 0,
      avgThroughputMbps: 0,
      worstLinkId: null,
    });
    expect(model.rows.size).toBe(2);
    expect(model.rows.get(linkId('link-1'))?.status).toBe('up');
    expect(model.summary?.total).toBe(2);
  });

  it('applies a coalesced batch as one new model, updating telemetry/status/summary', () => {
    const model = fromSnapshot([view('link-1'), view('link-2')], null);
    const events: ConsoleFleetEvent[] = [
      { type: 'link.telemetry', data: sample('link-1', 80) },
      { type: 'link.status', data: { linkId: linkId('link-1'), status: 'degraded', previous: 'up' } },
      {
        type: 'fleet.summary',
        data: { total: 2, up: 1, degraded: 1, down: 0, avgThroughputMbps: 80, worstLinkId: linkId('link-1') },
      },
    ];
    const next = applyEvents(model, events);

    expect(next).not.toBe(model); // new immutable model
    expect(next.rows.get(linkId('link-1'))?.latestSample?.throughputMbps).toBe(80);
    expect(next.rows.get(linkId('link-1'))?.status).toBe('degraded');
    expect(next.rows.get(linkId('link-2'))).toBe(model.rows.get(linkId('link-2'))); // untouched row identity
    expect(next.summary?.degraded).toBe(1);
  });

  it('returns the same reference when a batch changes nothing', () => {
    const model = fromSnapshot([view('link-1')], null);
    // status event with unchanged status + telemetry for an unknown link
    const next = applyEvents(model, [
      { type: 'link.status', data: { linkId: linkId('link-1'), status: 'up', previous: 'up' } },
      { type: 'link.telemetry', data: sample('ghost', 10) },
    ]);
    expect(next).toBe(model);
  });

  it('ignores events for links absent from the snapshot', () => {
    const model = fromSnapshot([view('link-1')], null);
    const next = applyEvents(model, [{ type: 'link.telemetry', data: sample('link-9', 50) }]);
    expect(next).toBe(model);
    expect(next.rows.has(linkId('link-9'))).toBe(false);
  });
});
