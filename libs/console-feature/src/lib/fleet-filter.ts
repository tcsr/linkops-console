import type { Band, LinkStatus } from '@linkops/domain';
import type { FleetLinkView } from '@linkops/console-data-access';
import type { FleetRow } from '@linkops/console-ui';

/** Sortable columns. */
export type SortField = 'name' | 'status' | 'throughput' | 'capacity';
export type SortOrder = 'asc' | 'desc';

/** Filter + sort state — the shape mirrored into the URL query string. */
export interface FleetFilter {
  readonly status: LinkStatus | 'all';
  readonly band: Band | 'all';
  readonly q: string;
  readonly sort: SortField;
  readonly order: SortOrder;
}

export const DEFAULT_FILTER: FleetFilter = {
  status: 'all',
  band: 'all',
  q: '',
  sort: 'name',
  order: 'asc',
};

const STATUSES: readonly LinkStatus[] = ['up', 'degraded', 'down'];
const BANDS: readonly Band[] = ['5GHz', '5.8GHz', '11GHz', '24GHz'];
const SORTS: readonly SortField[] = ['name', 'status', 'throughput', 'capacity'];
/** Healthy-first ranking; `desc` therefore lists the worst links first. */
const STATUS_RANK: Record<LinkStatus, number> = { up: 0, degraded: 1, down: 2 };

/** Parse raw (URL) params into a validated filter, falling back to defaults. */
export function parseFilter(params: {
  status?: string | null;
  band?: string | null;
  q?: string | null;
  sort?: string | null;
  order?: string | null;
}): FleetFilter {
  return {
    status: STATUSES.includes(params.status as LinkStatus)
      ? (params.status as LinkStatus)
      : 'all',
    band: BANDS.includes(params.band as Band) ? (params.band as Band) : 'all',
    q: params.q?.trim() ?? '',
    sort: SORTS.includes(params.sort as SortField)
      ? (params.sort as SortField)
      : 'name',
    order: params.order === 'desc' ? 'desc' : 'asc',
  };
}

/**
 * Filter + sort the live fleet rows and map them to the presentational
 * view-model. Applied client-side over the live signal state (D6), so live
 * updates re-filter/re-sort without a server round-trip.
 */
export function selectRows(
  rows: readonly FleetLinkView[],
  filter: FleetFilter,
): FleetRow[] {
  const needle = filter.q.toLowerCase();
  const result = rows
    .filter((row) => {
      if (filter.status !== 'all' && row.status !== filter.status) {
        return false;
      }
      if (filter.band !== 'all' && row.band !== filter.band) {
        return false;
      }
      if (needle.length > 0) {
        const haystack =
          `${row.name} ${row.siteA} ${row.siteB}`.toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    })
    .map(toRow);

  const dir = filter.order === 'desc' ? -1 : 1;
  result.sort((a, b) => compare(a, b, filter.sort) * dir);
  return result;
}

function toRow(view: FleetLinkView): FleetRow {
  return {
    id: view.id,
    name: view.name,
    siteA: view.siteA,
    siteB: view.siteB,
    band: view.band,
    status: view.status,
    capacityMbps: view.capacityMbps,
    throughputMbps: view.latestSample?.throughputMbps ?? null,
  };
}

function compare(a: FleetRow, b: FleetRow, field: SortField): number {
  switch (field) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'status':
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    case 'throughput':
      return (a.throughputMbps ?? -1) - (b.throughputMbps ?? -1);
    case 'capacity':
      return a.capacityMbps - b.capacityMbps;
  }
}
