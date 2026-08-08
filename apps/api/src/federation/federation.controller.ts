import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { FederationService } from './federation.service';

@Controller('federation/v1')
export class FederationController {
  constructor(private readonly federation: FederationService) {}

  @Get('status')
  status() {
    return this.federation.status();
  }

  @Post('events')
  receive(
    @Body() body: unknown,
    @Headers('x-openchat-node') nodeId?: string,
    @Headers('x-openchat-timestamp') timestamp?: string,
    @Headers('x-openchat-signature') signature?: string,
  ) {
    return this.federation.receive(body, { nodeId, timestamp, signature });
  }
}
