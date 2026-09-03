import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const upstreamIntegrationPath = fileURLToPath(new URL('../../docs/upstream-integration.md', import.meta.url));

function getOrcaRouterSection() {
  const content = readFileSync(upstreamIntegrationPath, 'utf8');
  const heading = '### OrcaRouter';
  const start = content.indexOf(heading);
  const end = content.indexOf('\n### ', start + heading.length);
  return start < 0 ? '' : content.slice(start, end < 0 ? content.length : end);
}

describe('OrcaRouter upstream documentation', () => {
  it('documents the implemented API-key proxy and model-discovery contract without account-management claims', () => {
    const section = getOrcaRouterSection();

    expect(section).toContain('https://api.orcarouter.ai/v1');
    expect(section).toContain('OpenAI 兼容');
    expect(section).toContain('API Key');
    expect(section).toContain('GET /models');
    expect(section).toContain('`orcarouter/auto`');
    expect(section).toContain('不支持用户名密码登录、签到、余额查询、Session Token 管理，或上游 Token 创建/删除');
    expect(section).not.toContain('零信任');
    expect(section).not.toContain('工具治理');
  });
});
