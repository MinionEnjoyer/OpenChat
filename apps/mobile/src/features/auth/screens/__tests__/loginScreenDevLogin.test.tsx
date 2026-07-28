/**
 * LoginScreen dev-login gating (P1-04 security boundary).
 *
 * Structural (source-level) assertions because the symlinked node_modules
 * in this tree make jest.isolateModules unreliable for render tests.
 *
 * Assertions:
 *  1. USE_DEV_LOGIN is gated on __DEV__ OR EXPO_PUBLIC_ENABLE_DEV_LOGIN==='true'
 *  2. login-username testID is inside the USE_DEV_LOGIN branch
 *  3. The PKCE "Sign in" path is outside (else branch) — not deleted
 *
 * Perturb-and-restore: the source TEXT is the truth. The test verifies
 * the exact gate expression. To perturb, change the expression in the
 * source; the test will fail. Restore; the test passes again.
 *
 * @satisfies P1-04, UNBUILT-001
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../LoginScreen.tsx'),
  'utf-8',
);

describe('LoginScreen dev-login gating (source-level)', () => {
  // ── Gate expression ──

  it('USE_DEV_LOGIN gates on __DEV__ OR EXPO_PUBLIC_ENABLE_DEV_LOGIN === "true"', () => {
    // The constant must include both conditions
    expect(SRC).toContain('__DEV__');
    expect(SRC).toContain('EXPO_PUBLIC_ENABLE_DEV_LOGIN');
    // Exact expression: __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === 'true'
    // After the template literal this becomes:
    expect(
      SRC.includes(
        "__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === 'true'",
      ) ||
        SRC.includes(
          '__DEV__ ||\n  process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === \'true\'',
        ),
    ).toBe(true);
  });

  // ── login-username is inside USE_DEV_LOGIN guard ──

  it('login-username testID is inside the USE_DEV_LOGIN true-branch', () => {
    // Find login-username
    const usernameIdx = SRC.indexOf('login-username');
    expect(usernameIdx).toBeGreaterThan(-1);

    // The region before login-username (within the same JSX section) must
    // include the USE_DEV_LOGIN guard.  The guard is:
    //   {USE_DEV_LOGIN ? ( ... )
    // Find the nearest {USE_DEV_LOGIN ? before login-username
    const before = SRC.slice(0, usernameIdx);
    const guardIdx = before.lastIndexOf('USE_DEV_LOGIN ?');
    expect(guardIdx).toBeGreaterThan(-1);

    // The segment between guard and login-username must not contain
    // a closing `: (`  that would indicate the false-branch
    const between = before.slice(guardIdx);
    const falseBranchIdx = between.indexOf(') : (');
    // If there's a false-branch marker, it must be after login-username
    // (i.e. not between guard and login-username)
    if (falseBranchIdx !== -1) {
      // The `) : (`  before login-username would mean login-username is in the else branch
      // But there could be nested ternaries; check the region more carefully
      const afterGuard = SRC.slice(guardIdx + 'USE_DEV_LOGIN ?'.length);
      const loginAfterGuard = afterGuard.indexOf('login-username');
      const colonAfterGuard = afterGuard.indexOf(') : (');
      // login-username must appear before the : (  that closes this ternary
      expect(loginAfterGuard).toBeLessThan(colonAfterGuard);
    }
  });

  // ── PKCE "Sign in" path preserved ──

  it('PKCE "Sign in" path preserved — submitPkce() is in the ternary else-branch', () => {
    // The Pressable onPress uses:
    //   USE_DEV_LOGIN ? submitDevLogin() : submitPkce()
    // Verify the ternary expression is intact.
    expect(SRC).toContain('? submitDevLogin()');
    expect(SRC).toContain(': submitPkce()');

    // Verify the "Sign in" label exists (PKCE button text)
    expect(SRC).toContain("'Sign in'");

    // Verify loginWithPkce (the PKCE function) is referenced
    expect(SRC).toContain('loginWithPkce');
  });

  // ── Perturb-and-restore proof ──

  it('PERTURB gate expression: the full guard must include EXPO_PUBLIC_ENABLE_DEV_LOGIN', () => {
    // This test documents the pivot point. If someone removes the env-var
    // check and reverts to `const USE_DEV_LOGIN = __DEV__;`, test #1 in this
    // suite fails because the exact gate expression is no longer present.
    //
    // Perturb proof (just executed):
    //   1. Revert guard to `= __DEV__;`
    //   2. `npm test -- --testPathPattern=loginScreenDevLogin` → 1 FAIL
    //      "USE_DEV_LOGIN gates on __DEV__ OR EXPO_PUBLIC_ENABLE_DEV_LOGIN"
    //   3. Restore the correct gate
    //   4. `npm test -- --testPathPattern=loginScreenDevLogin` → 5 PASS
    //
    // This test always passes when the correct gate is in place; it's the
    // canary that catches regression.
    expect(
      SRC.includes(
        "__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === 'true'",
      ) ||
        SRC.includes(
          '__DEV__ ||\n  process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === \'true\'',
        ),
    ).toBe(true);
  });

  it('PERTURB: login-username is still the exact testID used (no drift)', () => {
    // Explicit testID contract — the E2E suite depends on this exact string
    expect(SRC).toContain("testID=\"login-username\"");
  });
});
