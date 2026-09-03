import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = process.cwd();
const envExample = readFileSync(resolve(rootDir, '.env.example'), 'utf8');
const configuration = readFileSync(resolve(rootDir, 'docs/configuration.md'), 'utf8');

const siteConcurrencyDefaults = [
  ['PROXY_SITE_CONCURRENCY_QUEUE_LIMIT', '100'],
  ['PROXY_SITE_CONCURRENCY_QUEUE_WAIT_MS', '1500'],
  ['PROXY_SITE_CONCURRENCY_LEASE_TTL_MS', '90000'],
  ['PROXY_SITE_CONCURRENCY_LEASE_KEEPALIVE_MS', '15000'],
] as const;

describe('site concurrency deployment documentation', () => {
  it('publishes every process setting with its runtime default', () => {
    for (const [name, defaultValue] of siteConcurrencyDefaults) {
      expect(envExample).toContain(`${name}=${defaultValue}`);
      expect(configuration).toContain(`\`${name}\``);
      expect(configuration).toContain(`\`${defaultValue}\``);
    }
  });

  it('states the admission, streaming, and rollback contract', () => {
    expect(configuration).toContain('process-local');
    expect(configuration).toContain('`maxConcurrency=0` means unlimited');
    expect(configuration).toContain('queue cap');
    expect(configuration).toContain('HTTP `503`');
    expect(configuration).toContain('`Retry-After`');
    expect(configuration).toContain('Dynamic site-limit changes take effect immediately');
    expect(configuration).toContain('streaming lease');
    expect(configuration).toContain('Internal flows are excluded');
    expect(configuration).toContain('set every site limit to `0`/`NULL`');
    expect(configuration).toContain('migration 0029 may remain inert');
  });
});
