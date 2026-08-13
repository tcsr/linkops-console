import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'linkops-theme';

/**
 * Light/dark theme switch. Writes `data-theme` onto the document root (which the
 * global token blocks key off) and persists the choice. Defaults to **light**
 * to match the RADWIN brand.
 */
@Component({
  selector: 'lo-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="toggle"
      (click)="toggle()"
      [attr.aria-label]="'Switch to ' + (theme() === 'light' ? 'dark' : 'light') + ' theme'"
      [attr.aria-pressed]="theme() === 'dark'"
    >
      @if (theme() === 'light') {
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 109 9 7 7 0 01-9-9z" /></svg>
      } @else {
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5v2m0 16v2m10-10h-2M4 12H2m15.07-7.07l-1.4 1.4M6.34 17.66l-1.42 1.42m12.72 0l-1.42-1.42M6.34 6.34L4.92 4.92" /></svg>
      }
    </button>
  `,
  styles: `
    .toggle {
      display: inline-flex; align-items: center; justify-content: center;
      width: 2.25rem; height: 2.25rem;
      border-radius: 999px; cursor: pointer;
      color: var(--muted, #64707e);
      background: var(--panel, #fff);
      border: 1px solid var(--border, #e4e8ee);
      transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .toggle:hover { color: var(--accent, #1399ae); border-color: color-mix(in srgb, var(--accent, #1399ae) 40%, transparent); }
    .toggle:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-dim, rgba(19, 153, 174, 0.13)); }
    svg { width: 1.15rem; height: 1.15rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    svg path[d^='M12 3a9'] { fill: currentColor; stroke: none; }
  `,
})
export class ThemeToggle {
  private readonly doc = inject(DOCUMENT);
  protected readonly theme = signal<Theme>(this.initialTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      this.doc.documentElement.setAttribute('data-theme', theme);
      try {
        this.doc.defaultView?.localStorage?.setItem(STORAGE_KEY, theme);
      } catch {
        /* storage unavailable — non-fatal */
      }
    });
  }

  protected toggle(): void {
    this.theme.update((t) => (t === 'light' ? 'dark' : 'light'));
  }

  private initialTheme(): Theme {
    try {
      const stored = this.doc.defaultView?.localStorage?.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      /* ignore */
    }
    return 'light';
  }
}
