import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evolutionTestFiles } from './evolutionTestFiles.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = evolutionTestFiles(root);
for (const [runner, args] of [
  ['tsx', ['--test', ...files.node]],
  ['vitest', ['run', '--root', '.', ...files.vitest]],
] as const) {
  if (!(runner === 'tsx' ? files.node : files.vitest).length) continue;
  const entry = fileURLToPath(new URL(runner === 'tsx' ? '../../node_modules/tsx/dist/cli.mjs' : '../../node_modules/vitest/vitest.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
