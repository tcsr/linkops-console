import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 5 minutes — matches the 300-sample ring buffer at 1 Hz. */
export const DEFAULT_TELEMETRY_WINDOW_MS = 300_000;

/** Query for `GET /links/:id/telemetry`. */
export class TelemetryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DEFAULT_TELEMETRY_WINDOW_MS)
  windowMs?: number;
}
