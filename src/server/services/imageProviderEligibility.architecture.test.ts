import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('image provider architecture boundaries', () => {
  it('keeps provider capability and conversion modules independent of proxy routes', () => {
    const providerFiles = readdirSync(new URL('./imageProviders/', import.meta.url))
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    const sources = [
      readSource('./imageProviderEligibility.ts'),
      ...providerFiles.map((name) => readSource(`./imageProviders/${name}`)),
    ];

    for (const source of sources) {
      expect(source).not.toMatch(/from ['"][^'"]*routes\//);
      expect(source).not.toContain("from 'fastify'");
    }
  });

  it('keeps image operation filtering explicit at both public image routes', () => {
    const routeSource = readSource('../routes/proxy/images.ts');

    expect(routeSource).toContain("imageOperation: 'generate'");
    expect(routeSource).toContain("imageOperation: 'edit'");
  });
});
