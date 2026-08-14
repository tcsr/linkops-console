import { TestBed } from '@angular/core/testing';
import { Sparkline } from './sparkline';

describe('Sparkline', () => {
  function render(values: number[], max: number) {
    const fixture = TestBed.createComponent(Sparkline);
    fixture.componentRef.setInput('values', values);
    fixture.componentRef.setInput('max', max);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws a polyline and a head marker for two or more samples', () => {
    const el = render([10, 20, 30], 100);
    expect(el.querySelector('polyline.line')).not.toBeNull();
    expect(el.querySelector('polygon.area')).not.toBeNull();
    expect(el.querySelector('circle.head')).not.toBeNull();
    expect(el.querySelector('line.baseline')).toBeNull();
  });

  it('renders a flat baseline when there is not enough data', () => {
    const el = render([42], 100);
    expect(el.querySelector('polyline.line')).toBeNull();
    expect(el.querySelector('line.baseline')).not.toBeNull();
  });

  it('normalizes higher values to a higher point (lower y) on the line', () => {
    const el = render([0, 100], 100);
    const pts = el.querySelector('polyline.line')?.getAttribute('points') ?? '';
    const [p0, p1] = pts.split(' ').map((p) => Number(p.split(',')[1]));
    // y grows downward, so the 100 sample must sit above (smaller y) the 0 sample.
    expect(p1).toBeLessThan(p0);
  });

  it('exposes an accessible label describing the latest sample', () => {
    const el = render([5, 9.5], 100);
    const label = el.querySelector('svg')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('2 samples');
    expect(label).toContain('9.5');
  });
});
