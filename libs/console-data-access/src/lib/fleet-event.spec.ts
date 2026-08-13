import { parseFleetEvent } from './fleet-event';

describe('parseFleetEvent', () => {
  it('parses a link.telemetry frame', () => {
    const ev = parseFleetEvent(
      'link.telemetry',
      '{"linkId":"link-1","ts":"2026-08-05T09:00:01.000Z","rssiDbm":-62,"snrDb":21,"throughputMbps":184}',
    );
    expect(ev?.type).toBe('link.telemetry');
    expect(ev?.type === 'link.telemetry' && ev.data.throughputMbps).toBe(184);
  });

  it('parses a link.status frame with previous', () => {
    const ev = parseFleetEvent('link.status', '{"linkId":"link-1","status":"degraded","previous":"up"}');
    expect(ev?.type === 'link.status' && ev.data.previous).toBe('up');
  });

  it('parses a fleet.summary frame', () => {
    const ev = parseFleetEvent(
      'fleet.summary',
      '{"total":10,"up":8,"degraded":2,"down":0,"avgThroughputMbps":180,"worstLinkId":null}',
    );
    expect(ev?.type === 'fleet.summary' && ev.data.total).toBe(10);
  });

  it('returns null for an unknown event name', () => {
    expect(parseFleetEvent('link.unknown', '{}')).toBeNull();
  });

  it('returns null for unparseable JSON', () => {
    expect(parseFleetEvent('link.telemetry', 'not json')).toBeNull();
  });
});
