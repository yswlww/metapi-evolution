// @vitest-environment jsdom
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ save: vi.fn(), showToast: vi.fn() }));
vi.mock('../../lib/client', () => ({
  apiGet: async () => [],
  apiPost: transport.save,
  apiPut: transport.save,
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ search: '' }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
vi.mock('../../contexts/LangContext', () => ({ useLang: () => ({ lang: 'en' }) }));
vi.mock('../../i18n/useUiText', () => ({ useUiText: () => (key: string) => key }));
// showToast must be a stable reference: Sites lists it as a useEffect
// dependency, so a fresh function each render would loop forever.
vi.mock('../../components/Toast', () => ({ useToast: () => ({ showToast: transport.showToast }) }));
vi.mock('lucide-react', () =>
  Object.fromEntries(
    ['CheckCircle2', 'ExternalLink', 'Globe', 'Pencil', 'Plus', 'Radio', 'Search', 'Server', 'ShieldAlert', 'X', 'XCircle']
      .map((name) => [name, () => null]),
  ),
);
vi.mock('../../lib/source', async () => {
  const actual = await vi.importActual<typeof import('../../lib/source')>('../../lib/source');
  return {
    ...actual,
    fetchSites: async () => [],
    fetchSiteDisabledModels: async () => [],
    detectSite: async () => null,
  };
});

import Sites from '../Sites';

let renderer: ReactTestRenderer;

afterEach(() => { act(() => renderer?.unmount()); });
beforeEach(() => { vi.clearAllMocks(); transport.save.mockResolvedValue({ id: 1 }); });

async function openCreateAndFill(concurrencyValue: string) {
  await act(async () => { renderer = create(<Sites />); });
  await act(async () => {
    renderer.root.findAllByType('button').find((node) => node.children.includes('ui.sites.add'))!.props.onClick();
  });
  const input = (placeholder: string) =>
    renderer.root.findAllByType('input').find((node) => node.props.placeholder === placeholder);
  const fill = async (placeholder: string, value: string) => {
    await act(async () => { input(placeholder)!.props.onChange({ target: { value } }); });
  };
  await fill('New API · Hong Kong', 'Concurrency site');
  await fill('https://api.example.com/v1', 'https://concurrency.example.com');
  await fill('4', concurrencyValue);
}

async function save() {
  await act(async () => {
    await renderer.root.findAllByType('button').find((node) => node.children.includes('ui.common.save'))!.props.onClick();
  });
}

describe('site editor concurrency field', () => {
  it('sends the limit as an integer on the backend contract', async () => {
    await openCreateAndFill('4');
    await save();
    expect(transport.save).toHaveBeenCalledTimes(1);
    expect(transport.save.mock.calls[0][1].maxConcurrency).toBe(4);
  });

  it('sends null when the operator leaves it blank so the site is unlimited', async () => {
    await openCreateAndFill('');
    await save();
    expect(transport.save.mock.calls[0][1].maxConcurrency).toBeNull();
  });

  it('rejects an out-of-range value before any request is issued', async () => {
    await openCreateAndFill('99999');
    await save();
    expect(transport.save).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric value before any request is issued', async () => {
    await openCreateAndFill('abc');
    await save();
    expect(transport.save).not.toHaveBeenCalled();
  });
});
