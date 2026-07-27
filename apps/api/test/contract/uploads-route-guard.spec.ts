/**
 * Duplicate-route guard: asserts exactly one controller owns POST /api/uploads.
 *
 * Boots the API as a subprocess and parses NestJS RoutesResolver output to
 * count UploadsController registrations. Two registrations = the defect.
 * One registration = the fix.
 *
 * PERTURB-AND-RESTORE workflow:
 *   1. Run this test → should pass (exactly 1 UploadsController).
 *   2. Re-register the duplicate controller → test fails.
 *   3. Restore the fix → test passes again.
 */
import { execSync } from 'child_process';
import * as path from 'path';

const API_DIR = path.resolve(__dirname, '..', '..'); // apps/api

function countUploadsControllers(): number {
  let stdout = '';
  try {
    stdout = execSync('API_PORT=3097 node dist/main', {
      cwd: API_DIR,
      timeout: 10_000,
      encoding: 'utf-8',
      env: { ...process.env, API_PORT: '3097', NODE_ENV: 'development' },
    });
  } catch (e: any) {
    // API was killed by timeout (exit 143), which is expected.
    // stdout is on the error object's stdout property.
    stdout = e.stdout ?? '';
  }
  const matches = stdout.match(/RoutesResolver.*UploadsController\s*\{/g);
  return matches ? matches.length : 0;
}

describe('Duplicate-route guard — POST /api/uploads', () => {
  it(
    'has exactly one UploadsController registered',
    () => {
      const count = countUploadsControllers();
      expect(count).toBe(1);
    },
    15_000,
  );
});
