import { linkId, type TelemetrySample } from '@linkops/domain';
import type { FleetLinkView } from '@linkops/console-data-access';
import { DEFAULT_FILTER, parseFilter, selectRows } from './fleet-filter';

function sample(tput: number): TelemetrySample {
  return {
    linkId: linkId('x'),
    ts: '2026-08-05T09:00:01.000Z',
    rssiDbm: -55,
    snrDb: 25,
    throughputMbps: tput,
  };
}

function view(
  id: string,
  overrides: Partial<FleetLinkView> = {},
): FleetLinkView {
  return {
    id: linkId(id),
    name: id,
    siteA: 'Alpha',
    siteB: 'Beta',
    band: '5GHz',
    mode: 'PtP',
    channelWidthMhz: 40,
    capacityMbps: 100,
    txPowerDbm: 20,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'up',
    latestSample: null,
    ...overrides,
  };
}

describe('parseFilter', () => {
  it('falls back to defaults for missing/invalid params', () => {
    expect(parseFilter({})).toEqual(DEFAULT_FILTER);
    expect(parseFilter({ status: 'bogus', sort: 'nope', order: 'x' })).toEqual(DEFAULT_FILTER);
  });

  it('accepts valid params', () => {
    expect(parseFilter({ status: 'down', band: '11GHz', q: ' hub ', sort: 'throughput', order: 'desc' })).toEqual({
      status: 'down',
      band: '11GHz',
      q: 'hub',
      sort: 'throughput',
      order: 'desc',
    });
  });
});

describe('selectRows', () => {
  const rows: FleetLinkView[] = [
    view('alpha', { status: 'up', band: '5GHz', latestSample: sample(90) }),
    view('bravo', { status: 'down', band: '11GHz', latestSample: sample(10), siteA: 'Hub' }),
    view('charlie', { status: 'degraded', band: '5GHz', latestSample: sample(50) }),
  ];

  it('filters by status', () => {
    const out = selectRows(rows, { ...DEFAULT_FILTER, status: 'down' });
    expect(out.map((r) => r.id)).toEqual(['bravo']);
  });

  it('filters by band', () => {
    const out = selectRows(rows, { ...DEFAULT_FILTER, band: '5GHz' });
    expect(out.map((r) => r.id).sort()).toEqual(['alpha', 'charlie']);
  });

  it('filters by search across name and sites', () => {
    const out = selectRows(rows, { ...DEFAULT_FILTER, q: 'hub' });
    expect(out.map((r) => r.id)).toEqual(['bravo']);
  });

  it('sorts by name ascending / descending', () => {
    expect(selectRows(rows, { ...DEFAULT_FILTER, sort: 'name', order: 'asc' }).map((r) => r.id)).toEqual([
      'alpha', 'bravo', 'charlie',
    ]);
    expect(selectRows(rows, { ...DEFAULT_FILTER, sort: 'name', order: 'desc' }).map((r) => r.id)).toEqual([
      'charlie', 'bravo', 'alpha',
    ]);
  });

  it('sorts by status (healthy-first asc)', () => {
    expect(selectRows(rows, { ...DEFAULT_FILTER, sort: 'status', order: 'asc' }).map((r) => r.status)).toEqual([
      'up', 'degraded', 'down',
    ]);
  });

  it('maps throughput from the latest sample (null when absent)', () => {
    const out = selectRows([view('z', { latestSample: null })], DEFAULT_FILTER);
    expect(out[0].throughputMbps).toBeNull();
  });
});
