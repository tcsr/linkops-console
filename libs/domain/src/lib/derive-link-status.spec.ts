import { deriveLinkStatus } from './derive-link-status.js';
import { linkId } from './link-id.js';
import type { Link } from './link.js';
import type { TelemetrySample } from './telemetry-sample.js';

const NOW = new Date('2025-06-01T00:00:00.000Z');
const NOW_MS = NOW.getTime();

/** ISO string `ageMs` before NOW. */
function tsAgo(ageMs: number): string {
  return new Date(NOW_MS - ageMs).toISOString();
}

const link: Link = {
  id: linkId('link-0001'),
  name: 'Test Link',
  siteA: 'A',
  siteB: 'B',
  band: '5GHz',
  mode: 'PtP',
  channelWidthMhz: 40,
  capacityMbps: 100, // => up throughput >= 60, degraded throughput >= 20
  txPowerDbm: 20,
  version: 1,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

function sample(overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    linkId: link.id,
    ts: NOW.toISOString(),
    snrDb: 30,
    throughputMbps: 90,
    ...overrides,
  };
}

describe('deriveLinkStatus', () => {
  it('is down when there is no latest sample', () => {
    expect(deriveLinkStatus(link, undefined, NOW)).toBe('down');
  });

  it('is down when the sample is stale by more than 5s', () => {
    const stale = sample({ ts: tsAgo(5001), snrDb: 40, throughputMbps: 100 });
    expect(deriveLinkStatus(link, stale, NOW)).toBe('down');
  });

  it('is not treated as stale at exactly 5s of age', () => {
    const edge = sample({ ts: tsAgo(5000), snrDb: 40, throughputMbps: 100 });
    expect(deriveLinkStatus(link, edge, NOW)).toBe('up');
  });

  it('is up at the exact up boundary (snr 18, throughput 0.6*capacity)', () => {
    expect(deriveLinkStatus(link, sample({ snrDb: 18, throughputMbps: 60 }), NOW)).toBe('up');
  });

  it('drops from up to degraded when throughput is just below 0.6*capacity', () => {
    expect(deriveLinkStatus(link, sample({ snrDb: 18, throughputMbps: 59.9 }), NOW)).toBe(
      'degraded',
    );
  });

  it('drops from up to degraded when snr is just below 18', () => {
    expect(deriveLinkStatus(link, sample({ snrDb: 17.9, throughputMbps: 90 }), NOW)).toBe(
      'degraded',
    );
  });

  it('is degraded at the exact degraded boundary (snr 10, throughput 0.2*capacity)', () => {
    expect(deriveLinkStatus(link, sample({ snrDb: 10, throughputMbps: 20 }), NOW)).toBe(
      'degraded',
    );
  });

  it('is down when snr is just below the degraded threshold', () => {
    expect(deriveLinkStatus(link, sample({ snrDb: 9.9, throughputMbps: 90 }), NOW)).toBe('down');
  });

  it('is down when throughput is just below 0.2*capacity', () => {
    expect(deriveLinkStatus(link, sample({ snrDb: 30, throughputMbps: 19.9 }), NOW)).toBe('down');
  });

  it('requires BOTH snr and throughput for up (high snr, low throughput => degraded)', () => {
    expect(deriveLinkStatus(link, sample({ snrDb: 40, throughputMbps: 25 }), NOW)).toBe(
      'degraded',
    );
  });
});
