export const PLATFORM_ALIASES = Object.assign(Object.create(null), {
  anyrouter: 'anyrouter',
  axonhub: 'axonhub',
  'axon-hub': 'axonhub',
  'wong-gongyi': 'new-api',
  'vo-api': 'new-api',
  'super-api': 'new-api',
  'rix-api': 'new-api',
  'neo-api': 'new-api',
  newapi: 'new-api',
  'new api': 'new-api',
  'new-api': 'new-api',
  oneapi: 'one-api',
  'one api': 'one-api',
  'one-api': 'one-api',
  onehub: 'one-hub',
  'one-hub': 'one-hub',
  donehub: 'done-hub',
  'done-hub': 'done-hub',
  veloera: 'veloera',
  sub2api: 'sub2api',
  openai: 'openai',
  codex: 'codex',
  'chatgpt-codex': 'codex',
  'chatgpt codex': 'codex',
  anthropic: 'claude',
  claude: 'claude',
  gemini: 'gemini',
  'gemini-cli': 'gemini-cli',
  antigravity: 'antigravity',
  'anti-gravity': 'antigravity',
  google: 'gemini',
  cliproxyapi: 'cliproxyapi',
  cpa: 'cliproxyapi',
  'cli-proxy-api': 'cliproxyapi',
});

function getPlatformAlias(raw) {
  return Object.prototype.hasOwnProperty.call(PLATFORM_ALIASES, raw)
    ? PLATFORM_ALIASES[raw]
    : undefined;
}

function normalizeUrlCandidate(url) {
  return typeof url === 'string' ? url.trim() : '';
}

export function parseHttpUrlCandidate(url) {
  const normalized = typeof url === 'string' ? url.trim() : '';
  if (!normalized) return null;
  const candidates = normalized.includes('://') ? [normalized] : [`https://${normalized}`];
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      return parsed;
    } catch {}
  }
  return null;
}

function matchesPathSegment(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function normalizePlatformAlias(platform) {
  const raw = typeof platform === 'string' ? platform.trim().toLowerCase() : '';
  if (!raw) return '';
  return getPlatformAlias(raw) ?? raw;
}

export function detectPlatformByUrlHint(url) {
  const normalized = normalizeUrlCandidate(url).toLowerCase();
  if (!normalized) return undefined;
  const parsed = parseHttpUrlCandidate(normalized);
  const host = parsed?.hostname?.trim().toLowerCase() || '';
  const port = parsed?.port?.trim() || '';
  const path = parsed?.pathname?.trim().toLowerCase() || '';

  if (host === 'api.openai.com') return 'openai';
  if (host === 'qianfan.baidubce.com' && matchesPathSegment(path, '/v2/coding')) return 'openai';
  if (host === 'qianfan.baidubce.com' && matchesPathSegment(path, '/anthropic/coding')) return 'claude';
  if (host === 'chatgpt.com' && matchesPathSegment(path, '/backend-api/codex')) return 'codex';
  if (host === 'api.anthropic.com' || (host === 'anthropic.com' && matchesPathSegment(path, '/v1'))) return 'claude';
  if (
    host === 'generativelanguage.googleapis.com'
    || host === 'gemini.google.com'
    || ((host === 'googleapis.com' || host.endsWith('.googleapis.com')) && matchesPathSegment(path, '/v1beta/openai'))
  ) {
    return 'gemini';
  }
  if (host === 'cloudcode-pa.googleapis.com') return 'gemini-cli';
  if ((host === '127.0.0.1' || host === 'localhost') && port === '8317') return 'cliproxyapi';
  if (host === 'hub.linux.do') return 'axonhub';
  if (host.includes('anyrouter')) return 'anyrouter';
  if (host.includes('donehub') || host.includes('done-hub')) return 'done-hub';
  if (host.includes('onehub') || host.includes('one-hub')) return 'one-hub';
  if (host.includes('antigravity')) return 'antigravity';
  if (host.includes('cliproxy')) return 'cliproxyapi';
  if (host.includes('veloera')) return 'veloera';
  if (host.includes('sub2api')) return 'sub2api';

  return undefined;
}
