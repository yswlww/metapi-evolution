import React from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = await vi.hoisted(async () => {
  const {createRequire} = await import('node:module');
  const {dirname, resolve} = await import('node:path');
  const require = createRequire(import.meta.url);
  const dependencies = resolve(dirname(require.resolve('react-test-renderer')), '..');
  return {
    react: resolve(dependencies, 'react/index.js'), jsx: resolve(dependencies, 'react/jsx-runtime.js'),
    text: (key: string) => key, toast: vi.fn(),
    fetchRuntimeSettings: vi.fn(), updateRuntimeSettings: vi.fn(), testNotification: vi.fn(), testSystemProxy: vi.fn(),
    getBackupWebdavConfig: vi.fn(), saveBackupWebdavConfig: vi.fn(), exportBackup: vi.fn(), importBackup: vi.fn(), exportBackupToWebdav: vi.fn(), importBackupFromWebdav: vi.fn(),
    migrateExternalDatabase: vi.fn(), testExternalDatabaseConnection: vi.fn(), clearRuntimeCache: vi.fn(), clearUsageData: vi.fn(), factoryReset: vi.fn(),
    getDatabaseRuntime: vi.fn(), saveDatabaseRuntime: vi.fn(), runModelProbe: vi.fn(),
    getUpdateCenterStatus: vi.fn(), checkUpdateCenter: vi.fn(), deployUpdateCenter: vi.fn(), rollbackUpdateCenter: vi.fn(), saveUpdateConfig: vi.fn(), getUpdateTask: vi.fn(),
  };
});
// The legacy renderer is React 18; pin hooks and JSX to its React even when the new UI installs React 19.
vi.mock('react', () => vi.importActual(fixture.react));
vi.mock('react/jsx-runtime', () => vi.importActual(fixture.jsx));
vi.mock('lucide-react', () => ({Bell: () => null, Save: () => null, ShieldCheck: () => null, SlidersHorizontal: () => null, Terminal: () => null, Boxes: () => null, Download: () => null, Upload: () => null, FolderSync: () => null}));
vi.mock('../../lib/source', () => fixture);
vi.mock('../../lib/settingsParityApi', () => fixture);
vi.mock('../about/updateCenterApi', () => fixture);
vi.mock('../../i18n/useUiText', () => ({useUiText: () => fixture.text}));
vi.mock('../../contexts/LangContext', () => ({useLang: () => ({lang: 'en'})}));
vi.mock('../../components/Toast', () => ({useToast: () => ({showToast: fixture.toast})}));
vi.mock('../../components/PageHeader', () => ({default: ({title, actions}: any) => <header>{title}{actions}</header>}));
vi.mock('../../components/PrototypeUI', () => ({SectionTitle: ({title, actions}: any) => <header>{title}{actions}</header>, StatCard: ({label, value}: any) => <div>{label}{value}</div>, EmptyState: ({title}: any) => <div>{title}</div>}));
vi.mock('../../components/EditDrawer', () => ({
  EditDrawer: ({children, footer, title}: any) => <div role="dialog"><h2>{title}</h2>{children}{footer}</div>,
  Field: ({label, children}: any) => <label data-label={label}>{label}{children}</label>,
  TextInput: (props: any) => <input {...props} />,
  TextArea: (props: any) => <textarea {...props} />,
  Toggle: ({checked, onChange}: any) => <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />,
}));
import ChannelConfigDrawer from '../notifications/ChannelConfigDrawer';
import NotificationSettings from '../NotificationSettings';
import ImportExport from '../ImportExport';
import Settings from '../Settings';
import SettingsAdvanced from './SettingsAdvanced';
import DatabaseSettings from './DatabaseSettings';
import UpdateCenter from '../about/UpdateCenter';

