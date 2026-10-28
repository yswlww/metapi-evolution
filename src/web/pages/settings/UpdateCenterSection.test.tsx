import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ToastProvider } from '../../components/Toast.js';

import UpdateCenterSection from './UpdateCenterSection.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getUpdateCenterStatus: vi.fn(),
    saveUpdateCenterConfig: vi.fn(),
    checkUpdateCenter: vi.fn(),
    deployUpdateCenter: vi.fn(),
    rollbackUpdateCenter: vi.fn(),
    streamUpdateCenterTaskLogs: vi.fn(),
  },
}));

vi.mock('../../api.js', () => ({
  api: apiMock,
}));

function collectText(node: ReactTestInstance): string {
  return (node.children || []).map((child) => {
    if (typeof child === 'string') return child;
    return collectText(child);
  }).join('');
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const ENABLED_CONFIG = {
  enabled: true,
  githubReleasesEnabled: true,
  dockerHubTagsEnabled: true,
  defaultDeploySource: 'github-release' as const,
};

function statusWith(overrides: Record<string, unknown> = {}) {
  return {
    currentVersion: '1.2.3',
    config: ENABLED_CONFIG,
    githubRelease: { normalizedVersion: '1.3.0', displayVersion: '1.3.0', tagName: 'v1.3.0' },
    dockerHubTag: null,
    selfUpgrade: { supported: true, reason: null, arch: 'x64' },
    localUpdate: { state: { phase: 'idle', error: null }, canRollback: true, previousVersion: '1.2.2' },
    ...overrides,
  };
}

describe('UpdateCenterSection', () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getUpdateCenterStatus.mockResolvedValue(statusWith());
    apiMock.streamUpdateCenterTaskLogs.mockImplementation(async (_id, handlers) => handlers.onDone?.({ status: 'succeeded' }));
  });

  afterEach(() => {
    renderer?.unmount();
    renderer = null;
  });

  async function render() {
    await act(async () => {
      renderer = create(
        <ToastProvider>
          <UpdateCenterSection />
        </ToastProvider>,
      );
    });
    await flushMicrotasks();
  }

  function button(label: string) {
    return renderer!.root.findAll((node) => node.type === 'button' && collectText(node).includes(label))[0];
  }

  it('shows the running version and the available upgrade', async () => {
    await render();
    const text = collectText(renderer!.root);
    expect(text).toContain('1.2.3');
    expect(text).toContain('v1.3.0');
    expect(text).toContain('可用');
  });

  it('disables the upgrade control when self-upgrade is unsupported and shows the reason', async () => {
    apiMock.getUpdateCenterStatus.mockResolvedValue(statusWith({
      selfUpgrade: { supported: false, reason: 'no upgrade bundle is published for arm', arch: 'arm' },
    }));
    await render();

    expect(button('升级').props.disabled).toBe(true);
    expect(button('回退到上一版本').props.disabled).toBe(true);
    expect(collectText(renderer!.root)).toContain('no upgrade bundle is published for arm');
  });

  it('deploys the candidate tag and streams the task log', async () => {
    apiMock.deployUpdateCenter.mockResolvedValue({ task: { id: 'task-1' } });
    apiMock.streamUpdateCenterTaskLogs.mockImplementation(async (_id: string, handlers: { onLog?: (entry: { message: string }) => void; onDone?: (payload: { status: string }) => void }) => {
      handlers.onLog?.({ message: 'Switched to 1.3.0' });
      handlers.onDone?.({ status: 'succeeded' });
    });
    apiMock.checkUpdateCenter.mockResolvedValue(statusWith());
    await render();

    await act(async () => { await button('升级').props.onClick(); });
    await flushMicrotasks();

    expect(apiMock.deployUpdateCenter).toHaveBeenCalledWith({
      source: 'github-release',
      targetTag: 'v1.3.0',
      targetDigest: null,
    });
    expect(collectText(renderer!.root)).toContain('Switched to 1.3.0');
  });

  it('rolls back to the previous release without a revision argument', async () => {
    apiMock.rollbackUpdateCenter.mockResolvedValue({ task: { id: 'task-2' } });
    apiMock.checkUpdateCenter.mockResolvedValue(statusWith());
    await render();

    await act(async () => { await button('回退到上一版本').props.onClick(); });
    await flushMicrotasks();

    expect(apiMock.rollbackUpdateCenter).toHaveBeenCalledWith();
  });

  it('saves the trimmed config', async () => {
    apiMock.saveUpdateCenterConfig.mockResolvedValue({ config: { ...ENABLED_CONFIG, enabled: false } });
    await render();

    const checkbox = renderer!.root.findAll((node) => node.type === 'input' && node.props.type === 'checkbox')[0];
    await act(async () => { checkbox.props.onChange({ target: { checked: false } }); });
    await act(async () => { await button('保存配置').props.onClick(); });
    await flushMicrotasks();

    expect(apiMock.saveUpdateCenterConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    const saved = apiMock.saveUpdateCenterConfig.mock.calls[0][0];
    expect(saved.helperBaseUrl).toBeUndefined();
    expect(saved.chartRef).toBeUndefined();
  });
});
