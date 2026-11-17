// @vitest-environment jsdom
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), showToast: vi.fn() }));
vi.mock('../../lib/client', () => ({
  apiGet: transport.get,
  apiPost: transport.post,
  apiPut: transport.put,
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('../../contexts/LangContext', () => ({ useLang: () => ({ lang: 'en' }) }));
vi.mock('../../i18n/useUiText', () => ({ useUiText: () => (key: string) => key }));
vi.mock('../../components/Toast', () => ({ useToast: () => ({ showToast: transport.showToast }) }));
vi.mock('lucide-react', () => Object.fromEntries(
  ['CheckCircle2', 'ExternalLink', 'Globe', 'Pencil', 'Plus', 'Radio', 'Search', 'Server', 'ShieldAlert', 'X', 'XCircle']
    .map((name) => [name, () => null]),
));

import Sites from '../Sites';

let renderer: ReactTestRenderer;
let storedSite: Record<string, unknown>;
let disabledModels: string[];

beforeEach(() => {
  vi.clearAllMocks();
  storedSite = {
    id: 7, name: 'Probe Site', platform: 'new-api', url: 'https://probe.example.com',
    status: 'active', totalBalance: 0, accountCount: 1,
    postRefreshProbeEnabled: true, postRefreshProbeScope: 'single', postRefreshProbeModel: 'gpt-4o-mini',
  };
  disabledModels = [];
  transport.get.mockImplementation(async (url: string) => {
    if (url === '/api/sites') return [{ ...storedSite }];
    if (url === '/api/sites/7/disabled-models') return { models: [...disabledModels] };
    if (url === '/api/sites/7/available-models') return { models: [] };
    throw new Error(`Unexpected GET ${url}`);
  });
  transport.put.mockImplementation(async (url: string, payload: Record<string, unknown>) => {
    if (url === '/api/sites/7') {
      storedSite = { ...storedSite, ...payload };
      return { ...storedSite };
    }
    if (url === '/api/sites/7/disabled-models') {
      disabledModels = [...payload.models as string[]];
      return { success: true };
    }
    throw new Error(`Unexpected PUT ${url}`);
  });
  transport.post.mockResolvedValue({ success: true });
});
afterEach(() => { act(() => renderer?.unmount()); });

async function click(label: string) {
  await act(async () => {
    await renderer.root.findAllByType('button').find((node) => node.children.includes(label))!.props.onClick();
  });
}

async function openEdit() {
  await act(async () => { renderer = create(<Sites />); });
  await click('Edit');
}

function radio(value: string) {
  return renderer.root.findAllByType('input').find((node) => node.props.type === 'radio' && node.props.value === value)!;
}

function modelInput() {
  return renderer.root.findAllByType('input').find((node) => node.props.placeholder === 'ui.sites.probe_model_ph')!;
}

function autoProbe() {
  return renderer.root.findByProps({ 'aria-label': 'ui.sites.probe_enabled' });
}

function savedPayload() {
  return transport.put.mock.calls.find(([url]) => url === '/api/sites/7')?.[1];
}

describe('site editor probe scope', () => {
  it('loads the saved model, scope and auto-probe switch through the API mapper', async () => {
    await openEdit();
    expect(radio('single').props.checked).toBe(true);
    expect(radio('all').props.checked).toBe(false);
    expect(modelInput().props.value).toBe('gpt-4o-mini');
    expect(autoProbe().props.checked).toBe(true);
  });

  it('saves a trimmed model with single scope and reloads it on reopening', async () => {
    await openEdit();
    await act(async () => { modelInput().props.onChange({ target: { value: ' gpt-4o ' } }); });
    await click('ui.common.save');
    expect(savedPayload()).toMatchObject({
      postRefreshProbeEnabled: true, postRefreshProbeScope: 'single', postRefreshProbeModel: 'gpt-4o',
    });
    await click('Edit');
    expect(modelInput().props.value).toBe('gpt-4o');
  });

  it('preserves a saved all scope while editing another field', async () => {
    storedSite.postRefreshProbeScope = 'all';
    await openEdit();
    expect(radio('all').props.checked).toBe(true);
    await click('ui.common.save');
    expect(savedPayload()).toMatchObject({ postRefreshProbeScope: 'all', postRefreshProbeModel: 'gpt-4o-mini' });
  });

  it('saves all scope without losing the single-model value', async () => {
    await openEdit();
    await act(async () => { radio('all').props.onChange(); });
    expect(renderer.root.findAllByType('input').some((node) => node.props.placeholder === 'ui.sites.probe_model_ph')).toBe(false);
    await click('ui.common.save');
    expect(savedPayload()).toMatchObject({ postRefreshProbeScope: 'all', postRefreshProbeModel: 'gpt-4o-mini' });
  });

  it('can turn off auto probing without discarding scope or model', async () => {
    await openEdit();
    await act(async () => { autoProbe().props.onChange({ target: { checked: false } }); });
    await click('ui.common.save');
    expect(savedPayload()).toMatchObject({
      postRefreshProbeEnabled: false, postRefreshProbeScope: 'single', postRefreshProbeModel: 'gpt-4o-mini',
    });
  });

  it('clears the saved model when left blank so the backend uses its fallback', async () => {
    await openEdit();
    await act(async () => { modelInput().props.onChange({ target: { value: '   ' } }); });
    await click('ui.common.save');
    expect(savedPayload().postRefreshProbeModel).toBe('');
  });

  it('uses the unsaved model choice for manual probing even with auto probing off', async () => {
    storedSite.postRefreshProbeEnabled = false;
    await openEdit();
    await act(async () => { modelInput().props.onChange({ target: { value: ' gpt-4o ' } }); });
    await click('ui.sites.probe');
    expect(transport.post).toHaveBeenCalledWith('/api/sites/7/probe-now', { scope: 'single', modelName: 'gpt-4o' });
    expect(transport.put).not.toHaveBeenCalled();
  });

  it('does not send a model restriction when manually probing all models', async () => {
    await openEdit();
    await act(async () => { radio('all').props.onChange(); });
    await click('ui.sites.probe');
    expect(transport.post).toHaveBeenCalledWith('/api/sites/7/probe-now', { scope: 'all' });
  });

  it('preserves models flagged by a probe when saving only probe settings', async () => {
    transport.post.mockImplementation(async () => {
      disabledModels.push('gpt-unsupported');
      return { success: true };
    });
    await openEdit();
    await click('ui.sites.probe');
    await click('ui.common.save');
    expect(disabledModels).toEqual(['gpt-unsupported']);
    expect(transport.put.mock.calls.filter(([url]) => url.endsWith('/disabled-models'))).toHaveLength(0);
  });

  it('still allows the operator to explicitly clear the disabled-model list', async () => {
    disabledModels = ['gpt-unsupported'];
    await openEdit();
    await click('Enable all');
    await click('ui.common.save');
    expect(disabledModels).toEqual([]);
    expect(transport.put).toHaveBeenCalledWith('/api/sites/7/disabled-models', { models: [] });
  });

  it('does not show edit-only probe settings on create', async () => {
    await act(async () => { renderer = create(<Sites />); });
    await click('ui.sites.add');
    expect(renderer.root.findAllByType('input').some((node) => node.props.type === 'radio')).toBe(false);
  });
});
