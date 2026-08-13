import { TestBed } from '@angular/core/testing';
import type { FleetSummary } from '@linkops/domain';
import { KpiHeader } from './kpi-header';

const summary: FleetSummary = {
  total: 10,
  up: 8,
  degraded: 2,
  down: 0,
  avgThroughputMbps: 180,
  worstLinkId: null,
};

describe('KpiHeader', () => {
  it('renders KPI tiles from the summary', () => {
    const fixture = TestBed.createComponent(KpiHeader);
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Total');
    expect(text).toContain('10');
    expect(text).toContain('Degraded');
    expect(text).toContain('180');
  });

  it('shows a loading state when no summary is present', () => {
    const fixture = TestBed.createComponent(KpiHeader);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading');
  });
});
