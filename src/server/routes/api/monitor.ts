import { FastifyInstance } from 'fastify';
import { db, schema } from '../../db/index.js';
import { gte } from 'drizzle-orm';
import { createRateLimitGuard } from '../../middleware/requestRateLimit.js';
import { getAccountsSnapshot } from '../../services/accountsOverviewService.js';

const limitMonitorOverviewRead = createRateLimitGuard({
  bucket: 'monitor-overview-read',
  max: 30,
  windowMs: 60_000,
});

function roundNumber(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isWithin24h(createdAt: string | null | undefined, nowMs: number): boolean {
  if (!createdAt) return false;
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= nowMs - 24 * 60 * 60 * 1000 && timestamp <= nowMs;
}

function isCooldownActive(value: string | null | undefined, nowMs: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > nowMs;
}

async function buildMonitorOverview(refresh: boolean) {
  const now = new Date();
  const nowMs = now.getTime();
  const recentLogCutoffIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const [accountsSnapshot, routes, channels, proxyLogs] = await Promise.all([
    getAccountsSnapshot({ forceRefresh: refresh }),
    db.select().from(schema.tokenRoutes).all(),
    db.select().from(schema.routeChannels).all(),
    db.select().from(schema.proxyLogs).where(gte(schema.proxyLogs.createdAt, recentLogCutoffIso)).all(),
  ]);
  const { accounts, sites } = accountsSnapshot.payload;

  const siteById = new Map(sites.map((site) => [site.id, site]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const channelsByRouteId = new Map<number, typeof channels>();
  for (const channel of channels) {
    if (!channelsByRouteId.has(channel.routeId)) channelsByRouteId.set(channel.routeId, [] as typeof channels);
    channelsByRouteId.get(channel.routeId)!.push(channel);
  }

  const accountSummary = {
    total: accounts.length,
    healthy: 0,
    unhealthy: 0,
    unknown: 0,
    disabled: 0,
    expired: 0,
    problemItems: [] as Array<{
      id: number;
      username: string | null;
      siteId: number;
      siteName: string;
      status: string | null;
      runtimeHealth: {
        state: string;
        reason: string;
        source?: string;
        checkedAt?: string | null;
      };
    }>,
  };

  for (const account of accounts) {
    const state = account.runtimeHealth?.state || 'unknown';
    if (state === 'healthy') accountSummary.healthy += 1;
    else if (state === 'unhealthy' || state === 'degraded') accountSummary.unhealthy += 1;
    else if (state === 'disabled') accountSummary.disabled += 1;
    else accountSummary.unknown += 1;

    if (account.status === 'expired') accountSummary.expired += 1;
    if (state !== 'healthy') {
      accountSummary.problemItems.push({
        id: account.id,
        username: account.username,
        siteId: account.siteId,
        siteName: account.site?.name || siteById.get(account.siteId)?.name || '未知站点',
        status: account.status,
        runtimeHealth: {
          state,
          reason: account.runtimeHealth?.reason || '尚未检测',
          source: account.runtimeHealth?.source,
          checkedAt: account.runtimeHealth?.checkedAt,
        },
      });
    }
  }

  const routeProblemItems: Array<{
    id: number;
    title: string;
    modelPattern: string;
    enabled: boolean;
    channelCount: number;
    enabledChannelCount: number;
    cooldownChannelCount: number;
    failedChannelCount: number;
    siteNames: string[];
    decisionRefreshedAt: string | null;
  }> = [];
  let enabledRoutes = 0;
  let zeroEnabledChannels = 0;
  let cooldownChannels = 0;

  for (const route of routes) {
    if (route.enabled) enabledRoutes += 1;
    const routeChannels = channelsByRouteId.get(route.id) || [];
    const enabledChannelCount = routeChannels.filter((channel) => {
      if (channel.enabled === false) return false;
      const account = accountById.get(channel.accountId);
      if (!account || account.status === 'disabled' || account.status === 'expired') return false;
      const site = account.site || siteById.get(account.siteId);
      return site?.status !== 'disabled';
    }).length;
    const routeCooldownCount = routeChannels.filter((channel) => isCooldownActive(channel.cooldownUntil, nowMs)).length;
    const failedChannelCount = routeChannels.filter((channel) => Number(channel.failCount || 0) > 0 || Number(channel.consecutiveFailCount || 0) > 0).length;
    cooldownChannels += routeCooldownCount;
    if (route.enabled && enabledChannelCount === 0) zeroEnabledChannels += 1;

    const siteNames = Array.from(new Set<string>(routeChannels.map((channel) => {
      const account = accountById.get(channel.accountId);
      return account?.site?.name || (account ? siteById.get(account.siteId)?.name : null) || null;
    }).filter((name): name is string => !!name)));

    if ((route.enabled && enabledChannelCount === 0) || routeCooldownCount > 0 || failedChannelCount > 0) {
      routeProblemItems.push({
        id: route.id,
        title: route.displayName || route.modelPattern,
        modelPattern: route.modelPattern,
        enabled: !!route.enabled,
        channelCount: routeChannels.length,
        enabledChannelCount,
        cooldownChannelCount: routeCooldownCount,
        failedChannelCount,
        siteNames,
        decisionRefreshedAt: route.decisionRefreshedAt,
      });
    }
  }

  const recentLogs = proxyLogs.filter((log) => isWithin24h(log.createdAt, nowMs));
  const totalLatencyRows = recentLogs.filter((log) => typeof log.latencyMs === 'number' && Number.isFinite(log.latencyMs));
  const success = recentLogs.filter((log) => log.status === 'success').length;
  const failed = recentLogs.filter((log) => log.status === 'failed').length;
  const retried = recentLogs.filter((log) => log.status === 'retried').length;
  const recentFailures = recentLogs
    .filter((log) => log.status === 'failed')
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
    .slice(0, 10)
    .map((log) => {
      const account = log.accountId == null ? null : accountById.get(log.accountId);
      return {
        id: log.id,
        modelRequested: log.modelRequested,
        modelActual: log.modelActual,
        siteName: account?.site?.name || (account ? siteById.get(account.siteId)?.name : null) || null,
        accountUsername: account?.username || null,
        httpStatus: log.httpStatus,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt,
      };
    });

  return {
    generatedAt: now.toISOString(),
    accounts: accountSummary,
    sites: {
      total: sites.length,
      active: sites.filter((site) => site.status !== 'disabled').length,
      disabled: sites.filter((site) => site.status === 'disabled').length,
    },
    routes: {
      total: routes.length,
      enabled: enabledRoutes,
      disabled: routes.length - enabledRoutes,
      zeroEnabledChannels,
      cooldownChannels,
      problemItems: routeProblemItems,
    },
    traffic24h: {
      total: recentLogs.length,
      success,
      failed,
      retried,
      successRate: recentLogs.length > 0 ? roundNumber((success / recentLogs.length) * 100, 2) : 0,
      averageLatencyMs: totalLatencyRows.length > 0
        ? Math.round(totalLatencyRows.reduce((sum, log) => sum + Number(log.latencyMs || 0), 0) / totalLatencyRows.length)
        : null,
      totalCost: roundNumber(recentLogs.reduce((sum, log) => sum + Number(log.estimatedCost || 0), 0), 6),
      totalTokens: recentLogs.reduce((sum, log) => sum + Number(log.totalTokens || 0), 0),
      recentFailures,
    },
  };
}

export async function monitorRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { refresh?: string } }>(
    '/api/monitor/overview',
    { preHandler: [limitMonitorOverviewRead] },
    async (request) => buildMonitorOverview(request.query?.refresh === '1'),
  );
}
