import { describe, expect, it } from 'vitest';
import { normalizeHttpOrigin, webDomainDestination } from './serverConfig';

describe('web server switching', () => {
  it('normalizes hostnames and rejects unsafe protocols', () => {
    expect(normalizeHttpOrigin(' chat.example.com/path ')).toBe('https://chat.example.com');
    expect(normalizeHttpOrigin('http://localhost:3000/a')).toBe('http://localhost:3000');
    expect(normalizeHttpOrigin('javascript:alert(1)')).toBeNull();
  });

  it('hands off only a deduplicated list of server origins', () => {
    const result = webDomainDestination(
      'https://second.example.com/path',
      'https://first.example.com',
      ['https://first.example.com/', 'https://third.example.com/a'],
    );

    expect(result?.target).toBe('https://second.example.com');
    expect(result?.domains).toEqual([
      'https://first.example.com',
      'https://second.example.com',
      'https://third.example.com',
    ]);
    const fragment = new URLSearchParams(new URL(result!.href).hash.slice(1));
    expect(JSON.parse(fragment.get('openchat-servers')!)).toEqual(result?.domains);
    expect(result?.href).not.toMatch(/token|session|credential/i);
  });
});
