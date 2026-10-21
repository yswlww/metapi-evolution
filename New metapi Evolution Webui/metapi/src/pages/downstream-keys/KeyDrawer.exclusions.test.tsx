// @vitest-environment jsdom
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KeyDrawer from './KeyDrawer';
import { DOWNSTREAM_KEYS } from '../../data/prototype';

const transport = vi.hoisted(() => ({ sites: [{ id: 8, name: 'First upstream' }, { id: 9, name: 'Second upstream' }], save: vi.fn() }));
vi.mock('lucide-react', () => ({ X: () => null }));
vi.mock('../../contexts/LangContext', () => ({ useLang: () => ({ lang: 'en' }) }));
vi.mock('../../i18n/useUiText', () => ({ useUiText: () => (key: string) => key }));
vi.mock('../../components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../lib/client', () => ({ apiGet: async (path: string) => path === '/api/accounts' ? { accounts: [] } : [] }));
vi.mock('../../lib/source', () => ({
  DATA_MODE: 'api',
  fetchSites: async () => transport.sites,
  fetchRoutes: async () => [],
  fetchModelsMarketplace: async () => ({ models: [] }),
  createDownstreamApiKey: transport.save,
  updateDownstreamApiKey: transport.save,
}));

let renderer: ReactTestRenderer;
afterEach(() => { act(() => renderer?.unmount()); });
beforeEach(() => { vi.clearAllMocks(); });
async function open(excludedSiteIds: number[]) {
  const key = { ...DOWNSTREAM_KEYS[0], id: '1', excludedSiteIds, supportedModels: ['fixture-model'], excludedCredentialRefs: [] };
  await act(async () => { renderer = create(<KeyDrawer mode={{ id: '1' }} keysSource={[key]} onClose={() => {}} onFlash={() => {}} onSaved={async () => {}} />); });
}

it('warns when exclusions block every known site without silently granting access', async () => {
  await open([8, 9]);
  const warnings = renderer.root.findAllByProps({ role: 'alert' });
  expect(warnings).toHaveLength(1);
  expect(warnings[0].children.join('')).toMatch(/all.*sites.*excluded/i);
  expect(transport.save).not.toHaveBeenCalled();
});

it('does not claim all sites are blocked when an upstream is still allowed', async () => {
  await open([8]);
  expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
});
