export interface ProxyFilters { page: number; pageSize: number; status: string; search?: string; client?: string; siteId?: string; from?: string; to?: string }
export function localDayBoundary(value: string, end: boolean): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  // The backend applies an exclusive '< to' boundary and stores whole seconds.
  // Advance a local calendar day (not 24h) so DST days and the final second remain included.
  if (end && Number.isFinite(date.getTime())) date.setDate(date.getDate() + 1);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
export function proxyQuery(p: ProxyFilters): string {
  const q = new URLSearchParams({ view: "query", limit: String(p.pageSize), offset: String((p.page - 1) * p.pageSize) });
  if (p.status !== "all") q.set("status", p.status === "success" ? "success" : "failed");
  if (p.search?.trim()) q.set("search", p.search.trim());
  if (p.client?.trim()) q.set("client", p.client.trim());
  if (p.siteId) q.set("siteId", p.siteId);
  const from = localDayBoundary(p.from ?? "", false); const to = localDayBoundary(p.to ?? "", true);
  if (from) q.set("from", from); if (to) q.set("to", to);
  return q.toString();
}
export function proxyMetaQuery(query: string): string {
  const params = new URLSearchParams(query);
  params.set("view", "meta"); params.delete("limit"); params.delete("offset"); params.delete("refresh");
  return params.toString();
}
export interface DebugSettings { proxyDebugTraceEnabled: boolean; proxyDebugCaptureHeaders: boolean; proxyDebugCaptureBodies: boolean; proxyDebugCaptureStreamChunks: boolean; proxyDebugTargetSessionId: string; proxyDebugTargetClientKind: string; proxyDebugTargetModel: string; proxyDebugRetentionHours: number; proxyDebugMaxBodyBytes: number }
export function normalizeDebugSettings(raw: Partial<DebugSettings>): DebugSettings {
  return { proxyDebugTraceEnabled: !!raw.proxyDebugTraceEnabled, proxyDebugCaptureHeaders: raw.proxyDebugCaptureHeaders !== false, proxyDebugCaptureBodies: !!raw.proxyDebugCaptureBodies, proxyDebugCaptureStreamChunks: !!raw.proxyDebugCaptureStreamChunks, proxyDebugTargetSessionId: raw.proxyDebugTargetSessionId ?? "", proxyDebugTargetClientKind: raw.proxyDebugTargetClientKind ?? "", proxyDebugTargetModel: raw.proxyDebugTargetModel ?? "", proxyDebugRetentionHours: raw.proxyDebugRetentionHours ?? 24, proxyDebugMaxBodyBytes: raw.proxyDebugMaxBodyBytes ?? 262144 };
}
export function debugSettingsPayload(settings: DebugSettings): DebugSettings {
  if (!Number.isInteger(settings.proxyDebugRetentionHours) || settings.proxyDebugRetentionHours < 1 || !Number.isInteger(settings.proxyDebugMaxBodyBytes) || settings.proxyDebugMaxBodyBytes < 1024) throw new Error("invalid-debug-limits");
  return { ...settings, proxyDebugTargetSessionId: settings.proxyDebugTargetSessionId.trim(), proxyDebugTargetClientKind: settings.proxyDebugTargetClientKind.trim(), proxyDebugTargetModel: settings.proxyDebugTargetModel.trim() };
}
