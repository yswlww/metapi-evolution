import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAccountCreatePayload, parseAccountVerifyTokenPayload } from '../../../../../src/server/contracts/accountsRoutePayloads.js';
import Accounts from '../Accounts';

const transport = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), apiResponse: vi.fn() }));
vi.mock('../../lib/client', () => transport);
vi.mock('lucide-react', () => Object.fromEntries(['BadgeCheck', 'Eye', 'EyeOff', 'KeyRound', 'RefreshCw', 'ShieldCheck', 'User', 'Users', 'Server', 'Trash2', 'Wallet', 'Activity', 'Plus', 'Copy', 'Star'].map(name => [name, () => null])));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ search: '?siteId=7&create=1' }) }));
vi.mock('../../contexts/LangContext', () => ({ useLang: () => ({ lang: 'en' }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-fixture', login: vi.fn() }) }));
vi.mock('../../i18n/useUiText', () => ({ useUiText: () => (key: string) => key }));
vi.mock('../../components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

let renderer: ReactTestRenderer;
const button = (text: string) => renderer.root.findAllByType('button').find(node => node.children.includes(text))!;
const changeMode = async (mode: string) => {
  await act(async () => { renderer.root.findAllByType('select').find(node => node.props.value === 'login')!.props.onChange({ target: { value: mode } }); });
};
const fillCredential = async (value: string) => {
  await act(async () => { renderer.root.findAllByType('input').find(node => node.props.placeholder === 'sk-…')!.props.onChange({ target: { value } }); });
};

beforeEach(async () => {
  vi.resetAllMocks();
  transport.apiGet.mockImplementation(async (path: string) => {
    if (path === '/api/sites') return [{ id: 7, name: 'Compatible upstream', platform: 'openai', url: 'https://upstream.example' }];
    if (path.startsWith('/api/accounts')) return { accounts: [] };
    if (path.startsWith('/api/account-tokens')) return [];
    return {};
  });
  transport.apiPost.mockResolvedValue({ id: 42, username: 'fixture', success: true });
  await act(async () => { renderer = create(<Accounts />); });
});
afterEach(() => { act(() => renderer.unmount()); });

describe('upstream account credential form', () => {
  it('submits an API key using the backend creation contract, not the default-key edit field', async () => {
    await changeMode('apikey');
    await fillCredential('  sk-api-fixture  ');
    await act(async () => { await button('ui.common.add').props.onClick(); });
    const request = transport.apiPost.mock.calls.find(([path]) => path === '/api/accounts');
    expect(request).toBeDefined();
    expect(parseAccountCreatePayload(request![1]).success).toBe(true);
    expect(request![1]).toEqual({ siteId: 7, username: undefined, accessToken: 'sk-api-fixture', credentialMode: 'apikey' });
  });

  it('offers verification in API key mode and verifies the key with apikey semantics', async () => {
    await changeMode('apikey');
    await fillCredential(' sk-api-fixture ');
    const verify = button('ui.accounts.verify');
    expect(verify).toBeDefined();
    await act(async () => { await verify.props.onClick(); });
    const request = transport.apiPost.mock.calls.find(([path]) => path === '/api/accounts/verify-token');
    expect(parseAccountVerifyTokenPayload(request![1]).success).toBe(true);
    expect(request![1]).toEqual({ siteId: 7, accessToken: 'sk-api-fixture', credentialMode: 'apikey' });
  });

  it('does not silently treat the session-token field as an API key', async () => {
    await changeMode('token');
    await fillCredential('session-fixture');
    await act(async () => { await button('ui.common.add').props.onClick(); });
    expect(transport.apiPost).toHaveBeenCalledWith('/api/accounts', { siteId: 7, username: undefined, accessToken: 'session-fixture', credentialMode: 'session' });
  });
});
