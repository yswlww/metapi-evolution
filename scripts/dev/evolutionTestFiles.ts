import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export function evolutionTestFiles(root: string): { node: string[]; vitest: string[] } {
  const directory = join(root, 'New metapi Evolution Webui/metapi/src');
  const result = { node: [] as string[], vitest: [] as string[] };
  if (!existsSync(directory)) return result;
  function visit(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const filename = join(path, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (/\.test\.tsx?$/.test(entry.name)) {
        const source = readFileSync(filename, 'utf8');
        if (/from\s+['"]vitest['"]/.test(source)) result.vitest.push(relative(root, filename));
        else if (/from\s+['"]node:test['"]/.test(source)) result.node.push(relative(root, filename));
        else throw new Error(`Unknown test runner: ${filename}`);
      }
    }
  }
  visit(directory);
  result.node.sort();
  result.vitest.sort();
  return result;
}
