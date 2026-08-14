import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { FleetSummary } from '@linkops/domain';
import type { FleetLinkView } from './fleet-model';
import type {
  CreateLinkPayload,
  TelemetryWindow,
  UpdateLinkPayload,
} from './link-detail-model';

/**
 * Thin typed REST client for the console. It consumes the existing M3 endpoints
 * and adds no business logic — status is already derived server-side, and
 * validation is enforced server-side. Live updates arrive separately over SSE
 * (see {@link FleetStore}). Components never call `HttpClient` directly; they go
 * through this client (or a store that wraps it).
 */
@Injectable({ providedIn: 'root' })
export class FleetApi {
  private readonly http = inject(HttpClient);

  /** `GET /api/links` — every link with its derived status and latest sample. */
  links(): Observable<FleetLinkView[]> {
    return this.http.get<FleetLinkView[]>('/api/links');
  }

  /** `GET /api/fleet/summary` — the KPI block. */
  summary(): Observable<FleetSummary> {
    return this.http.get<FleetSummary>('/api/fleet/summary');
  }

  /** `GET /api/links/:id` — one link with its derived status and latest sample. */
  linkById(id: string): Observable<FleetLinkView> {
    return this.http.get<FleetLinkView>(`/api/links/${encodeURIComponent(id)}`);
  }

  /**
   * `GET /api/links/:id/telemetry` — recent samples for the chart. `windowMs` is
   * optional; the server clamps and defaults it.
   */
  telemetry(id: string, windowMs?: number): Observable<TelemetryWindow> {
    const params =
      windowMs === undefined
        ? undefined
        : new HttpParams().set('windowMs', String(windowMs));
    return this.http.get<TelemetryWindow>(
      `/api/links/${encodeURIComponent(id)}/telemetry`,
      params === undefined ? {} : { params },
    );
  }

  /** `POST /api/links` — create a link; returns the created view (201). */
  create(payload: CreateLinkPayload): Observable<FleetLinkView> {
    return this.http.post<FleetLinkView>('/api/links', payload);
  }

  /**
   * `PATCH /api/links/:id` — update a link. `expectedVersion` drives optimistic
   * concurrency; a mismatch yields 409 (M7 owns the resolution UX).
   */
  update(id: string, payload: UpdateLinkPayload): Observable<FleetLinkView> {
    return this.http.patch<FleetLinkView>(
      `/api/links/${encodeURIComponent(id)}`,
      payload,
    );
  }

  /**
   * `DELETE /api/links/:id` — remove a link. The server responds 204 (no body),
   * so the stream completes with `void`; a 404 (unknown link) surfaces as an
   * error for the caller to interpret (M7 treats it as "already gone").
   */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/links/${encodeURIComponent(id)}`);
  }
}
