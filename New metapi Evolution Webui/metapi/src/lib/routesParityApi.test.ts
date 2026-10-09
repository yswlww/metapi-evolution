import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(()=>({apiGet:vi.fn(),apiPost:vi.fn(),apiPut:vi.fn()}));
vi.mock("./client",()=>transport);
import { saveParityRoute, fetchRouteModelCatalog, fetchRouteModelDecision, fetchRouteWideDecision, refreshRouteDecisionTask, fetchRouteDecisionTask } from "./routesParityApi";

beforeEach(()=>{vi.resetAllMocks();});
describe("Routes parity API contracts (mocked transport, no live requests)",()=>{
  it("creates and updates explicit groups with all source identities",async()=>{
    const draft={modelPattern:"old",displayName:"public",routeMode:"explicit_group" as const,sourceRouteIds:[8,2],strategy:"stable_first",enabled:true};
    await saveParityRoute(null,draft);
    expect(transport.apiPost).toHaveBeenCalledWith("/api/routes",{modelPattern:"public",displayName:"public",routeMode:"explicit_group",sourceRouteIds:[2,8],routingStrategy:"stable_first",enabled:true});
    await saveParityRoute(10,{...draft,sourceRouteIds:[2]});
    expect(transport.apiPut).toHaveBeenCalledWith("/api/routes/10",expect.objectContaining({sourceRouteIds:[2],routingStrategy:"stable_first"}));
  });
  it("rejects invalid groups before issuing requests",async()=>{
    await expect(saveParityRoute(null,{modelPattern:"",displayName:"",routeMode:"explicit_group",sourceRouteIds:[],strategy:"weighted",enabled:true})).rejects.toThrow("invalidRoute");
    expect(transport.apiPost).not.toHaveBeenCalled();
  });
  it("loads real endpoint capabilities, not a guessed platform capability",async()=>{
    transport.apiGet.mockResolvedValue({models:{"gpt-4":[]},endpointTypesByModel:{"gpt-4":["chat"]}});
    expect(await fetchRouteModelCatalog()).toEqual({models:{"gpt-4":[]},endpointTypesByModel:{"gpt-4":["chat"]}});
    expect(transport.apiGet).toHaveBeenCalledWith("/api/models/token-candidates");
  });
  it("uses route-wide decisions for selected route and unwraps by route ID",async()=>{
    const decision={matched:true,summary:[],candidates:[]};
    transport.apiPost.mockResolvedValue({decisions:{"12":decision}});
    expect(await fetchRouteWideDecision(12)).toBe(decision);
    expect(transport.apiPost).toHaveBeenCalledWith("/api/routes/decision/route-wide/batch",{routeIds:[12]});
  });
  it("concrete model diagnostics stay scoped to the selected route",async()=>{
    const decision={matched:false,summary:[],candidates:[]};
    transport.apiPost.mockResolvedValue({decisions:{"12":{"gpt-4":decision}}});
    expect(await fetchRouteModelDecision(12,"gpt-4")).toBe(decision);
    expect(transport.apiPost).toHaveBeenCalledWith("/api/routes/decision/by-route/batch",{items:[{routeId:12,model:"gpt-4"}]});
  });
  it("refresh queues a task; job result comes from the task endpoint",async()=>{
    transport.apiPost.mockResolvedValue({jobId:"a/b",queued:true,status:"running",reused:true});
    expect((await refreshRouteDecisionTask()).jobId).toBe("a/b");
    expect(transport.apiPost).toHaveBeenCalledWith("/api/routes/decision/refresh",{});
    const task={id:"a/b",status:"failed",error:"upstream failure"};
    transport.apiGet.mockResolvedValue({task});
    expect(await fetchRouteDecisionTask("a/b")).toBe(task);
    expect(transport.apiGet).toHaveBeenCalledWith("/api/tasks/a%2Fb");
  });
  it("does not swallow decision or task request errors",async()=>{
    transport.apiPost.mockRejectedValue(new Error("backend unavailable"));
    await expect(fetchRouteWideDecision(12)).rejects.toThrow("backend unavailable");
    transport.apiGet.mockRejectedValue(new Error("missing task"));
    await expect(fetchRouteDecisionTask("missing")).rejects.toThrow("missing task");
  });
});
