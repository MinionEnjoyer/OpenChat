import { Controller, Post, Body, NotFoundException } from '@nestjs/common';
import { TestWorldService } from './test-world.service';

@Controller('dev')
export class TestWorldController {
  constructor(private readonly testWorldService: TestWorldService) {}

  /**
   * Provision a fresh, isolated test world.
   *
   * DEV ONLY — gated by NODE_ENV + DEV_AUTH (exactly like dev-login).
   * 404 when NODE_ENV=production or DEV_AUTH!=1.
   *
   * @satisfies security-boundary — returns 404 in production, never reachable.
   */
  @Post('test-world')
  async create(@Body('label') label?: string) {
    if (process.env.NODE_ENV === 'production' || process.env.DEV_AUTH !== '1') {
      throw new NotFoundException();
    }
    return this.testWorldService.provision(label);
  }
}
