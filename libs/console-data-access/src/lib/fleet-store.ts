import { HttpErrorResponse } from '@angular/common/http';
import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import type { FleetSummary, LinkId } from '@linkops/domain';
import { FleetApi } from './fleet-api';
import {
  EMPTY_FLEET,
  applyEvents,
  fromSnapshot,
  type FleetLinkView,
  type FleetModel,
} from './fleet-model';
import { FLEET_EVENT_TYPES, parseFleetEvent } from './fleet-event';
import {
  EVENT_SOURCE_FACTORY,
  FRAME_SCHEDULER,
} from './stream-tokens';
import type { ConsoleFleetEvent } from './fleet-event';

/** REST snapshot lifecycle. */
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/** SSE connection lifecycle (live-only; native EventSource reconnect). */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

/**
 * Signal-first fleet store: the single owner of client fleet state.
 *
 * Data flow: `load()` fetches the REST snapshot; `connect()` opens the SSE
 * stream and folds live events into the snapshot. Incoming events are buffered
 * and applied **once per animation frame** (render coalescing) via
 * {@link applyEvents}, so a burst of telemetry produces exactly one signal
 * update rather than one per message per link — the assignment's "no
 * change-detection storm at 1 Hz" concern, handled here rather than in the UI.
 *
 * Zoneless-friendly: EventSource callbacks set signals directly (no NgZone).
 * The EventSource and any pending frame are released on destroy.
 */
@Injectable({ providedIn: 'root' })
export class FleetStore {
  private readonly api = inject(FleetApi);
  private readonly scheduler = inject(FRAME_SCHEDULER);
  private readonly openEventSource = inject(EVENT_SOURCE_FACTORY);
  private readonly destroyRef = inject(DestroyRef);

  private readonly model = signal<FleetModel>(EMPTY_FLEET);
  private readonly loadState = signal<LoadState>('idle');
  private readonly connectionState = signal<ConnectionState>('idle');
  private readonly errorMessage = signal<string | null>(null);

  /** Fleet rows for the list (stable per-row identity until a row changes). */
  readonly rows = computed<readonly FleetLinkView[]>(() => [
    ...this.model().rows.values(),
  ]);
  /** KPI block, or null before the first snapshot. */
  readonly summary = computed<FleetSummary | null>(() => this.model().summary);
  readonly status = this.loadState.asReadonly();
  readonly connection = this.connectionState.asReadonly();
  readonly error = this.errorMessage.asReadonly();
  /** True once loaded successfully but the fleet is empty. */
  readonly isEmpty = computed(
    () => this.loadState() === 'ready' && this.model().rows.size === 0,
  );

  private source: EventSource | undefined;
  private buffer: ConsoleFleetEvent[] = [];
  private frame: number | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.disconnect();
    });
  }

  /** Fetch the REST snapshot (`/links` + `/fleet/summary`). */
  load(): void {
    this.loadState.set('loading');
    this.errorMessage.set(null);
    forkJoin({ links: this.api.links(), summary: this.api.summary() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ links, summary }) => {
          this.model.set(fromSnapshot(links, summary));
          this.loadState.set('ready');
        },
        error: (err: unknown) => {
          this.errorMessage.set(describeError(err));
          this.loadState.set('error');
        },
      });
  }

  /** Open the SSE stream and start folding live events. Idempotent. */
  connect(): void {
    if (this.source !== undefined) {
      return;
    }
    this.connectionState.set('connecting');
    const source = this.openEventSource('/api/stream');
    this.source = source;

    source.addEventListener('open', () => {
      this.connectionState.set('open');
    });
    for (const type of FLEET_EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        this.onFrame(type, (event as MessageEvent).data as string);
      });
    }
    // Native EventSource reconnects on its own (live-only, no replay). We only
    // reflect the transient state; a successful reconnect re-fires 'open'.
    source.onerror = () => {
      this.connectionState.set('reconnecting');
    };
  }

  /**
   * Remove a single link from the fleet model (M7 delete). The M4 stream carries
   * no per-link delete event, so a client that deletes a link prunes the row
   * locally instead of refetching the whole snapshot. Other rows and the KPI
   * summary are left untouched; a no-op when the id is unknown so a redundant
   * call cannot corrupt state. Late SSE events for the removed id fold to a
   * no-op — {@link applyEvents} ignores events for rows absent from the model.
   */
  removeLink(id: string): void {
    // Row keys are branded LinkIds; the id here comes from an already-loaded row.
    const key = id as LinkId;
    this.model.update((current) => {
      if (!current.rows.has(key)) {
        return current; // unknown id: no change, keep the same reference
      }
      const rows = new Map(current.rows);
      rows.delete(key);
      return { rows, summary: current.summary };
    });
  }

  /** Close the stream and drop any pending frame/buffer. */
  disconnect(): void {
    if (this.frame !== null) {
      this.scheduler.cancel(this.frame);
      this.frame = null;
    }
    this.buffer = [];
    this.source?.close();
    this.source = undefined;
    this.connectionState.set('closed');
  }

  private onFrame(type: string, data: string): void {
    const event = parseFleetEvent(type, data);
    if (event === null) {
      return;
    }
    this.buffer.push(event);
    if (this.frame === null) {
      this.frame = this.scheduler.schedule(() => {
        this.flush();
      });
    }
  }

  private flush(): void {
    this.frame = null;
    const batch = this.buffer;
    this.buffer = [];
    this.model.update((current) => applyEvents(current, batch));
  }
}

function describeError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    return err.status === 0
      ? 'Could not reach the API.'
      : `Request failed (${String(err.status)}).`;
  }
  return 'Unexpected error loading the fleet.';
}
