import { apiGet, apiPost, apiPut } from "./client";
import type { RouteDraft, RouteDecision, DecisionTask } from "./routesParity";
import { buildRoutePayload } from "./routesParity";

/** Preserve explicit-group source identities using the existing authenticated transport. */
export async function saveParityRoute(id: number | null, draft: RouteDraft): Promise<void> {
  const payload = buildRoutePayload(draft);
  if (id === null) await apiPost("/api/routes", payload);
  else await apiPut(`/api/routes/${id}`, payload);
}
export function fetchRouteModelCatalog() {
  return apiGet<{models:Record<string,unknown>; endpointTypesByModel?:Record<string,string[]>}>("/api/models/token-candidates");
}
export async function fetchRouteWideDecision(routeId:number):Promise<RouteDecision | null> {
  const response = await apiPost<{decisions:Record<string,RouteDecision>}>("/api/routes/decision/route-wide/batch", {routeIds:[routeId]});
  return response.decisions[String(routeId)] ?? null;
}
export async function fetchRouteModelDecision(routeId:number, model:string):Promise<RouteDecision | null> {
  const response = await apiPost<{decisions:Record<string,Record<string,RouteDecision>>}>("/api/routes/decision/by-route/batch", {items:[{routeId,model}]});
  return response.decisions[String(routeId)]?.[model] ?? null;
}
export function refreshRouteDecisionTask() {
  return apiPost<{jobId:string; status:string; queued:boolean; reused:boolean}>("/api/routes/decision/refresh", {});
}
export async function fetchRouteDecisionTask(id:string):Promise<DecisionTask> {
  const response = await apiGet<{task:DecisionTask}>(`/api/tasks/${encodeURIComponent(id)}`);
  return response.task;
}