let renderer: ReactTestRenderer | undefined;
function text(node: ReactTestInstance): string {return node.children.map(child => typeof child === 'string' ? child : text(child)).join('');}
function button(label: string) {return renderer!.root.findAllByType('button').find(node => text(node).trim() === label)!;}
function field(label: string, type = 'input') {return renderer!.root.findByProps({'data-label': label}).findByType(type);}
async function render(element: React.ReactElement) {await act(async () => {renderer = create(element);});}
async function click(label: string) {await act(async () => {await button(label).props.onClick();});}
const runtime = () => ({checkinCron: '0 8 * * *', checkinScheduleMode: 'interval', checkinIntervalHours: 12, balanceRefreshCron: '0 */6 * * *', logCleanupCron: '0 6 * * *', logCleanupRetentionDays: 30, logCleanupUsageLogsEnabled: true, logCleanupProgramLogsEnabled: false, tokenRouterFailureCooldownMaxSec: 60, routingWeights: {baseWeightFactor: 0.7, valueScoreFactor: 0.3, costWeight: 0.2, balanceWeight: 0.6, usageWeight: 0.2}, adminIpAllowlist: ['127.0.0.1'], systemProxyUrl: '', proxyEmptyContentFailEnabled: true, proxyErrorKeywords: ['bad'], payloadRules: {}, codexUpstreamWebsocketEnabled: true, responsesCompactFallbackToResponsesEnabled: true, proxySessionChannelConcurrencyLimit: 4, proxySessionChannelQueueWaitMs: 0, modelAvailabilityProbeEnabled: true, routingFallbackUnitCost: 0.001, proxyFirstByteTimeoutSec: 0, globalBlockedBrands: ['x'], globalAllowedModels: ['gpt-*'], webhookEnabled: false, barkEnabled: false, serverChanEnabled: false, smtpEnabled: false, telegramEnabled: true, telegramApiBaseUrl: 'https://tg.test', telegramChatId: '123', telegramUseSystemProxy: true, telegramMessageThreadId: '5'});
beforeEach(() => {
  fixture.text = (key: string) => key;
  for (const value of Object.values(fixture)) if (typeof value === 'function' && 'mockReset' in value) (value as any).mockReset();
  let stored = runtime();
  fixture.fetchRuntimeSettings.mockImplementation(async () => structuredClone(stored));
  fixture.updateRuntimeSettings.mockImplementation(async payload => {stored = {...stored, ...payload}; return stored;});
  fixture.getDatabaseRuntime.mockResolvedValue({active: {dialect: 'sqlite', connection: 'built-in', ssl: false}, saved: {dialect: 'postgres', connection: 'postgres://***@db/app', ssl: true}, restartRequired: true});
  fixture.getBackupWebdavConfig.mockResolvedValue({config: {enabled: true, fileUrl: 'https://dav.test/backup.json', username: 'existing', hasPassword: true, exportType: 'accounts', autoSyncEnabled: true, autoSyncCron: '0 3 * * *'}, state: {lastSyncAt: '2026-10-08T00:00:00Z', lastError: null}});
  fixture.getUpdateTask.mockResolvedValue({task: {id: 'task-1', status: 'succeeded', logs: [{message: 'real deployment log'}]}});
  vi.stubGlobal('window', {confirm: vi.fn(() => true), setTimeout});
});
afterEach(() => {if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals();});

