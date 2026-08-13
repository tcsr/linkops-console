import { IsIn, IsOptional, IsString } from 'class-validator';
import { BANDS, MODES } from './create-link.dto.js';

export const LINK_STATUSES = ['up', 'degraded', 'down'] as const;
export const SORT_FIELDS = [
  'name',
  'capacityMbps',
  'status',
  'createdAt',
  'updatedAt',
] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;

/**
 * Query for `GET /links`. Filtering (`band`/`mode`/`search`) maps to the
 * repository's domain-level `LinkListQuery`; `status` (derived) and sorting are
 * applied in the feature layer. HTTP query concerns stay out of the domain.
 */
export class ListLinksQueryDto {
  @IsOptional()
  @IsIn(BANDS)
  band?: (typeof BANDS)[number];

  @IsOptional()
  @IsIn(MODES)
  mode?: (typeof MODES)[number];

  @IsOptional()
  @IsIn(LINK_STATUSES)
  status?: (typeof LINK_STATUSES)[number];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sort?: (typeof SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: (typeof SORT_ORDERS)[number];
}
