import { isExactTokenRouteModelPattern, matchesTokenRouteModelPattern } from "../../../../src/shared/tokenRoutePatterns.js";

export const ROUTING_STRATEGIES = ["weighted", "round_robin", "stable_first"] as const;
export type RoutingStrategy = typeof ROUTING_STRATEGIES[number];
export type RouteMode = "pattern" | "explicit_group";
export interface ChannelRow {
  id: number; routeId: number; accountId: number; tokenId?: number | null; sourceModel?: string | null;
  priority: number; weight: number; enabled: boolean;
  successCount?:number; failCount?:number; totalLatencyMs?:number; totalCost?:number;
  account?: {id: number; username?: string}; site?: {id: number; name?: string}; token?: {id: number; name?: string};
  username?: string; siteName?: string; tokenName?: string;
}
export interface RouteRow {
  id: number; modelPattern: string; displayName?: string | null; routeMode?: string; sourceRouteIds?: number[];
  routingStrategy?: string; enabled: boolean; channels?: ChannelRow[]; siteNames?: string[];
  channelCount?: number; endpointTypes?: string[]; brand?: string;
  decisionSnapshot?:RouteDecision|null; decisionRefreshedAt?:string|null;
}
export interface RouteDraft {
  modelPattern: string; displayName: string; routeMode: RouteMode; sourceRouteIds: number[]; strategy: string; enabled: boolean;
}
export function sourceRouteOptions<T extends {id: number; modelPattern: string; routeMode?: string}>(routes: T[], selfId?: number): T[] {
  return routes.filter(r => r.id !== selfId && r.routeMode !== "explicit_group" && isExactTokenRouteModelPattern(r.modelPattern));
}
export function buildRoutePayload(draft: RouteDraft) {
  const displayName = draft.displayName.trim();
  const modelPattern = draft.routeMode === "explicit_group" ? displayName : draft.modelPattern.trim();
  const sourceRouteIds = [...new Set(draft.sourceRouteIds)].sort((a,b) => a-b);
  if (!modelPattern || (draft.routeMode === "explicit_group" && !sourceRouteIds.length)) throw new Error("invalidRoute");
  if (!ROUTING_STRATEGIES.includes(draft.strategy as RoutingStrategy)) throw new Error("invalidStrategy");
  if (sourceRouteIds.some(id => !Number.isInteger(id) || id <= 0)) throw new Error("invalidRoute");
  return {modelPattern, displayName, routeMode: draft.routeMode, ...(draft.routeMode === "explicit_group" ? {sourceRouteIds} : {}), routingStrategy: draft.strategy as RoutingStrategy, enabled: draft.enabled};
}
export interface ChannelDraft { tokenId: string; sourceModel: string; priority: string; weight: string }
export function buildChannelPayload(draft: ChannelDraft) {
  const priority = Number(draft.priority), weight = Number(draft.weight);
  const tokenId = draft.tokenId === "" ? null : Number(draft.tokenId);
  if (!draft.priority.trim() || !Number.isInteger(priority) || priority < 0 || !draft.weight.trim() || !Number.isFinite(weight) || weight < 0 || (tokenId !== null && (!Number.isInteger(tokenId) || tokenId <= 0))) throw new Error("invalidChannel");
  return {tokenId, sourceModel: draft.sourceModel.trim() || null, priority, weight};
}
/** Move a whole priority bucket. Never turn tied channels into separate priorities. */
export function movePriorityBucket<T extends {id:number; priority:number}>(channels: T[], channelId: number, direction: -1 | 1) {
  const channel = channels.find(c => c.id === channelId);
  if (!channel) return [];
  const priorities = [...new Set(channels.map(c => c.priority))].sort((a,b) => a-b);
  const index = priorities.indexOf(channel.priority), target = priorities[index + direction];
  if (target === undefined) return [];
  return channels.filter(c => c.priority === channel.priority || c.priority === target).map(c => ({id:c.id, priority:c.priority === target ? channel.priority : target}));
}
export function routeModels(route: RouteRow, routes: RouteRow[]): string[] {
  return route.routeMode === "explicit_group" ? (route.sourceRouteIds ?? []).flatMap(id => routes.find(r => r.id === id)?.modelPattern ?? []) : [route.modelPattern];
}
export function routeBrand(model: string): string {
  const value = model.toLowerCase();
  if (/^(gpt|o[1-9]|chatgpt|dall-e)/.test(value)) return "OpenAI";
  if (value.startsWith("claude")) return "Anthropic";
  if (value.startsWith("gemini")) return "Google";
  if (value.startsWith("deepseek")) return "DeepSeek";
  if (/^(qwen|qwq)/.test(value)) return "Qwen";
  if (value.startsWith("llama")) return "Meta";
  if (/^(mistral|mixtral|codestral)/.test(value)) return "Mistral";
  return "other";
}
export type RouteFilters = {search:string; status:string; mode:string; site:string; brand:string; capability:string; group:string; sort:string};
export function filterRoutes<T extends RouteRow>(routes: T[], filters: RouteFilters): T[] {
  const q = filters.search.trim().toLowerCase();
  return routes.filter(r => {
    const models = routeModels(r, routes);
    const sites = r.siteNames ?? (r.channels ?? []).map(c => c.site?.name ?? c.siteName ?? "");
    return (!q || `${r.modelPattern} ${r.displayName ?? ""} ${models.join(" ")}`.toLowerCase().includes(q))
      && (!filters.status || r.enabled === (filters.status === "enabled"))
      && (!filters.mode || (r.routeMode ?? "pattern") === filters.mode)
      && (!filters.site || sites.includes(filters.site))
      && (!filters.brand || models.some(m => routeBrand(m) === filters.brand || m.toLowerCase().startsWith(filters.brand.toLowerCase())))
      && (!filters.capability || (r.endpointTypes ?? []).includes(filters.capability))
      && (!filters.group || String(r.id) === filters.group);
  }).sort((a,b) => {
    const names = (a.displayName || a.modelPattern).localeCompare(b.displayName || b.modelPattern);
    if (filters.sort === "channels") return (b.channelCount ?? b.channels?.length ?? 0) - (a.channelCount ?? a.channels?.length ?? 0) || names || a.id-b.id;
    return (filters.sort === "name_desc" ? -names : names) || a.id-b.id;
  });
}
export function modelMatchesRoute(model:string, pattern:string):boolean {
  return matchesTokenRouteModelPattern(model,pattern);
}
export function decorateRouteCapabilities(routes:RouteRow[], endpointTypes:Record<string,string[]>):RouteRow[] {
  return routes.map(route => ({...route, endpointTypes:[...new Set(routeModels(route,routes).flatMap(pattern=>Object.entries(endpointTypes).filter(([model])=>modelMatchesRoute(model,pattern)).flatMap(([,types])=>types)))]}));
}
export interface DecisionCandidate {channelId:number; username:string; siteName:string; tokenName:string; priority:number; weight:number; eligible:boolean; probability:number; reason:string}
export interface RouteDecision {requestedModel:string; actualModel:string; matched:boolean; summary:string[]; candidates:DecisionCandidate[]}
export interface DecisionTask {id:string; status:string; error?:string|null; logs?:Array<{message?:string}>; result?:unknown}
