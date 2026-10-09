import assert from "node:assert/strict";
import test from "node:test";
import { ROUTING_STRATEGIES, buildRoutePayload, buildChannelPayload, movePriorityBucket, filterRoutes, sourceRouteOptions, decorateRouteCapabilities, modelMatchesRoute } from "./routesParity.ts";

test("only backend-supported strategies are selectable", () => {
  assert.deepEqual(ROUTING_STRATEGIES, ["weighted", "round_robin", "stable_first"]);
});
test("explicit groups persist exact source route identities and public name", () => {
  assert.deepEqual(buildRoutePayload({ modelPattern: "ignored", displayName: " public-model ", routeMode: "explicit_group", sourceRouteIds: [4, 2, 4], strategy: "stable_first", enabled: false }), { modelPattern: "public-model", displayName: "public-model", routeMode: "explicit_group", sourceRouteIds: [2, 4], routingStrategy: "stable_first", enabled: false });
  assert.throws(() => buildRoutePayload({modelPattern: "", displayName: "x", routeMode: "explicit_group", sourceRouteIds: [], strategy: "weighted", enabled: true}));
});
test("source picker excludes groups, globs and self but retains disabled exact sources", () => {
  assert.deepEqual(sourceRouteOptions([{id: 1, modelPattern: "gpt-4", routeMode: "pattern", enabled: false}, {id: 2, modelPattern: "gpt-*"}, {id: 3, modelPattern: "group", routeMode: "explicit_group"}, {id: 4, modelPattern: "self"}], 4).map(r => r.id), [1]);
});
test("channel follow-default explicitly clears binding; priority and weight are validated", () => {
  assert.deepEqual(buildChannelPayload({tokenId: "", sourceModel: "", priority: "5", weight: "2.5"}), {tokenId: null, sourceModel: null, priority: 5, weight: 2.5});
  assert.throws(() => buildChannelPayload({tokenId: "4", sourceModel: "x", priority: "-1", weight: "2"}));
  assert.throws(() => buildChannelPayload({tokenId: "4", sourceModel: "x", priority: "0", weight: "NaN"}));
});
test("move swaps entire adjacent priority buckets without flattening ties or gaps", () => {
  const channels = [{id:1, priority:2}, {id:2, priority:2}, {id:3, priority:8}, {id:4, priority:12}];
  assert.deepEqual(movePriorityBucket(channels, 1, 1), [{id:1, priority:8}, {id:2, priority:8}, {id:3, priority:2}]);
  assert.deepEqual(movePriorityBucket(channels, 1, -1), []);
  assert.deepEqual(channels.map(c => c.priority), [2,2,8,12]);
});
test("route filters compose and deterministic sort supports status, mode, site, brand, capability and group", () => {
  const rows = [{id:2, modelPattern:"gpt-4", displayName:"Z", enabled:true, routeMode:"pattern", channels:[{siteName:"Alpha", sourceModel:"gpt-4"}]}, {id:1,modelPattern:"group",displayName:"A", enabled:true, routeMode:"explicit_group", sourceRouteIds:[2], channels:[{siteName:"Beta",sourceModel:"gpt-4"}]}];
  assert.deepEqual(filterRoutes(rows, {search:"", status:"enabled", mode:"explicit_group", site:"Beta", brand:"gpt", capability:"", group:"1", sort:"name"}).map(r => r.id), [1]);
});
test("capability filters inherit explicit source models and share safe backend pattern semantics", () => {
  const rows = decorateRouteCapabilities([{id:1, modelPattern:"gpt-*", enabled:true}, {id:2,modelPattern:"gpt-4",enabled:true}, {id:3,modelPattern:"public",routeMode:"explicit_group",sourceRouteIds:[2],enabled:true}], {"gpt-4":["chat","responses"], "gemini-pro":["generateContent"]});
  assert.deepEqual(rows.find(r=>r.id===3)?.endpointTypes,["chat","responses"]);
  assert.equal(modelMatchesRoute("gpt-4","gpt-*"),true);
  assert.equal(modelMatchesRoute("GPT-4","gpt-*"),false);
  assert.equal(modelMatchesRoute("gpt-4","re:^(gpt|gemini)-.*$"),true);
  assert.equal(modelMatchesRoute("aaaa!","re:(a+)+$"),false);
});
test("pattern routes omit explicit source references and preserve all supported strategies",()=>{
  for(const strategy of ROUTING_STRATEGIES) assert.deepEqual(buildRoutePayload({modelPattern:" gpt-* ",displayName:" Name ",routeMode:"pattern",sourceRouteIds:[7],strategy,enabled:true}),{modelPattern:"gpt-*",displayName:"Name",routeMode:"pattern",routingStrategy:strategy,enabled:true});
  assert.throws(()=>buildRoutePayload({modelPattern:"gpt-4",displayName:"",routeMode:"pattern",sourceRouteIds:[],strategy:"cheapest",enabled:true}),/invalidStrategy/);
});
