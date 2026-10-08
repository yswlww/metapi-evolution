import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const web = resolve(root, 'dist/web');
assert.ok(existsSync(resolve(web, 'index.html')), 'Run npm run build:web before browser smoke tests');
const settings = { webhookEnabled: false, webhookUrl: 'https://fixture.invalid/hook', notifyCooldownSec: 300 };
const webdav = { enabled: true, fileUrl: 'https://fixture.invalid/backup.json', username: 'fixture-user', hasPassword: true, exportType: 'all', autoSyncEnabled: false, autoSyncCron: '0 */6 * * *' };
const writes = [];
const json = (response, body, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = body ? JSON.parse(body) : undefined;
    if (request.method !== 'GET') writes.push({ path: url.pathname, method: request.method, payload });
    if (!request.headers.authorization) return json(response, { message: 'Missing fixture authorization' }, 401);
    if (url.pathname === '/api/settings/runtime') {
      if (payload) Object.assign(settings, payload);
      return json(response, settings);
    }
    if (url.pathname === '/api/settings/backup/webdav') {
      if (payload) Object.assign(webdav, payload);
      return json(response, { config: webdav });
    }
    if (url.pathname === '/api/events/count') return json(response, { count: 0 });
    if (url.pathname === '/api/search') return json(response, { sites: [], accounts: [], accountTokens: [], checkinLogs: [], proxyLogs: [], models: [{ name: 'fixture-model' }] });
    if (url.pathname === '/api/accounts') return json(response, { generatedAt: new Date().toISOString(), accounts: [] });
    if (url.pathname === '/api/oauth/providers') return json(response, { providers: [] });
    if (url.pathname === '/api/oauth/connections') return json(response, { items: [], total: 0 });
    if (url.pathname === '/api/models/marketplace') return json(response, { models: [{ name: 'fixture-model', accountCount: 0, accounts: [], successRate: 93, pricingSources: [] }, { name: 'fixture-model-plus', accountCount: 0, accounts: [], successRate: 100, pricingSources: [] }], meta: {} });
    if (url.pathname === '/api/models/token-candidates') return json(response, { models: {}, endpointTypesByModel: {} });
    if (url.pathname === '/api/downstream-keys') return json(response, { items: [{ id: 1, name: 'fixture-key', key: 'sk-fixture', enabled: true, tags: [], groupName: 'fixture', usedQuota: 0, usedRequests: 0, allowedRouteIds: [], excludedSiteIds: [], excludedCredentialRefs: [] }] });
    if (url.pathname === '/api/downstream-keys/summary') return json(response, { items: [] });
    if (url.pathname === '/api/monitor/overview') return json(response, { accounts: { total: 0, items: [], abnormalItems: [] }, sites: { total: 0, active: 0, disabled: 0 }, routes: { total: 0, problemItems: [] }, traffic24h: { totalRequests: 0, recentFailures: [] } });
    if (url.pathname === '/api/stats/proxy-logs') return json(response, { items: [], total: 0, page: 1, pageSize: 50, summary: { totalCount: 0, successCount: 0, failedCount: 0, totalCost: 0 }, clientOptions: [], sites: [] });
    if (url.pathname === '/api/stats/proxy-debug/traces') return json(response, { items: [] });
    if (url.pathname === '/api/stats/model-by-site') return json(response, { models: [] });
    if (url.pathname === '/api/stats/site-trend') return json(response, { trend: [] });
    if (url.pathname === '/api/stats/site-distribution') return json(response, { distribution: [] });
    if (url.pathname === '/api/stats/dashboard') return json(response, { totalBalance: 0, todaySpend: 0, todayReward: 0, activeAccounts: 0, totalAccounts: 0, siteAvailability: [] });
    if (url.pathname === '/api/update-center/status') return json(response, { config: {}, runtime: {}, helper: { history: [] } });
    if (url.pathname === '/api/settings/database/runtime') return json(response, { dialect: 'sqlite', connectionString: '', ssl: false });
    if (url.pathname === '/api/sites' || url.pathname === '/api/routes' || url.pathname === '/api/events' || url.pathname === '/api/account-tokens' || url.pathname === '/api/checkin/logs' || url.pathname === '/api/site-announcements') return json(response, []);
    return json(response, {});
  }
  const pathname = decodeURIComponent(url.pathname);
  let filename = resolve(web, `.${pathname}`);
  if (!filename.startsWith(`${web}${sep}`) && filename !== web) return json(response, {}, 403);
  if (!extname(pathname)) filename = resolve(web, pathname === '/legacy' || pathname.startsWith('/legacy/') ? 'legacy/index.html' : 'index.html');
  try {
    const bytes = await readFile(filename);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    response.writeHead(200, { 'Content-Type': types[extname(filename)] ?? 'application/octet-stream' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});

await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : existsSync('/usr/bin/google-chrome') ? { channel: 'chrome' } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.evaluate(() => { localStorage.setItem('metapi-auth-token', 'fixture-token'); localStorage.setItem('metapi-auth-expires-at', String(Date.now() + 60_000)); localStorage.setItem('metapi.lang', 'en'); });
  const routes = ['dashboard', 'sites', 'accounts', 'oauth', 'routes', 'downstream-keys', 'models', 'playground', 'checkins', 'proxy-logs', 'site-announcements', 'events', 'monitor', 'settings', 'notifications', 'import-export', 'about'];
  for (const route of routes) {
    await page.goto(`${base}/app/${route}`);
    try {
      await page.locator('main').waitFor();
      await page.waitForFunction(() => !document.querySelector('main [role="status"]'));
      assert.ok((await page.locator('main').innerText()).trim().length > 0, `Empty ${route} page`);
      assert.deepEqual(errors, [], `Runtime error on ${route}`);
    } catch (error) {
      throw new Error(`${route}: ${error.message}; browser errors=${JSON.stringify(errors)}; url=${page.url()}`);
    }
  }
  await page.goto(`${base}/app/notifications`);
  await page.getByRole('button', { name: /^configure$/i }).first().click();
  await page.getByLabel('Webhook URL', { exact: true }).fill('https://fixture.invalid/saved-hook');
  const enabledControl = page.getByRole('checkbox', { name: 'Enabled', exact: true });
  await enabledControl.focus();
  await enabledControl.press('Space');
  assert.ok(await enabledControl.isChecked(), 'Notification toggle is not keyboard-operable');
  await page.locator('aside').getByRole('button', { name: /^save$/i }).click();
  await page.getByLabel('Webhook URL', { exact: true }).waitFor({ state: 'detached' });
  assert.equal(settings.webhookUrl, 'https://fixture.invalid/saved-hook');
  assert.equal(settings.webhookEnabled, true);
  await page.reload();
  await page.getByText('https://fixture.invalid/saved-hook', { exact: true }).waitFor();
  await page.goto(`${base}/app/import-export`);
  await page.getByRole('button', { name: /^webdav$/i }).click();
  const fileUrl = page.getByLabel('WebDAV URL', { exact: true });
  await fileUrl.fill('https://fixture.invalid/saved-backup.json');
  await page.locator('aside').getByRole('button', { name: /^save$/i }).click();
  await fileUrl.waitFor({ state: 'detached' });
  const webdavWrite = writes.filter(write => write.path === '/api/settings/backup/webdav' && write.method === 'PUT').at(-1);
  assert.ok(webdavWrite, 'WebDAV Save did not persist configuration');
  assert.equal(Object.hasOwn(webdavWrite.payload, 'clearPassword'), false, 'Blank password silently cleared saved credentials');
  assert.equal(Object.hasOwn(webdavWrite.payload, 'password'), false, 'Blank password overwrote saved credentials');
  assert.equal(webdavWrite.payload.username, 'fixture-user', 'Saved WebDAV username was not loaded');
  await page.reload();
  await page.getByRole('button', { name: /^webdav$/i }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(input => input.value === 'https://fixture.invalid/saved-backup.json'));
  await page.getByRole('button', { name: /^cancel$/i }).last().click();
  await page.goto(`${base}/app/models`);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByPlaceholder('Search sites, accounts, models…').fill('fixture');
  await page.getByRole('button', { name: 'fixture-model', exact: true }).click();
  assert.ok(page.url().includes('focusModel=fixture-model'), 'Search lost exact model focus');
  await page.locator('[data-model-name="fixture-model"]').waitFor();
  await page.locator('[data-model-name="fixture-model-plus"]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-model-name="fixture-model-plus"]').count(), 0, 'Model focus still shows substring matches');
  await page.getByRole('button', { name: 'Change theme', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('metapi.theme')), 'light');
  await page.getByRole('button', { name: 'Change theme', exact: true }).click();
  await page.getByRole('button', { name: 'Change theme', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('metapi.theme')), 'system');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByRole('button', { name: 'Change language', exact: true }).click();
  await page.getByRole('button', { name: '切換語言', exact: true }).waitFor();
  await page.getByRole('button', { name: '切換語言', exact: true }).click();
  await page.getByRole('button', { name: '切换语言', exact: true }).waitFor();
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await page.goto(`${base}/app/playground`);
  await page.locator('.model-tester-surface').waitFor();
  assert.ok(
    (await page.locator('.model-tester-surface').innerText()).trim().length > 0,
    'The shared playground rendered an empty surface',
  );
  assert.equal(
    await page.locator('.model-tester-surface [data-model-name]').count(),
    0,
    'Playground leaked another page into its island',
  );
  assert.deepEqual(errors, [], 'Playground raised a runtime error');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/app/downstream-keys`);
  await page.locator('main input[type="checkbox"]:visible').first().check();
  assert.ok(await page.locator('main input[type="checkbox"]:visible').first().isChecked(), 'Mobile key card cannot enter batch selection');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Reference interface', exact: true }).last().waitFor();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click({ position: { x: 370, y: 100 } });
  const screenshot = process.env.CLAUDE_JOB_DIR ? resolve(process.env.CLAUDE_JOB_DIR, 'tmp/evolution-ui-smoke.png') : resolve(root, 'tmp/evolution-ui-smoke.png');
  mkdirSync(dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.evaluate(() => { localStorage.setItem('metapi-auth-expires-at', '1'); window.dispatchEvent(new Event('focus')); });
  await page.waitForURL(base + '/');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  assert.ok(writes.every(write => !write.path.includes('deploy') && !write.path.includes('factory-reset') && !write.path.includes('migrate')), 'Smoke made a maintenance write');
  const legacy = await page.request.get(`${base}/legacy/accounts`);
  assert.equal(legacy.status(), 200);
  assert.ok((await legacy.text()).includes('/legacy/assets/'), 'Legacy deep link lost legacy asset base');
  console.log(`PASS: ${routes.length} real built pages; search focus, three languages, live system theme, mobile navigation, session expiry, legacy deep link. All API traffic used local fixtures. Screenshot: ${screenshot}`);
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
