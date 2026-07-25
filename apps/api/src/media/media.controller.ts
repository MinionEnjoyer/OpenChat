import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ShareService } from '../share/share.service';
import type { Request, Response } from 'express';

/**
 * P5-02 — FR-MED-003: Authenticated media proxy.
 *
 * Proxies OpenShare's /raw/{id} and /thumb/{id} through OpenChat's auth,
 * adding Range support and cache headers. Unauthenticated → 401.
 */
@Controller('media')
@UseGuards(AuthGuard)
export class MediaController {
  constructor(private readonly share: ShareService) {}

  @Get(':assetId/raw')
  async proxyRaw(
    @Param('assetId') assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const range = req.headers.range as string | undefined;
    const { stream, headers, status } = await this.share.proxyRaw(assetId, range);

    res.status(status);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    stream.pipe(res);
  }

  @Get(':assetId/thumb')
  async proxyThumb(
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const { stream, headers, status } = await this.share.proxyThumb(assetId);

    res.status(status);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    stream.pipe(res);
  }
}
