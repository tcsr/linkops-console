import { TestBed } from '@angular/core/testing';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('renders the status text and the matching class', () => {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('status', 'degraded');
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.badge') as HTMLElement;
    expect(badge.textContent?.trim()).toBe('degraded');
    expect(badge.classList.contains('degraded')).toBe(true);
    expect(badge.getAttribute('aria-label')).toBe('status: degraded');
  });

  it('reflects a status change', () => {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('status', 'up');
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.badge') as HTMLElement).classList.contains('up')).toBe(true);

    fixture.componentRef.setInput('status', 'down');
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.badge') as HTMLElement;
    expect(badge.classList.contains('down')).toBe(true);
    expect(badge.classList.contains('up')).toBe(false);
  });
});
