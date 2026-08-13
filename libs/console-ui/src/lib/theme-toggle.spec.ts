import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  let doc: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    doc = TestBed.inject(DOCUMENT);
    doc.documentElement.removeAttribute('data-theme');
    try {
      doc.defaultView?.localStorage?.clear();
    } catch {
      /* ignore */
    }
  });

  it('defaults to light and applies data-theme to the document root', () => {
    const fixture = TestBed.createComponent(ThemeToggle);
    fixture.detectChanges();
    expect(doc.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggles to dark on click and persists it', () => {
    const fixture = TestBed.createComponent(ThemeToggle);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.toggle') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(doc.defaultView?.localStorage?.getItem('linkops-theme')).toBe('dark');
  });
});
