import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { FleetSummary } from '@linkops/domain';
import type { FleetLinkView } from './fleet-model';

/**
 * Thin typed REST client for the initial fleet snapshot. It consumes the
 * existing M3 endpoints and adds no business logic — status is already derived
 * server-side. Live updates arrive separately over SSE (see {@link FleetStore}).
 */
@Injectable({ providedIn: 'root' })
export class FleetApi {
  private readonly http = inject(HttpClient);

  /** `GET /links` — every link with its derived status and latest sample. */
  links(): Observable<FleetLinkView[]> {
    return this.http.get<FleetLinkView[]>('/links');
  }

  /** `GET /fleet/summary` — the KPI block. */
  summary(): Observable<FleetSummary> {
    return this.http.get<FleetSummary>('/fleet/summary');
  }
}
