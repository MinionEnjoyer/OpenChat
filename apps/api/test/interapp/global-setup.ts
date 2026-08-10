const API_BASE = process.env.CHAR_API_BASE ?? 'http://localhost:3001/api';
const SHARE_BASE = process.env.CHAR_SHARE_BASE ?? 'http://localhost:8800';

async function waitForJsonHealth(name: string, url: string): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(url);
      const body = response.ok ? await response.json() : null;
      if (body?.status === 'ok') return;
    } catch {
      // The next bounded attempt provides the readiness retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${name} did not become healthy at ${url}`);
}

export default async function globalSetup(): Promise<void> {
  await Promise.all([
    waitForJsonHealth('OpenChat', `${API_BASE}/health`),
    waitForJsonHealth('OpenShare', `${SHARE_BASE}/health`),
  ]);
}
