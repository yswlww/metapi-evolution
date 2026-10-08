import { apiGet, apiPost } from "../../lib/client";
import type { DashboardAnalysis } from "./dashboard";
import type { BackendAnnouncement } from "./announcements";
import { proxyMetaQuery } from "./proxyLogs";
import { eventPageQuery, type BackendEvent } from "./events";
export function fetchDashboardAnalysis(refresh = false) { return apiGet<{ modelAnalysis?: DashboardAnalysis }>(`/api/stats/dashboard?view=insights${refresh ? "&refresh=1" : ""}`); }
export function fetchEventPage(params: { offset: number; limit: number; type?: string; unread?: boolean }) { return apiGet<BackendEvent[]>(`/api/events?${eventPageQuery(params)}`); }
export function fetchAnnouncementPage(offset = 0, limit = 50) { return apiGet<BackendAnnouncement[]>(`/api/site-announcements?limit=${Math.max(1, Math.min(500, Math.trunc(limit)))}&offset=${offset}`); }
export function fetchUnreadCount() { return apiGet<{ count: number }>("/api/events/count"); }
export function refreshAccountHealth() { return apiPost<{ success?: boolean; message?: string }>("/api/accounts/health/refresh", { wait: true }, { timeoutMs: 150_000 }); }
export interface ProxyMeta { clientOptions: Array<{ value: string; label: string }>; sites: Array<{ id: number; name: string }>; summary: { totalCount: number; successCount: number; failedCount: number; totalCost: number; totalTokensAll: number } }
export function fetchProxyPage<T>(query: string) { return apiGet<{ items: T[]; total: number; page: number; pageSize: number }>(`/api/stats/proxy-logs?${query}`); }
export function fetchProxyMeta(query: string) { return apiGet<ProxyMeta>(`/api/stats/proxy-logs?${proxyMetaQuery(query)}`); }
