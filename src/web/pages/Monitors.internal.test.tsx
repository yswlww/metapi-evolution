import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ToastProvider } from '../components/Toast.js';
import Monitors from './Monitors.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getMonitorOverview: vi.fn(),
    refreshAccountHealth: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({
  api: apiMock,
}));

function buildOverview(overrides: any = {}) {
  return {
    generatedAt: '2026-06-06T00:00:00.000Z',
    accounts: {
      total: 3,
      healthy: 2,
      unhealthy: 1,
      unknown: 0,
      disabled: 0,
      expired: 0,
      problemItems: [],
    },
    sites: {
      total: 2,
      active: 2,
      disabled: 0,
    },
    routes: {
      total: 4,
      enabled: 3,
      disabled: 1,
      zeroEnabledChannels: 0,
      cooldownChannels: 0,
      problemItems: [],
    },
    traffic24h: {
      total: 10,
      success: 8,
      failed: 2,
      retried: 0,
      successRate: 80,
      averageLatencyMs: 188,
      totalCost: 0.123456,
      totalTokens: 12345,
      recentFailures: [],
    },
    ...overrides,
  };
}

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
    await Promise.resolve();
  });
}

function renderMonitors() {
  return create(
    <MemoryRouter>
      <ToastProvider>
        <Monitors />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Monitors internal dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getMonitorOverview.mockResolvedValue(buildOverview());
    apiMock.refreshAccountHealth.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders internal monitor title and summary cards', async () => {
    let root: any;
    await act(async () => {
      root = renderMonitors();
    });
    await flushMicrotasks();

    const text = collectText(root.root);
    expect(text).toContain('实例监控');
    expect(text).toContain('监控当前 Metapi 的站点、账号、路由和请求健康');
    expect(text).toContain('账号健康');
    expect(text).toContain('路由通道');
    expect(text).toContain('近 24h 请求');
    expect(text).toContain('站点状态');
    expect(text).toContain('80%');
  });

  it('renders empty states for internal problem lists', async () => {
    let root: any;
    await act(async () => {
      root = renderMonitors();
    });
    await flushMicrotasks();

    const text = collectText(root.root);
    expect(text).toContain('暂无异常账号');
    expect(text).toContain('暂无风险路由');
    expect(text).toContain('暂无近期失败请求');
  });

  it('refreshes the internal overview with force refresh', async () => {
    let root: any;
    await act(async () => {
      root = renderMonitors();
    });
    await flushMicrotasks();
    apiMock.getMonitorOverview.mockClear();

    const refreshButton = root.root.findAll((node: ReactTestInstance) => (
      node.type === 'button' && collectText(node) === '刷新'
    ))[0];
    await act(async () => {
      refreshButton.props.onClick();
    });
    await flushMicrotasks();

    expect(apiMock.getMonitorOverview).toHaveBeenCalledWith({ refresh: true });
  });

  it('runs account health check and reloads overview', async () => {
    let root: any;
    await act(async () => {
      root = renderMonitors();
    });
    await flushMicrotasks();
    apiMock.getMonitorOverview.mockClear();

    const healthButton = root.root.findAll((node: ReactTestInstance) => (
      node.type === 'button' && collectText(node) === '健康检查'
    ))[0];
    await act(async () => {
      healthButton.props.onClick();
    });
    await flushMicrotasks();

    expect(apiMock.refreshAccountHealth).toHaveBeenCalledWith({ wait: true });
    expect(apiMock.getMonitorOverview).toHaveBeenCalledWith({ refresh: true });
  });

  it('shows a safe error state when overview loading fails', async () => {
    apiMock.getMonitorOverview.mockRejectedValueOnce(new Error('overview failed'));

    let root: any;
    await act(async () => {
      root = renderMonitors();
    });
    await flushMicrotasks();

    const text = collectText(root.root);
    expect(text).toContain('加载实例监控失败');
  });

  it('does not keep external monitor iframe sites in the active monitor page', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/pages/Monitors.tsx'), 'utf8');

    expect(source).not.toContain('check.linux.do');
    expect(source).not.toContain('ldoh.105117.xyz');
    expect(source).not.toContain('<iframe');
  });
});
