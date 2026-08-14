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
      height: 3.75rem; padding: 0 1.5rem;
      background: color-mix(in srgb, var(--panel) 70%, transparent);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
      transition: background 0.3s ease, border-color 0.3s ease;
    }
    .brand {
      display: inline-flex; align-items: center; gap: 0.6rem;
      text-decoration: none; color: var(--text);
      transition: opacity 0.2s ease;
    }
    .brand:hover {
      opacity: 0.95;
    }
    .brand:hover .mark {
      transform: scale(1.05) rotate(2deg);
      box-shadow: var(--glow-accent);
    }
    .brand:hover .tag {
      border-color: var(--accent);
      color: var(--text);
    }
    .mark {
      display: inline-flex; align-items: center; justify-content: center;
      width: 2rem; height: 2rem; border-radius: 9px;
      background: linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 70%, #ff9a3d));
      box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--brand) 60%, transparent);
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;
    }
    .mark svg { width: 1.2rem; height: 1.2rem; fill: #fff; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; }
    .word { font-size: 1.1rem; font-weight: 700; letter-spacing: -0.02em; }
    .word b { font-weight: 800; color: var(--brand); }
    .tag {
      font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--muted); padding: 0.18rem 0.45rem; border: 1px solid var(--border); border-radius: 5px;
      margin-left: 0.25rem;
      transition: border-color 0.2s ease, color 0.2s ease;
    }
    .spacer { flex: 1; }
    main { display: block; }
  `,
})
export class App {}
