export function frontendEntryForPath(url: string): string | null {
  const pathname = url.split('?')[0];
  const reserved = ['/api', '/v1', '/monitor-proxy', '/assets', '/legacy/assets'];
  if (reserved.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
  if (pathname === '/legacy' || pathname.startsWith('/legacy/')) return 'legacy/index.html';
  return 'index.html';
}
