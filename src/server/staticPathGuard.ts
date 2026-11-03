/**
 * `@fastify/static` 10.1.8 rechecks the file selected by send only when
 * `allowedPath` is set. A selection that resolves outside the web root is
 * rejected before this predicate runs. The predicate itself rejects traversal
 * and non-POSIX separators, and allows the empty path the plugin uses for the
 * root index when wildcard is false.
 */
export function isAllowedStaticPath(pathName: string): boolean {
  if (pathName.length === 0 || pathName === '/') return true;
  if (pathName.includes('\\') || pathName.includes('\0')) return false;
  return !pathName.split('/').includes('..');
}
