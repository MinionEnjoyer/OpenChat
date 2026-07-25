import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';

@Controller('config')
@UseGuards(AuthGuard)
export class ConfigController {
  @Get()
  getConfig() {
    return {
      shareBaseUrl: process.env.SHARE_BASE_URL,
      jellyfinUrl: process.env.JELLYFIN_URL,
    };
  }
}
