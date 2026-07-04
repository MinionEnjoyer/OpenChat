import { Controller, Get, Injectable, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionGuard } from '../auth/session.guard';
import { AuthModule } from '../auth/auth.module';

export interface Gif {
  id: string;
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

@Injectable()
export class GifsService {
  constructor(private readonly config: ConfigService) {}

  async search(q: string): Promise<Gif[]> {
    const key = this.config.get<string>('GIPHY_API_KEY');
    if (!key) throw new BadRequestException('GIF search is not configured');
    const base = 'https://api.giphy.com/v1/gifs';
    const params = `api_key=${key}&limit=24&rating=pg-13&bundle=fixed_height`;
    const url = q.trim()
      ? `${base}/search?${params}&q=${encodeURIComponent(q.trim())}`
      : `${base}/trending?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new BadRequestException(`GIF search failed (${res.status})`);
    const data: any = await res.json();
    return (data.data ?? [])
      .map((g: any) => ({
        id: g.id,
        url: g.images?.fixed_height?.url,
        previewUrl: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url,
        width: Number(g.images?.fixed_height?.width) || null,
        height: Number(g.images?.fixed_height?.height) || null,
      }))
      .filter((g: Gif) => !!g.url);
  }
}

@Controller('gifs')
@UseGuards(SessionGuard)
export class GifsController {
  constructor(private readonly gifs: GifsService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.gifs.search(q ?? '');
  }
}

@Module({
  imports: [AuthModule],
  controllers: [GifsController],
  providers: [GifsService],
})
export class GifsModule {}
