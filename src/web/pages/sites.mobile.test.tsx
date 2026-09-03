import type { ReactNode } from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ToastProvider } from '../components/Toast.js';
import Sites from './Sites.js';

const { apiMock, toastMock } = vi.hoisted(() => ({
  apiMock: {
    addSite: vi.fn(),
    getSites: vi.fn(),
  },
  toastMock: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    toast: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({ api: apiMock }));
vi.mock('../components/Toast.js', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => children,
  useToast: () => toastMock,
}));

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openSiteEditor(root: ReactTestRenderer) {
  const openAddButton = root.root.find((node) => (
    node.type === 'button'
    && typeof node.props.onClick === 'function'
    && typeof node.props.className === 'string'
    && node.props.className.includes('btn btn-primary')
    && JSON.stringify(node.props.children).includes('添加站点')
  ));
  await act(async () => {
    openAddButton.props.onClick();
  });
  await flushMicrotasks();
}

async function setInput(input: any, value: string) {
  await act(async () => {
    input.props.onChange({ target: { value } });
  });
  await flushMicrotasks();
}


describe('Sites mobile layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes mobile-card usage in Sites page', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/pages/Sites.tsx'), 'utf8');
    expect(source).toContain('mobile-card');
  });

  it('includes a constrained site concurrency input and help text', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/pages/Sites.tsx'), 'utf8');
    expect(source).toContain('<span>站点最大并发</span>');
    expect(source).toContain('type="number"');
    expect(source).toContain('min={0}');
    expect(source).toContain('max={10000}');
    expect(source).toContain('step={1}');
    expect(source).toContain('value={form.maxConcurrency}');
    expect(source).toContain('0 表示不限制；该限制按每个 Metapi 进程计算。');
  });

  it('rejects invalid fractional and over-limit site concurrency before saving', async () => {
    apiMock.getSites.mockResolvedValue([]);
    let root!: ReactTestRenderer;
    try {
      await act(async () => {
        root = create(
          <MemoryRouter initialEntries={['/sites']}>
            <ToastProvider><Sites /></ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();
      await openSiteEditor(root);

      const nameInput = root.root.findByProps({ placeholder: '站点名称' });
      const urlInput = root.root.findByProps({ 'data-testid': 'site-primary-url-input' });
      await setInput(nameInput, 'invalid-concurrency-site');
      await setInput(urlInput, 'https://invalid-concurrency-site.example.com');

      const concurrencyInput = root.root.findAll((node) => (
        node.type === 'input' && node.props.value === '0' && node.props.min === 0 && node.props.max === 10000
      )).at(-1);
      expect(concurrencyInput).toBeTruthy();
      const saveButton = root.root.findAll((node) => (
        node.type === 'button'
        && typeof node.props.className === 'string'
        && node.props.className.includes('btn btn-primary')
      )).at(-1);

      expect(saveButton).toBeTruthy();
      await setInput(concurrencyInput, '1.5');
      await act(async () => { saveButton!.props.onClick(); });
      expect(toastMock.error).toHaveBeenLastCalledWith('Invalid maxConcurrency. Expected an integer from 0 to 10000.');
      expect(apiMock.addSite).not.toHaveBeenCalled();

      await setInput(concurrencyInput, '10001');
      await act(async () => { saveButton!.props.onClick(); });
      expect(toastMock.error).toHaveBeenLastCalledWith('Invalid maxConcurrency. Expected an integer from 0 to 10000.');
      expect(apiMock.addSite).not.toHaveBeenCalled();
    } finally {
      root?.unmount();
    }
  });
});
