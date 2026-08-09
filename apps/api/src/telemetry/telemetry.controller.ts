import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryHeartbeatSchema } from './telemetry.types';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post('heartbeat')
  @HttpCode(HttpStatus.ACCEPTED)
  async heartbeat(@Body() body: unknown) {
    const parsed = TelemetryHeartbeatSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid deployment heartbeat');
    await this.telemetry.record(parsed.data);
    return { accepted: true };
  }

  @Get('summary')
  summary(@Headers('x-telemetry-admin-token') token = '') {
    return this.telemetry.summary(token);
  }
}
