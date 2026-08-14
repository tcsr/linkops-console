import { TestBed } from '@angular/core/testing';
import type { FleetRow } from './fleet-row';
import { FleetTable } from './fleet-table';

function row(id: string, name: string): FleetRow {
  return {
    id,
    name,
    siteA: 'A',
    siteB: 'B',
    band: '5GHz',
    status: 'up',
    capacityMbps: 100,
    throughputMbps: 42,
  };
}

describe('FleetTable', () => {
  it('emits rowSelect with the link id when a name is activated', () => {
    const fixture = TestBed.createComponent(FleetTable);
    fixture.componentRef.setInput('rows', [row('link-1', 'Alpha'), row('link-2', 'Beta')]);
    let selected: string | undefined;
    fixture.componentInstance.rowSelect.subscribe((id: string) => (selected = id));
    fixture.detectChanges();

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.name-btn',
    );
    expect(buttons).toHaveLength(2);
    buttons[1].click();
    expect(selected).toBe('link-2');
  });
});
