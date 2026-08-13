import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeToggle } from '@linkops/console-ui';

/** Root shell: a sticky app bar over the routed content. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ThemeToggle],
  template: `
    <header class="appbar">
      <a class="brand" href="/" aria-label="LinkOps Console — home">
        <span class="mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="5.5" cy="12" r="2.4" />
            <circle cx="18.5" cy="12" r="2.4" />
            <path d="M8 12h8" />
          </svg>
        </span>
        <span class="word">Link<b>Ops</b></span>
        <span class="tag">Console</span>
      </a>
      <div class="spacer"></div>
      <lo-theme-toggle />
    </header>

    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    .appbar {
      position: sticky; top: 0; z-index: 20;
      display: flex; align-items: center; gap: 0.75rem;
      height: 3.5rem; padding: 0 1.25rem;
      background: color-mix(in srgb, var(--panel) 82%, transparent);
      backdrop-filter: saturate(140%) blur(12px);
      border-bottom: 1px solid var(--border);
    }
    .brand { display: inline-flex; align-items: center; gap: 0.55rem; text-decoration: none; color: var(--text); }
    .mark {
      display: inline-flex; align-items: center; justify-content: center;
      width: 1.9rem; height: 1.9rem; border-radius: 9px;
      background: linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 70%, #ff9a3d));
      box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--brand) 60%, transparent);
    }
    .mark svg { width: 1.15rem; height: 1.15rem; fill: #fff; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; }
    .word { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; }
    .word b { font-weight: 800; color: var(--brand); }
    .tag {
      font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--muted); padding: 0.15rem 0.4rem; border: 1px solid var(--border); border-radius: 5px;
      margin-left: 0.25rem;
    }
    .spacer { flex: 1; }
    main { display: block; }
  `,
})
export class App {}
