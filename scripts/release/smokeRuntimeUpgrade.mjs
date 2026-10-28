#!/usr/bin/env node
// Isolated, real Docker rehearsal. The fake release server exists only on a
// private Docker network; no public release, image tag or user data is changed.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

function arg(name) { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; }
const image = arg('image') || 'metapi-runtime:622-test';
const bundles = resolve(arg('bundles') || 'runtime-bundles');
const id = `metapi-upgrade-${randomUUID().slice(0, 8)}`;
const root = await mkdtemp(join(process.env.CLAUDE_JOB_DIR ? `${process.env.CLAUDE_JOB_DIR}/tmp/` : tmpdir(), 'runtime-rehearsal-'));
const app = `${id}-app`, fixture = `${id}-releases`, volume = `${id}-data`;
const token = randomUUID();
const pause = ms => new Promise(r => setTimeout(r, ms));

function command(binary, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolvePromise(output.trim()) : reject(new Error(`${binary} failed (${code}): ${output.slice(-4000)}`)));
  });
}
const docker = (...args) => command('docker', args);

try {
  const archive = (await readdir(bundles)).find(name => /^metapi-evolution-99\.0\.0-(amd64|arm64)\.tar\.gz$/.test(name));
  if (!archive) throw new Error('Build a 99.0.0 candidate with the server-bundle Docker target first');
  await command('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem'), '-subj', '/CN=github.com', '-addext', 'subjectAltName=DNS:github.com', '-days', '1']);
  await mkdir(join(root, 'releases'));
  const prep = `
    const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto'), tar = require('tar');
    (async () => {
      const original = process.argv[1];
      const arch = original.includes('amd64') ? 'amd64' : 'arm64';
      for (const version of ['99.0.0', '99.0.1', '99.0.2']) {
        const out = path.join('/work/releases', 'v' + version);
        await fs.mkdir(out, {recursive: true});
        const filename = 'metapi-evolution-' + version + '-' + arch + '.tar.gz';
        const archive = path.join(out, filename);
        if (version === '99.0.0' || version === '99.0.2') await fs.copyFile('/bundles/' + original, archive);
        else {
          const stage = '/work/bad-candidate';
          await fs.mkdir(stage);
          await tar.x({file: '/bundles/' + original, cwd: stage});
          const pkg = JSON.parse(await fs.readFile(stage + '/package.json'));
          await fs.writeFile(stage + '/package.json', JSON.stringify({...pkg, version}));
          const manifest = JSON.parse(await fs.readFile(stage + '/runtime-manifest.json'));
          await fs.writeFile(stage + '/runtime-manifest.json', JSON.stringify({...manifest, version}));
          await fs.writeFile(stage + '/dist/server/db/migrate.js', 'process.exit(42)');
          await tar.c({file: archive, cwd: stage, gzip: true, portable: true}, ['dist','node_modules','drizzle','package.json','runtime','runtime-manifest.json']);
        }
        const digest = version === '99.0.2' ? '0'.repeat(64) : crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex');
        await fs.writeFile(path.join(out, 'checksums.txt'), digest + '  ' + filename + '\\n');
      }
    })().catch(e => { console.error(e); process.exitCode = 1; });
  `;
  await docker('run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '--entrypoint', 'node', '-v', `${bundles}:/bundles:ro`, '-v', `${root}:/work`, '-w', '/app', image, '-e', prep, archive);
  await writeFile(join(root, 'release-server.cjs'), `
    const https=require('node:https'),fs=require('node:fs'),path=require('node:path');
    https.createServer({key:fs.readFileSync('/work/key.pem'),cert:fs.readFileSync('/work/cert.pem')},(req,res)=>{
      const match=req.url.match(/^\\/yswlww\\/metapi-evolution\\/releases\\/download\\/(v99\\.0\\.[012])\\/([^/]+)$/);
      if(!match){ res.writeHead(404);res.end();return; }
      const file=path.join('/work/releases',match[1],match[2]);
      if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'content-length':fs.statSync(file).size});fs.createReadStream(file).pipe(res);
    }).listen(443,'0.0.0.0');
  `);
  await docker('network', 'create', id);
  await docker('volume', 'create', volume);
  await docker('run', '-d', '--name', fixture, '--network', id, '--network-alias', 'github.com', '--entrypoint', 'node', '-v', `${root}:/work:ro`, image, '/work/release-server.cjs');
  await docker('run', '-d', '--name', app, '--network', id, '-p', '127.0.0.1::4000', '-v', `${volume}:/app/data`, '-v', `${join(root, 'cert.pem')}:/cert.pem:ro`,
    '-e', `AUTH_TOKEN=${token}`, '-e', `PROXY_TOKEN=${token}`, '-e', 'NODE_EXTRA_CA_CERTS=/cert.pem', '-e', 'METAPI_UPDATE_HEALTH_TIMEOUT_MS=5000', image);
  const mapping = await docker('port', app, '4000/tcp');
  let base = `http://${mapping.split('\n')[0]}`;
  async function api(path, method = 'GET', body) {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    const value = await response.json();
    if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(value)}`);
    return value;
  }
  async function until(check, description, timeout = 60_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try { if (await check()) { console.log(`PASS ${description}`); return; } } catch (error) { if (error.fatal) throw error; }
      await pause(250);
    }
    throw new Error(`Timed out: ${description}`);
  }
  await until(async () => (await api('/api/desktop/health')).ok, 'fresh image boots');
  for (const path of ['/app', '/legacy']) {
    const response = await fetch(`${base}${path}`);
    if (!response.ok || !(await response.text()).includes('assets/')) throw new Error(`Missing built frontend: ${path}`);
  }
  await api('/api/update-center/config', 'PUT', { enabled: true, githubReleasesEnabled: false, dockerHubTagsEnabled: false, defaultDeploySource: 'github-release' });
  const initial = await api('/api/update-center/status');
  if (!initial.selfUpgrade?.supported) throw new Error('Supervisor did not advertise self-upgrade support');
  async function deploy(tag) { return (await api('/api/update-center/deploy', 'POST', { source: 'github-release', targetTag: tag })).task.id; }
  async function taskDone(taskId, success, expectedVersion) {
    await until(async () => {
      const task = (await api(`/api/update-center/tasks/${taskId}`)).task;
      if (success && task.status === 'failed') throw Object.assign(new Error(`Upgrade task failed: ${JSON.stringify(task)}`), { fatal: true });
      const current = await api('/api/update-center/status');
      return task.status === (success ? 'succeeded' : 'failed') && current.currentVersion === expectedVersion;
    }, `${taskId.slice(0,8)} ${success ? 'healthy activation' : 'safe rejection/recovery'} -> ${expectedVersion}`);
  }
  await taskDone(await deploy('v99.0.2'), false, initial.currentVersion);
  await taskDone(await deploy('v99.0.0'), true, '99.0.0');
  const rolled = await api('/api/update-center/rollback', 'POST', {});
  await taskDone(rolled.task.id, true, initial.currentVersion);
  await taskDone(await deploy('v99.0.0'), true, '99.0.0');
  await taskDone(await deploy('v99.0.1'), false, '99.0.0');
  const failed = await api('/api/update-center/status');
  if (failed.localUpdate.state.phase !== 'rolled-back' || failed.localUpdate.state.rollbackAttempted !== true) throw new Error('Rollback was not persisted');
  await docker('restart', app);
  base = `http://${(await docker('port', app, '4000/tcp')).split('\n')[0]}`;
  await until(async () => (await api('/api/update-center/status')).currentVersion === '99.0.0', 'persisted release survives container restart');
  const recovered = await api('/api/update-center/status');
  if (recovered.localUpdate.state.phase !== 'rolled-back') throw new Error('Restart lost rollback outcome');
  console.log('PASS native Docker runtime, both frontends, checksum rejection, API activation, manual rollback, migration-failure rollback and restart recovery');
} catch (error) {
  console.error(error);
  for (const name of [app, fixture]) {
    try { console.error(await docker('logs', '--tail', '100', name)); } catch {}
  }
  throw error;
} finally {
  for (const name of [app, fixture]) { try { await docker('rm', '-f', name); } catch {} }
  try { await docker('network', 'rm', id); } catch {}
  try { await docker('volume', 'rm', volume); } catch {}
  await rm(root, { recursive: true, force: true });
}
