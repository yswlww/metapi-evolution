import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import Models from '../pages/Models';

vi.mock('react-router-dom', () => ({ useLocation: () => ({ search: '?focusModel=fixture-model' }) }));
vi.mock('../contexts/LangContext', () => ({ useLang: () => ({ lang: 'en' }) }));
vi.mock('../i18n/useUiText', () => ({ useUiText: () => (key: string) => key }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('lucide-react', () => ({ Box: () => null, Boxes: () => null, Layers: () => null, RefreshCw: () => null, Table: () => null, LayoutGrid: () => null, Search: () => null }));
vi.mock('../lib/source', () => ({
  DATA_MODE: 'api',
  fetchModelsMarketplace: async () => ({ models: [
    { name: 'fixture-model', accounts: [], pricingSources: [] },
    { name: 'fixture-model-plus', accounts: [], pricingSources: [] },
  ] }),
}));

it('an exact model search destination focuses the target rather than substring matches', async () => {
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(<Models />); });
  const headings = renderer!.root.findAllByType('h3').map(node => node.children.join(''));
  expect(headings).toContain('fixture-model');
  expect(headings).not.toContain('fixture-model-plus');
  expect(renderer!.root.findAllByType('input').some(node => node.props.value === 'fixture-model')).toBe(true);
  act(() => renderer!.unmount());
});