describe('settings parity interactions', () => {
  it('tests the actual unsaved system-proxy draft under the backend proxyUrl key', async () => {
    await render(<SettingsAdvanced />);
    await act(async () => field('ui.settings.adv_proxy_title').props.onChange({ target: { value: 'http://draft-proxy:3128' } }));
    await click('ui.settings.adv_test');
    expect(fixture.testSystemProxy).toHaveBeenCalledWith({ proxyUrl: 'http://draft-proxy:3128' });
  });
  it('does not discard an unsaved notification cooldown when the translator changes', async () => {
    await render(<NotificationSettings />);
    const cooldown = () => renderer!.root.findAllByType('input').find(node => node.props.type === 'number')!;
    await act(async () => cooldown().props.onChange({ target: { value: '600' } }));
    fixture.text = (key: string) => `${key}:translated`;
    await act(async () => { renderer!.update(<NotificationSettings />); });
    expect(cooldown().props.value).toBe('600');
    expect(fixture.fetchRuntimeSettings).toHaveBeenCalledOnce();
  });
  it('preserves unsaved cooldown through an unrelated channel save and only resets after its own save', async () => {
    await render(<NotificationSettings />);
    const cooldown = () => renderer!.root.findAllByType('input').find(node => node.props.type === 'number')!;
    await act(async () => cooldown().props.onChange({ target: { value: '600' } }));
    await click('ui.notif.enable');
    expect(cooldown().props.value).toBe('600');
    await click('ui.common.save');
    expect(fixture.updateRuntimeSettings).toHaveBeenLastCalledWith({ notifyCooldownSec: 600 });
    expect(cooldown().props.value).toBe('600');
  });
  it('persists full Telegram configuration and omits blank secrets before closing', async () => {
    const close = vi.fn(); const saved = vi.fn();
    await render(<ChannelConfigDrawer kind="telegram" settings={runtime()} onClose={close} onSaved={saved} />);
    await act(async () => field('Topic / thread ID').props.onChange({target: {value: '99'}}));
    await click('ui.common.save');
    expect(fixture.updateRuntimeSettings).toHaveBeenCalledWith({telegramEnabled: true, telegramApiBaseUrl: 'https://tg.test', telegramChatId: '123', telegramUseSystemProxy: true, telegramMessageThreadId: '99'});
    expect(saved).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  });
  it('keeps the notification drawer open after persistence fails', async () => {
    fixture.updateRuntimeSettings.mockRejectedValueOnce(new Error('write failed'));
    const close = vi.fn();
    await render(<ChannelConfigDrawer kind="webhook" settings={{}} onClose={close} onSaved={vi.fn()} />);
    await click('ui.common.save');
    expect(close).not.toHaveBeenCalled(); expect(renderer!.root.findByProps({role: 'alert'}).children).toContain('write failed');
  });
  it('never shows prototype destinations when notification loading fails', async () => {
    fixture.fetchRuntimeSettings.mockRejectedValueOnce(new Error('load failed'));
    await render(<NotificationSettings />);
    expect(JSON.stringify(renderer!.toJSON())).toContain('load failed');
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('ops.example');
    expect(renderer!.root.findAllByType('section')).toHaveLength(0);
  });
  it('loads WebDAV and preserves blank passwords while saving existing autosync', async () => {
    await render(<ImportExport />); await click('ui.ie.webdav');
    expect(field('ui.ie.username').props.value).toBe('existing');
    expect(renderer!.root.findByProps({'data-label': 'ui.ie.auto_sync'}).findAllByType('input').find(node => node.props.type === 'checkbox')?.props.checked).toBe(true);
    await click('ui.common.save');
    expect(fixture.saveBackupWebdavConfig).toHaveBeenCalledWith({enabled: true, fileUrl: 'https://dav.test/backup.json', username: 'existing', exportType: 'accounts', autoSyncEnabled: true, autoSyncCron: '0 3 * * *'});
  });
  it('clears the WebDAV password only after the explicit checkbox is selected', async () => {
    await render(<ImportExport />); await click('ui.ie.webdav');
    await act(async () => field('Clear stored password').props.onChange({target: {checked: true}}));
    await click('ui.common.save');
    expect(fixture.saveBackupWebdavConfig.mock.calls[0][0]).toHaveProperty('clearPassword', true);
  });
  it('marks weight changes dirty and cancels back to exact saved routing weights', async () => {
    await render(<Settings />);
    const slider = () => renderer!.root.findByProps({'aria-label': 'ui.settings.weight_balance'});
    expect(slider().props.value).toBe(60);
    await act(async () => slider().props.onChange({target: {value: '10'}}));
    expect(button('ui.common.save').props.disabled).toBe(false);
    await click('ui.common.cancel');
    expect(slider().props.value).toBe(60); expect(button('ui.common.save').props.disabled).toBe(true);
  });
  it('saves interval scheduling without forcing cron or overwriting preset factors', async () => {
    await render(<Settings />);
    await act(async () => renderer!.root.findByProps({'aria-label': 'Checkin interval'}).props.onChange({target: {value: '24'}}));
    await click('ui.common.save');
    expect(fixture.updateRuntimeSettings.mock.calls[0][0]).toMatchObject({checkinScheduleMode: 'interval', checkinIntervalHours: 24, tokenRouterFailureCooldownMaxSec: 60, routingWeights: {baseWeightFactor: 0.7, valueScoreFactor: 0.3}});
  });
  it('saves empty-response detection, explicit zero queue wait and cleared blocklists', async () => {
    await render(<SettingsAdvanced />);
    await act(async () => {field('ui.settings.adv_empty_content').props.onChange({target: {checked: false}}); field('ui.settings.adv_blocked_brands').props.onChange({target: {value: ''}});});
    await click('ui.common.save');
    expect(fixture.updateRuntimeSettings.mock.calls[0][0]).toMatchObject({proxyEmptyContentFailEnabled: false, proxySessionChannelQueueWaitMs: 0, routingFallbackUnitCost: 0.001, globalBlockedBrands: []});
  });
  it('runs model probing rather than the system-proxy test', async () => {
    await render(<SettingsAdvanced />); await click('ui.settings.adv_probe_run');
    expect(fixture.runModelProbe).toHaveBeenCalledOnce(); expect(fixture.testSystemProxy).not.toHaveBeenCalled();
  });
  it('never submits masked DB credentials and includes SSL/overwrite for migration', async () => {
    await render(<DatabaseSettings />);
    const connectionLabel = 'Connection string (enter actual credentials, not the masked display)';
    expect(field(connectionLabel).props.value).toBe('');
    await act(async () => {field(connectionLabel).props.onChange({target: {value: 'postgres://real@db/app'}}); field('Overwrite target database during migration').props.onChange({target: {checked: true}});});
    await click('ui.settings.adv_migrate');
    expect(fixture.migrateExternalDatabase).toHaveBeenCalledWith({dialect: 'postgres', connectionString: 'postgres://real@db/app', ssl: true, overwrite: true});
  });
  it('keeps general routing weights synchronized after an advanced preset save', async () => {
    await render(<Settings />); await click('ui.settings.tab_advanced');
    await act(async () => field('ui.settings.adv_preset', 'select').props.onChange({target: {value: 'cost'}}));
    await click('ui.common.save'); await click('ui.settings.tab_general');
    await act(async () => renderer!.root.findByProps({'aria-label': 'Checkin interval'}).props.onChange({target: {value: '24'}}));
    await click('ui.common.save');
    expect(fixture.updateRuntimeSettings.mock.calls.at(-1)![0].routingWeights).toMatchObject({baseWeightFactor: 0.35, valueScoreFactor: 0.65, costWeight: 0.75});
  });
  it('cancels unsaved notification toggles as well as general settings', async () => {
    await render(<Settings />); await click('ui.settings.tab_notify');
    const toggles = () => renderer!.root.findAllByType('input').filter(node => node.props.type === 'checkbox');
    await act(async () => toggles()[1].props.onChange({target: {checked: true}}));
    expect(button('ui.common.save').props.disabled).toBe(false);
    await click('ui.common.cancel');
    expect(toggles()[1].props.checked).toBe(false); expect(button('ui.common.save').props.disabled).toBe(true);
  });
  it('rejects zero fallback cost instead of silently replacing it with a default', async () => {
    await render(<SettingsAdvanced />);
    await act(async () => field('ui.settings.adv_fallback_cost').props.onChange({target: {value: '0'}}));
    await click('ui.common.save');
    expect(fixture.updateRuntimeSettings).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByProps({role: 'alert'})).toHaveLength(1);
  });
  it('resets payload JSON and unapplied builder rows when advanced edits are cancelled', async () => {
    await render(<SettingsAdvanced />);
    await act(async () => renderer!.root.findByProps({'aria-label': 'ui.settings.adv_payload_title'}).props.onChange({target: {value: '{"default":[]}'}}));
    await click('Visual rule builder'); await click('Add rule');
    const cancel = renderer!.root.findAllByType('button').filter(node => text(node) === 'ui.common.cancel').at(-2)!;
    // Last cancel belongs to DB; second last is the advanced snapshot reset.
    await act(async () => cancel.props.onClick());
    expect(renderer!.root.findByProps({'aria-label': 'ui.settings.adv_payload_title'}).props.value).toBe('{}');
    expect(renderer!.root.findAllByProps({'data-label': 'Model pattern'})).toHaveLength(0);
  });
  it('reads a real uploaded backup envelope and submits the confirmed raw data', async () => {
    const data = {version: '2.1', accounts: {sites: [{}], accounts: [{}], accountTokens: []}, preferences: {settings: [{}]}};
    await render(<ImportExport />);
    await act(async () => renderer!.root.findByProps({type: 'file'}).props.onChange({target: {files: [{name: 'backup.json', text: async () => JSON.stringify(data)}], value: 'backup.json'}}));
    expect(JSON.stringify(renderer!.toJSON())).toContain('accountTokens');
    await click('ui.ie.confirm_import'); await click('ui.ie.apply');
    expect(fixture.importBackup).toHaveBeenCalledWith(data);
  });
  it('saves DB runtime configuration and refreshes the restart-required snapshot', async () => {
    fixture.saveDatabaseRuntime.mockResolvedValue({active: {dialect: 'sqlite', connection: 'built-in', ssl: false}, saved: {dialect: 'postgres', connection: 'postgres://***@db/app', ssl: true}, restartRequired: true});
    await render(<DatabaseSettings />);
    await act(async () => field('Connection string (enter actual credentials, not the masked display)').props.onChange({target: {value: 'postgres://real@db/app'}}));
    await click('ui.common.save');
    expect(fixture.saveDatabaseRuntime).toHaveBeenCalledWith({dialect: 'postgres', connectionString: 'postgres://real@db/app', ssl: true, overwrite: false});
    expect(JSON.stringify(renderer!.toJSON())).toContain('Restart required');
  });
  it('saves update config and restores cancelled config edits', async () => {
    const config = {enabled: true, helperBaseUrl: 'https://helper.test', namespace: 'default', releaseName: 'metapi', chartRef: 'chart', imageRepository: 'owner/metapi', githubReleasesEnabled: true, dockerHubTagsEnabled: true, defaultDeploySource: 'github-release' as const};
    fixture.getUpdateCenterStatus.mockResolvedValue({currentVersion: '1.4.2', config});
    fixture.saveUpdateConfig.mockImplementation(async value => ({config: value}));
    await render(<UpdateCenter />);
    await act(async () => field('Deploy helper URL').props.onChange({target: {value: 'https://edited.test'}}));
    await click('ui.common.cancel'); expect(field('Deploy helper URL').props.value).toBe('https://helper.test');
    await act(async () => field('Deploy helper URL').props.onChange({target: {value: 'https://edited.test'}}));
    await click('ui.common.save');
    expect(fixture.saveUpdateConfig).toHaveBeenCalledWith({...config, helperBaseUrl: 'https://edited.test'});
  });
  it('deploys Docker tags and rolls back a selected historical revision', async () => {
    const status = {currentVersion: '1.4.2', config: {enabled: true, defaultDeploySource: 'github-release'}, dockerHubRecentTags: [{tagName: 'v1.4.3', displayVersion: '1.4.3', digest: 'sha256:abc'}], helper: {revision: '8', history: [{revision: '7', imageTag: 'v1.4.1'}, {revision: '8', imageTag: 'v1.4.2'}]}, lastFinishedTask: {id: 'task-1'}};
    fixture.getUpdateCenterStatus.mockResolvedValue(status); fixture.deployUpdateCenter.mockResolvedValue({task: {id: 'task-1'}}); fixture.rollbackUpdateCenter.mockResolvedValue({task: {id: 'task-1'}});
    await render(<UpdateCenter />);
    await act(async () => field('Deploy source', 'select').props.onChange({target: {value: 'docker-hub-tag'}}));
    await click('ui.about.deploy');
    expect(fixture.deployUpdateCenter).toHaveBeenCalledWith({source: 'docker-hub-tag', targetTag: 'v1.4.3', targetDigest: 'sha256:abc'});
    await act(async () => field('Historical revision', 'select').props.onChange({target: {value: '7'}}));
    await click('ui.about.rollback');
    expect(fixture.rollbackUpdateCenter).toHaveBeenCalledWith({targetRevision: '7'});
    expect(JSON.stringify(renderer!.toJSON())).toContain('real deployment log');
  });
});
