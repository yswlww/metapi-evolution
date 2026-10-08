export const ADMIN_AUTH_FAILURE_HEADER = 'x-metapi-admin-auth-failure';

export function shouldClearAdminSession(requestUrl: string, status: number, marker: string | null): boolean {
  if (status !== 401 && status !== 403) return false;
  if (marker === '1') return true;
  const pathname = new URL(requestUrl, 'http://metapi.local').pathname;
  if (pathname === '/api/test' || pathname.startsWith('/api/test/') || pathname === '/v1' || pathname.startsWith('/v1/')) return false;
  return true;
}
