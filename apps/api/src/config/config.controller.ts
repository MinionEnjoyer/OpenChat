import { Controller, Get } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { UseGuards } from '@nestjs/common';

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
