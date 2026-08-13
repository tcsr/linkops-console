import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LinksService } from './links.service.js';
import { CreateLinkDto } from './dto/create-link.dto.js';
import { UpdateLinkDto } from './dto/update-link.dto.js';
import { ListLinksQueryDto } from './dto/list-links-query.dto.js';
import { TelemetryQueryDto } from './dto/telemetry-query.dto.js';
import type { LinkView, TelemetryWindowView } from './link-view.js';

/**
 * REST endpoints for links. Thin controller: parses/validates the HTTP boundary
 * and delegates to {@link LinksService}. It never touches the repository or its
 * storage internals directly.
 */
@Controller('links')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Get()
  list(@Query() query: ListLinksQueryDto): Promise<LinkView[]> {
    return this.links.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<LinkView> {
    return this.links.getById(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateLinkDto): Promise<LinkView> {
    return this.links.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLinkDto,
  ): Promise<LinkView> {
    return this.links.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.links.remove(id);
  }

  @Get(':id/telemetry')
  telemetry(
    @Param('id') id: string,
    @Query() query: TelemetryQueryDto,
  ): Promise<TelemetryWindowView> {
    return this.links.telemetry(id, query.windowMs);
  }
}
