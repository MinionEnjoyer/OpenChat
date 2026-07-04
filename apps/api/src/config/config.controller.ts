import { Controller, Get } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { UseGuards } from '@nestjs/common';

@Controller('config')
@UseGuards(SessionGuard)
export class ConfigController {
  @Get()
  getConfig() {
    return {
      shareBaseUrl: process.env.SHARE_BASE_URL,
      jellyfinUrl: process.env.JELLYFIN_URL,
    };
  }
}
