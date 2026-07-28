/**
 * Global setup for characterization tests.
 *
 * Verifies that the dev stack is healthy before any test runs.
 * Connection details are hard-coded for the dev stack (no env-file parsing needed).
 */

const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3001/api';

async function healthCheck(): Promise<void> {
  const url = `${API_BASE}/health`;
  let ok = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'ok') {
          ok = true;
          break;
        }
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ok) {
    throw new Error(`Dev stack not healthy at ${url} after 30s — is docker-compose.dev.yml up?`);
  }
  console.log('[char-setup] Dev stack healthy');
}

export default async function globalSetup(): Promise<void> {
  console.log('[char-setup] Checking dev stack health…');
  await healthCheck();
  console.log('[char-setup] Ready.');
}