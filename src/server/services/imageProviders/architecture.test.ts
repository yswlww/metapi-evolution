import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('native image provider architecture boundaries', () => {
  it('keeps provider adapters protocol-focused and independent from routes', () => {
    const files = readdirSync(new URL('./', import.meta.url))
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from ['"][^'"]*routes\//);
      expect(source).not.toContain("from 'fastify'");
    }
  });
});
