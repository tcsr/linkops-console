import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, forkJoin } from 'rxjs';
import type { LinkStatus, TelemetrySample } from '@linkops/domain';
import { FleetApi } from './fleet-api';
import { FleetStore } from './fleet-store';
import type { FleetLinkView } from './fleet-model';
import { parseApiError } from './link-detail-model';

/** Detail snapshot lifecycle. `not-found` is the 404 (unknown link) case. */
export type DetailState = 'idle' | 'loading' | 'ready' | 'error' | 'not-found';

/**
 * Most recent samples kept for the detail sparkline. At 1 Hz this is one minute
 * of history — enough to read the trend without an unbounded, ever-growing
 * series (the same "no unbounded growth" discipline as the server ring buffer).
 */
export const SPARKLINE_MAX_POINTS = 60;

/**
 * Signal-first store for the link **detail** view (M6). It owns the per-link
 * REST snapshot (`GET /links/:id`) and telemetry history
 * (`GET /links/:id/telemetry`), and folds **live** telemetry/status by reading
 * the already-coalesced {@link FleetStore} rather than opening a second
 * `EventSource` or scheduler — the fleet store remains the single owner of the
 * SSE stream and the rAF coalescing. Mutations (create/edit) are exposed as
 * promises the form container drives.
 *
 * Zoneless-friendly: all updates are signal writes; the live bridge is a single
 * `effect` keyed on the current link id.
 */
@Injectable({ providedIn: 'root' })
export class LinkDetailStore {
  private readonly api = inject(FleetApi);
  private readonly fleet = inject(FleetStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly id = signal<string | null>(null);
  private readonly snapshot = signal<FleetLinkView | null>(null);
  private readonly detailState = signal<DetailState>('idle');
  private readonly history = signal<readonly TelemetrySample[]>([]);
  private readonly errorMessage = signal<string | null>(null);
  private readonly deletingState = signal(false);
  private readonly deleteErrorMessage = signal<string | null>(null);

  /** Current link id under view, or null before the first load. */
  readonly linkId = this.id.asReadonly();
  /** Immutable link configuration from the REST snapshot. */
  readonly link = this.snapshot.asReadonly();
  readonly state = this.detailState.asReadonly();
  readonly error = this.errorMessage.asReadonly();
  /** True while a delete request is in flight. */
  readonly deleting = this.deletingState.asReadonly();
  /** Readable message when a delete fails (null when there is no error). */
  readonly deleteError = this.deleteErrorMessage.asReadonly();
  /** Live SSE connection state, delegated from the shared fleet stream. */
  readonly connection = this.fleet.connection;

  /** Live row for this link from the fleet stream, if the fleet is loaded. */
  private readonly liveRow = computed<FleetLinkView | null>(() => {
    const id = this.id();
    if (id === null) {
      return null;
    }
    return this.fleet.rows().find((r) => r.id === id) ?? null;
  });

  /** Status: live value when the stream has it, else the REST snapshot. */
  readonly status = computed<LinkStatus | null>(
    () => this.liveRow()?.status ?? this.snapshot()?.status ?? null,
  );

  /**
   * Latest telemetry sample: the newest point in the series (history seed +
   * live appends) when present, else the live row's or the snapshot's sample.
   */
  readonly latestSample = computed<TelemetrySample | null>(() => {
    const series = this.history();
    if (series.length > 0) {
      return series[series.length - 1];
    }
    return this.liveRow()?.latestSample ?? this.snapshot()?.latestSample ?? null;
  });

  /** Bounded, ascending sample series for the sparkline (history + live). */
  readonly series = this.history.asReadonly();

  constructor() {
    // Live bridge: when the fleet stream flushes a newer sample for this link,
    // append it to the bounded series. Reads only fleet signals in the tracked
    // scope; the write to `history` is untracked to avoid a feedback loop.
    effect(() => {
      const sample = this.liveRow()?.latestSample ?? null;
      if (sample === null) {
        return;
      }
      untracked(() => {
        const current = this.history();
        const last = current[current.length - 1];
        if (last !== undefined && last.ts === sample.ts) {
          return; // already have this tick
        }
        this.history.set(
          [...current, sample].slice(-SPARKLINE_MAX_POINTS),
        );
      });
    });
  }

  /**
   * Load the detail snapshot + telemetry history for `id`, and make sure the
   * live fleet stream is running so subsequent ticks fold in. Idempotent w.r.t.
   * the shared stream: the fleet snapshot is only fetched if not already loaded,
   * and `connect()` is itself guarded.
   */
  load(id: string): void {
    this.id.set(id);
    this.snapshot.set(null);
    this.history.set([]);
    this.errorMessage.set(null);
    this.detailState.set('loading');

    // Power live updates from the single SSE owner without a second stream.
    if (this.fleet.status() === 'idle') {
      this.fleet.load();
    }
    this.fleet.connect();

    forkJoin({
      link: this.api.linkById(id),
      telemetry: this.api.telemetry(id),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ link, telemetry }) => {
          // Guard against a stale response if the route changed mid-flight.
          if (this.id() !== id) {
            return;
          }
          this.snapshot.set(link);
          this.history.set(telemetry.samples.slice(-SPARKLINE_MAX_POINTS));
          this.detailState.set('ready');
        },
        error: (err: unknown) => {
          if (this.id() !== id) {
            return;
          }
          const parsed = parseApiError(err);
          this.errorMessage.set(parsed.message);
          this.detailState.set(
            parsed.status === 404 ? 'not-found' : 'error',
          );
        },
      });
  }

  /**
   * Delete the current link (M7). Confirmation and navigation are the view's
   * responsibility; this store owns only the transport and its state.
   *
   * On a successful 204 the row is pruned from the shared {@link FleetStore}
   * (the M4 stream carries no delete event, so a refetch is unnecessary). A 404
   * is treated as success — the link is already gone, which is the intended end
   * state. Any other failure (network, 5xx, unexpected) sets a readable
   * {@link deleteError} and rejects, so the view can keep the user on the page
   * to retry rather than navigating away on a silent failure.
   */
  async deleteLink(): Promise<void> {
    const id = this.id();
    if (id === null || this.deletingState()) {
      return; // nothing loaded, or a delete is already in flight
    }
    this.deletingState.set(true);
    this.deleteErrorMessage.set(null);
    try {
      await firstValueFrom(this.api.delete(id));
      this.fleet.removeLink(id);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      if (parsed.status === 404) {
        this.fleet.removeLink(id); // already gone — treat as success
        return;
      }
      this.deleteErrorMessage.set(parsed.message);
      throw err;
    } finally {
      this.deletingState.set(false);
    }
  }
}
