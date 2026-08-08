import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from '../auth/auth.module';
import { PatreonModule } from './patreon.module';

describe('PatreonModule', () => {
  it('imports the module that provides AuthGuard and TokenService', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, PatreonModule) as unknown[];

    expect(imports).toContain(AuthModule);
  });
});
