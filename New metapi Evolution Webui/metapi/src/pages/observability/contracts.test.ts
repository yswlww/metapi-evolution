import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSuccessRate, mapMarketplaceModel, uniqueAccountCount, formatPrice } from "./marketplace.ts";
import { eventResult, eventPageQuery, mapEvent, appendEventPage } from "./events.ts";
import { mapAnnouncement } from "./announcements.ts";
import { usageRows } from "./dashboard.ts";
import { proxyQuery, proxyMetaQuery, localDayBoundary, normalizeDebugSettings, debugSettingsPayload } from "./proxyLogs.ts";

const model = (accounts = [{ id: 8, site: "shared", username: "u", latency: 20, unitCost: 0.3, balance: 0 }]) => ({ name: "gpt-4", accountCount: accounts.length, tokenCount: 2, avgLatency: 20, successRate: 93, accounts });
test("dashboard distributions sort chosen metric and use unfiltered totals for shares", () => {
  const rows = [{ model: "a", calls: 8, spend: 2, tokens: 300 }, { model: "b", calls: 2, spend: 8, tokens: 100 }];
  assert.equal(usageRows(rows, "spend")[0].model, "b");
  assert.equal(usageRows(rows, "calls", "b")[0].share, 20);
  assert.equal(usageRows([{ model: "none", calls: 0, spend: 0, tokens: 0 }], "calls")[0].share, 0);
});
test("marketplace percentages preserve 0, 93 and 100; missing is unknown", () => {
  assert.equal(formatSuccessRate(93), "93.0%"); assert.equal(formatSuccessRate(0), "0.0%"); assert.equal(formatSuccessRate(100), "100.0%"); assert.equal(formatSuccessRate(null), "—");
});
test("unknown prices and context are not fabricated from unitCost", () => {
  const row = mapMarketplaceModel(model());
  assert.equal(row.inputPricePerMillion, null); assert.equal(row.outputPricePerMillion, null); assert.equal(row.contextWindow, null); assert.equal(formatPrice(null), "—");
});
test("real per-million prices are distinct from per-call prices and preserve zero", () => {
  const row = mapMarketplaceModel({ ...model(), pricingSources: [{ siteId: 1, siteName: "shared", accountId: 8, username: "u", ownerBy: null, enableGroups: ["default"], groupPricing: { default: { quotaType: 0, inputPerMillion: 0, outputPerMillion: 3 }, call: { quotaType: 1, perCallTotal: 9 } } }] });
  assert.equal(row.inputPricePerMillion, 0); assert.equal(row.outputPricePerMillion, 3); assert.equal(row.pricingSources.length, 1);
});
test("distinct account IDs at same site count independently across models", () => {
  const accounts = [{ id: 8, site: "shared", username: "a", latency: 0, unitCost: 0, balance: 0 }, { id: 9, site: "shared", username: "b", latency: 0, unitCost: 0, balance: 0 }];
  assert.equal(uniqueAccountCount([mapMarketplaceModel(model(accounts)), mapMarketplaceModel(model(accounts))]), 2);
});
test("events preserve backend types and infer task results from counts before failure words", () => {
  assert.equal(mapEvent({ id: 1, type: "checkin", title: "Task", message: "成功 3 失败 0", level: "info", read: false }).type, "checkin");
  assert.equal(eventResult({ title: "Task", message: "成功 3 失败 0", level: "info" }), "success");
  assert.equal(eventResult({ title: "Task", message: "成功 3 失败 1", level: "info" }), "failure");
  assert.equal(eventResult({ title: "Task", message: "跳过 2", level: "info" }), "skipped");
  assert.equal(eventResult({ title: "Task running", level: "info" }), "running");
});
test("event pagination uses raw server offset and backend unread/type filters", () => {
  const query = new URLSearchParams(eventPageQuery({ offset: 50, limit: 50, type: "balance", unread: true }));
  assert.equal(query.get("offset"), "50"); assert.equal(query.get("read"), "false"); assert.equal(query.get("type"), "balance");
  assert.deepEqual(appendEventPage([{ id: "1" }], [{ id: "1" }, { id: "2" }]), [{ id: "1" }, { id: "2" }]);
});
test("announcements retain rich content readAt firstSeenAt and severity", () => {
  const row = mapAnnouncement({ id: 1, siteId: 2, platform: "new-api", sourceKey: "notice", title: "test", content: "**news**", level: "warning", readAt: "2026-10-08", firstSeenAt: "2026-10-07" });
  assert.equal(row.summary, "**news**"); assert.equal(row.read, true); assert.equal(row.publishedAt, "2026-10-07"); assert.equal(row.level, "maintenance");
});
test("proxy server query preserves client/site search and retried status", () => {
  const query = new URLSearchParams(proxyQuery({ page: 2, pageSize: 10, status: "retried", search: "curl", client: "app:curl", siteId: "2" }));
  assert.equal(query.get("offset"), "10"); assert.equal(query.get("status"), "failed"); assert.equal(query.get("client"), "app:curl"); assert.equal(query.get("view"), "query");
});
test("date filters use actual client timezone boundaries", () => {
  const value = localDayBoundary("2026-10-08", false);
  assert.equal(new Date(value!).getHours(), 0); assert.equal(new Date(value!).getDate(), 8);
  const exclusiveEnd = new Date(localDayBoundary("2026-10-08", true)!);
  assert.equal(exclusiveEnd.getHours(), 0); assert.equal(exclusiveEnd.getDate(), 9);
});
test("debug settings preserve capture and target settings and reject invalid numeric limits", () => {
  const row = normalizeDebugSettings({ proxyDebugTraceEnabled: true, proxyDebugCaptureBodies: true, proxyDebugRetentionHours: 48, proxyDebugMaxBodyBytes: 4096 });
  assert.equal(row.proxyDebugTraceEnabled, true); assert.equal(row.proxyDebugCaptureBodies, true); assert.equal(debugSettingsPayload(row).proxyDebugRetentionHours, 48);
  assert.throws(() => debugSettingsPayload({ ...row, proxyDebugRetentionHours: 0 }));
});
