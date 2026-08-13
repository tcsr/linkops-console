import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { LINK_NAME_CONSTRAINTS } from '@linkops/domain';

/** Runtime allow-lists mirroring the domain unions (used by @IsIn). */
export const BANDS = ['5GHz', '6GHz', '24GHz', '60GHz'] as const;
export const MODES = ['PtP', 'PtMP'] as const;
export const CHANNEL_WIDTHS = [20, 40, 80, 160] as const;

/** Body for `POST /links`. Validated at the HTTP boundary; not a domain type. */
export class CreateLinkDto {
  @IsString()
  @Length(LINK_NAME_CONSTRAINTS.minLength, LINK_NAME_CONSTRAINTS.maxLength)
  name!: string;

  @IsString()
  @Length(1, 80)
  siteA!: string;

  @IsString()
  @Length(1, 80)
  siteB!: string;

  @IsIn(BANDS)
  band!: (typeof BANDS)[number];

  @IsIn(MODES)
  mode!: (typeof MODES)[number];

  @Type(() => Number)
  @IsIn(CHANNEL_WIDTHS)
  channelWidthMhz!: (typeof CHANNEL_WIDTHS)[number];

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  capacityMbps!: number;

  @Type(() => Number)
  @IsInt()
  @Min(-10)
  @Max(30)
  txPowerDbm!: number;
}
