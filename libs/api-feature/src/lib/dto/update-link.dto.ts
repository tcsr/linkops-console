import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
// IsInt is retained for expectedVersion (an integer); numeric link fields use IsNumber.
import { LINK_NAME_CONSTRAINTS } from '@linkops/domain';
import { BANDS, CHANNEL_WIDTHS, MODES } from './create-link.dto.js';

/**
 * Body for `PATCH /links/:id`. All editable fields are optional (partial patch);
 * `expectedVersion` is required and drives optimistic concurrency (a mismatch
 * yields 409 VERSION_CONFLICT).
 */
export class UpdateLinkDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @Length(LINK_NAME_CONSTRAINTS.minLength, LINK_NAME_CONSTRAINTS.maxLength)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  siteA?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  siteB?: string;

  @IsOptional()
  @IsIn(BANDS)
  band?: (typeof BANDS)[number];

  @IsOptional()
  @IsIn(MODES)
  mode?: (typeof MODES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsIn(CHANNEL_WIDTHS)
  channelWidthMhz?: (typeof CHANNEL_WIDTHS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(1000)
  capacityMbps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-10)
  @Max(30)
  txPowerDbm?: number;
}
