export interface MonitorOverview {
  accounts: { total: number; healthy: number; unhealthy: number; unknown: number; disabled: number; expired: number; problemItems: Array<{ id: number; username: string | null; siteName?: string; status: string | null; runtimeHealth?: { state?: string; reason?: string; checkedAt?: string | null } }> };
  sites: { total: number; active: number; disabled: number };
  routes: { total: number; enabled: number; disabled: number; zeroEnabledChannels: number; cooldownChannels: number; problemItems: Array<{ id: number; title: string; modelPattern: string; channelCount: number; enabledChannelCount: number; cooldownChannelCount: number; failedChannelCount: number; siteNames: string[]; decisionRefreshedAt?: string | null }> };
  traffic24h: { total: number; success: number; failed: number; retried: number; successRate: number; averageLatencyMs: number | null; recentFailures: Array<{ id: number; modelRequested: string | null; modelActual: string | null; siteName: string | null; accountUsername: string | null; httpStatus: number | null; errorMessage: string | null; createdAt: string | null }> } | null;
}
