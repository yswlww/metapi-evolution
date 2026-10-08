import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, create, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import Models from "../Models";
import ProgramLogs from "../ProgramLogs";
import SiteAnnouncements from "../SiteAnnouncements";
import Monitor from "../Monitor";
import ProxyLogs from "../ProxyLogs";
import Dashboard from "../Dashboard";
const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), toast: vi.fn(), lang: "en" }));
// Decorative icons are outside these behavior tests and bundle a separate React copy.
vi.mock("lucide-react", () => Object.fromEntries(["Search", "Box", "Boxes", "Layers", "RefreshCw", "Table", "LayoutGrid", "ScrollText", "Megaphone", "ShieldAlert", "Wrench", "Activity", "AlertTriangle", "CheckCircle2", "XCircle", "Clock", "Download", "DollarSign", "Route", "TrendingUp", "Zap", "Gauge"].map((name) => [name, () => null])));
vi.mock("../../lib/client", () => ({ apiGet: transport.get, apiPost: transport.post, apiPut: transport.put, apiDelete: vi.fn(), apiPatch: vi.fn() }));
vi.mock("../../components/Toast", () => ({ useToast: () => ({ showToast: transport.toast }) }));
vi.mock("../../contexts/LangContext", () => ({ useLang: () => ({ lang: transport.lang }) }));
const text = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
const button = (root: ReactTestRenderer, label: string) => root.root.findAllByType("button").find((node) => text(node).toLowerCase().includes(label.toLowerCase()))!;
let roots: ReactTestRenderer[] = [];
const mount = async (node: React.ReactNode, path = "/") => { let root!: ReactTestRenderer; await act(async () => { root = create(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>); }); roots.push(root); await settle(); return root; };
const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(250); await Promise.resolve(); }); };
const click = async (node: ReactTestInstance) => { await act(async () => { await node.props.onClick(); }); await settle(); };
const change = async (node: ReactTestInstance, value: string) => { await act(async () => { node.props.onChange({ target: { value } }); }); await settle(); };
const baseModel = { name: "gpt-4", accountCount: 2, tokenCount: 2, avgLatency: 20, successRate: 93, accounts: [{ id: 8, site: "Shared", username: "one" }, { id: 9, site: "Shared", username: "two" }] };
const overview = { accounts: { total: 1, healthy: 0, unhealthy: 1, unknown: 0, disabled: 0, expired: 0, problemItems: [] }, sites: { total: 1, active: 1, disabled: 0 }, routes: { total: 1, enabled: 1, zeroEnabledChannels: 1, cooldownChannels: 2, problemItems: [{ id: 1, title: "Real Route", modelPattern: "gpt-*", channelCount: 3, enabledChannelCount: 0, cooldownChannelCount: 2, failedChannelCount: 1, siteNames: ["Shared"] }] }, traffic24h: { total: 1, success: 0, failed: 1, successRate: 0, recentFailures: [{ id: 1, modelRequested: "gpt-4", httpStatus: 503, errorMessage: "real outage" }] } };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); transport.lang = "en";
  vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval, confirm: () => true });
  vi.stubGlobal("document", { getElementById: () => ({ focus: vi.fn(), scrollIntoView: vi.fn() }) });
  transport.post.mockResolvedValue({ success: true }); transport.put.mockResolvedValue({ success: true });
  transport.get.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/models/marketplace")) return { models: [{ ...baseModel, ...(url.includes("includePricing=true") || url.includes("includePricing=1") ? { pricingSources: [{ accountId: 8, siteId: 1, siteName: "Shared", username: "one", ownerBy: "vendor", enableGroups: ["default"], groupPricing: { default: { quotaType: 0, inputPerMillion: 2, outputPerMillion: 4 } } }] } : {}) }] };
    if (url === "/api/events/count") return { count: 80 };
    if (url.startsWith("/api/events?")) { const q = new URLSearchParams(url.split("?")[1]); const offset = Number(q.get("offset")); return Array.from({ length: offset === 0 ? 50 : 1 }, (_, i) => ({ id: offset + i + 1, type: "checkin", level: "info", title: `Event ${offset + i + 1}`, message: "成功 2 失败 0", read: false, createdAt: "2026-10-08" })); }
    if (url.startsWith("/api/site-announcements?")) return [{ id: 1, siteId: 2, platform: "new-api", sourceKey: "notice", title: "Real announcement", content: "Actual content <script>alert(1)</script>", level: "info", readAt: "2026-10-08 01:00:00", firstSeenAt: "2026-10-07 01:00:00" }];
    if (url.startsWith("/api/monitor/overview")) return overview;
    if (url.startsWith("/api/stats/proxy-logs?")) { const q = new URLSearchParams(url.split("?")[1]); if (q.get("view") === "meta") return { summary: { totalCount: 21, successCount: 0, failedCount: 21, totalCost: 3 }, clientOptions: [{ value: "app:curl", label: "curl" }], sites: [{ id: 2, name: "Shared" }] }; return { items: [{ id: Number(q.get("offset")) + 1, modelRequested: "different-model", status: "failed", siteName: "Shared", clientAppName: "curl", firstByteLatencyMs: 12, isStream: true, createdAt: "2026-10-08" }], total: 21, page: 1, pageSize: 10 }; }
    if (url.startsWith("/api/stats/proxy-logs/")) throw new Error("detail unavailable");
    if (url === "/api/settings/runtime") return { proxyDebugTraceEnabled: false, proxyDebugCaptureHeaders: true, proxyDebugCaptureBodies: false, proxyDebugCaptureStreamChunks: false, proxyDebugRetentionHours: 48, proxyDebugMaxBodyBytes: 4096 };
    if (url.startsWith("/api/stats/proxy-debug/traces?")) return { items: [{ id: 1, requestedModel: "gpt-4", downstreamPath: "/v1/responses", finalStatus: "failed", finalHttpStatus: 503 }] };
    if (url === "/api/stats/proxy-debug/traces/1") return { trace: { requestBodyJson: '{"real":"payload"}', finalHttpStatus: 503 }, attempts: [{ id: 7, attemptIndex: 0, endpoint: "responses", responseStatus: 503, rawErrorText: "upstream unavailable" }] };
    if (url.startsWith("/api/stats/model-by-site?")) return { models: [{ model: "gpt-4", calls: 9, spend: 2, tokens: 300 }] };
    if (url.includes("view=insights")) return { modelAnalysis: { window: { start: "2026-10-02", end: "2026-10-08", days: 7 }, spendTrend: [{ day: "2026-10-08", spend: 2 }], callRanking: [{ model: "gpt-4", successRate: 93, avgLatencyMs: 20 }] }, siteAvailability: [] };
    if (url.includes("view=summary")) return { totalBalance: 0 };
    if (url.startsWith("/api/stats/site-distribution")) return { distribution: [{ siteId: 2, siteName: "Shared", totalSpend: 3, totalBalance: 2 }] };
    if (url.startsWith("/api/stats/site-trend")) return { trend: [{ date: "2026-10-08", sites: { Shared: { spend: 7, calls: 12 } } }] };
    if (url === "/api/routes") return [];
    return [];
  });
});
afterEach(async () => { await act(async () => { for (const root of roots) root.unmount(); }); roots = []; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Observation page interactions against backend fixtures", () => {
  it("Proxy summaries clearly retain all-status scope while table status changes", async () => {
    const root = await mount(<ProxyLogs />); await change(root.root.findAllByType("select")[0], "success");
    expect(text(root.root)).toContain("All-status summary");
    expect(text(root.root)).toContain("status filter applies to the table only");
  });
  it("Proxy page and size changes do not repeat metadata, but filters and refresh do", async () => {
    const metaCalls = () => transport.get.mock.calls.filter(([url]) => new URLSearchParams(String(url).split("?")[1]).get("view") === "meta");
    const root = await mount(<ProxyLogs />); expect(metaCalls()).toHaveLength(1);
    await click(button(root, "Next")); expect(metaCalls()).toHaveLength(1);
    await change(root.root.findAllByType("select").at(-1)!, "20"); expect(metaCalls()).toHaveLength(1);
    await change(root.root.findAllByType("input")[0], "model"); expect(metaCalls()).toHaveLength(2);
    await click(button(root, "Refresh")); expect(metaCalls()).toHaveLength(3);
    expect(metaCalls().every(([url]) => !new URLSearchParams(String(url).split("?")[1]).has("refresh"))).toBe(true);
  });
  it("Program read and mark-all keep the loaded extent and local search", async () => {
    const rows = Array.from({ length: 63 }, (_, i) => ({ id: i + 1, type: "checkin", title: `Event ${i + 1}`, message: "成功 1", read: false, level: "info" }));
    const fallback = transport.get.getMockImplementation()!;
    transport.get.mockImplementation((url: string) => { if (url === "/api/events/count") return Promise.resolve({ count: rows.filter((r) => !r.read).length }); if (url.startsWith("/api/events?")) { const q = new URLSearchParams(url.split("?")[1]); const offset = Number(q.get("offset")); return Promise.resolve(rows.slice(offset, offset + Number(q.get("limit")))); } return fallback(url); });
    transport.post.mockImplementation(async (url: string) => { if (url === "/api/events/read-all") rows.forEach((r) => { r.read = true; }); else { const id = Number(url.split("/")[3]); rows.find((r) => r.id === id)!.read = true; } return { success: true }; });
    const root = await mount(<ProgramLogs />); await click(button(root, "Load more"));
    await click(root.root.findAllByType("article")[0].findByType("button"));
    expect(root.root.findAllByType("article")).toHaveLength(63);
    await change(root.root.findAllByType("input")[0], "Event 63"); await click(button(root, "Mark all"));
    expect(text(root.root)).toContain("Event 63"); expect(root.root.findAllByType("input")[0].props.value).toBe("Event 63");
    expect(root.root.findAllByType("article")[0].findAllByType("button")).toHaveLength(0);
  });
  it("Program unread removal adjusts raw offset without skipping older events", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, type: "checkin", title: `Event ${i + 1}`, message: "成功 1", read: false, level: "info" }));
    const fallback = transport.get.getMockImplementation()!;
    transport.get.mockImplementation((url: string) => { if (url === "/api/events/count") return Promise.resolve({ count: rows.filter((r) => !r.read).length }); if (url.startsWith("/api/events?")) { const q = new URLSearchParams(url.split("?")[1]); const data = q.get("read") === "false" ? rows.filter((r) => !r.read) : rows; const offset = Number(q.get("offset")); return Promise.resolve(data.slice(offset, offset + Number(q.get("limit")))); } return fallback(url); });
    transport.post.mockImplementation(async (url: string) => { rows.find((r) => r.id === Number(url.split("/")[3]))!.read = true; return { success: true }; });
    const root = await mount(<ProgramLogs />); await act(async () => root.root.findAllByType("input").find((n) => n.props.type === "checkbox")!.props.onChange({ target: { checked: true } })); await settle();
    await click(button(root, "Load more")); await click(root.root.findAllByType("article")[0].findByType("button"));
    expect(root.root.findAllByType("article")).toHaveLength(99); await click(button(root, "Load more"));
    expect(root.root.findAllByType("article")).toHaveLength(119); expect(text(root.root)).toContain("Event 120");
    expect(transport.get.mock.calls.some(([url]) => String(url).includes("offset=99"))).toBe(true);
  });
  it("Announcement focus uses 500-row batches and stops automatically at 5000", async () => {
    const fallback = transport.get.getMockImplementation()!;
    transport.get.mockImplementation((url: string) => { if (!url.startsWith("/api/site-announcements?")) return fallback(url); const q = new URLSearchParams(url.split("?")[1]); const offset = Number(q.get("offset")); return Promise.resolve(Array.from({ length: Number(q.get("limit")) }, (_, i) => ({ id: offset + i + 1, siteId: 2, platform: "new-api", sourceKey: "n", title: `Notice ${offset + i + 1}`, content: "Body", level: "info" }))); });
    const root = await mount(<SiteAnnouncements />, "/app/site-announcements?focusAnnouncementId=9000");
    const calls = transport.get.mock.calls.filter(([url]) => String(url).startsWith("/api/site-announcements?"));
    expect(calls).toHaveLength(10); expect(calls.every(([url]) => String(url).includes("limit=500"))).toBe(true);
    expect(text(root.root)).toContain("Automatic focused lookup paused after 5000 rows");
    await click(button(root, "Load more")); expect(transport.get.mock.calls.filter(([url]) => String(url).startsWith("/api/site-announcements?")).length).toBe(11);
  });
  it("Announcement focus distinguishes exhausted not-found results from a bounded scan", async () => {
    const root = await mount(<SiteAnnouncements />, "/app/site-announcements?focusAnnouncementId=9000");
    expect(text(root.root)).toContain("Focused announcement was not found in the server results");
    expect(text(root.root)).not.toContain("Automatic focused lookup paused");
  });
  it("Models hydrates real pricing, displays percentages and counts distinct accounts", async () => {
    const root = await mount(<Models />);
    expect(text(root.root)).toContain("93.0%"); expect(text(root.root)).not.toContain("9300.0%");
    expect(transport.get.mock.calls.some(([url]) => String(url).includes("includePricing=1"))).toBe(true);
    expect(text(root.root)).toContain("$2.0000"); expect(text(root.root)).toContain("$4.0000");
    expect(text(root.root)).not.toContain("0k");
  });
  it("Models changes display language without refetching translated state", async () => {
    const root = await mount(<Models />); const count = transport.get.mock.calls.length;
    transport.lang = "zh-Hant";
    await act(async () => root.update(<MemoryRouter><Models /></MemoryRouter>));
    expect(text(root.root)).toContain("可用"); expect(transport.get.mock.calls.length).toBe(count);
  });
  it("Announcements mark-read reads back actual persisted readAt", async () => {
    let readAt: string | null = null; const fallback = transport.get.getMockImplementation()!;
    transport.get.mockImplementation((url: string) => url.startsWith("/api/site-announcements?") ? Promise.resolve([{ id: 1, siteId: 2, platform: "new-api", sourceKey: "notice", title: "Unread notice", content: "Body", level: "info", readAt, firstSeenAt: "2026-10-07" }]) : fallback(url));
    transport.post.mockImplementation(async () => { readAt = "2026-10-08 12:00:00"; return { success: true }; });
    const root = await mount(<SiteAnnouncements />);
    const action = root.root.findAllByType("button").find((n) => text(n).toLowerCase().trim() === "mark read")!;
    await click(action);
    expect(transport.post).toHaveBeenCalledWith("/api/site-announcements/1/read");
    expect(text(root.root)).toContain("2026-10-08 12:00:00");
  });
  it("Proxy capture errors keep draft open and never announce success", async () => {
    const root = await mount(<ProxyLogs />); await click(button(root, "Debug"));
    transport.put.mockRejectedValueOnce(new Error("capture denied")); await click(button(root, "Save capture"));
    expect(transport.toast).toHaveBeenLastCalledWith("capture denied"); expect(button(root, "Save capture")).toBeDefined();
  });
  it("Proxy trace collapse clears loaded detail", async () => {
    const root = await mount(<ProxyLogs />); await click(button(root, "Debug")); await click(button(root, "/v1/responses"));
    expect(text(root.root)).toContain("upstream unavailable");
    await click(button(root, "/v1/responses")); expect(text(root.root)).not.toContain("upstream unavailable");
  });
  it("Proxy trace collapse during fetch clears loading and ignores late response", async () => {
    let resolve!: (value: unknown) => void; const fallback = transport.get.getMockImplementation()!;
    transport.get.mockImplementation((url: string) => url === "/api/stats/proxy-debug/traces/1" ? new Promise((r) => { resolve = r; }) : fallback(url));
    const root = await mount(<ProxyLogs />); await click(button(root, "Debug")); await click(button(root, "/v1/responses"));
    expect(text(root.root)).toContain("Loading…"); await click(button(root, "/v1/responses"));
    expect(text(root.root)).not.toContain("Loading…");
    await act(async () => resolve({ trace: { requestBodyJson: '{"late":"payload"}' }, attempts: [] })); await settle();
    expect(text(root.root)).not.toContain('"late"');
  });
  it("Program logs Load More reaches event 51 and sends server unread filters", async () => {
    const root = await mount(<ProgramLogs />);
    expect(text(root.root)).toContain("Check-in"); expect(text(root.root)).toContain("80");
    await click(button(root, "Load")); expect(text(root.root)).toContain("Event 51");
    expect(transport.get.mock.calls.some(([url]) => String(url).includes("offset=50"))).toBe(true);
    const checkbox = root.root.findAllByType("input").find((n) => n.props.type === "checkbox")!;
    await act(async () => checkbox.props.onChange({ target: { checked: true } })); await settle();
    expect(transport.get.mock.calls.some(([url]) => String(url).includes("read=false"))).toBe(true);
  });
  it("Announcements reload persisted read status and sanitize content", async () => {
    const root = await mount(<SiteAnnouncements />, "/app/site-announcements?focusAnnouncementId=1");
    const article = root.root.findByType("article"); expect(article.props.id).toBe("announcement-1"); expect(article.props.tabIndex).toBe(-1);
    expect(text(root.root)).toContain("2026-10-07 01:00:00");
    const rich = root.root.find((n) => n.props.dangerouslySetInnerHTML);
    expect(rich.props.dangerouslySetInnerHTML.__html).toContain("Actual content"); expect(rich.props.dangerouslySetInnerHTML.__html).not.toContain("<script");
    expect(root.root.findAllByType("button").some((n) => text(n) === "Mark read")).toBe(false);
  });
  it("Monitor displays title and actual failure then refreshes health before overview", async () => {
    const root = await mount(<Monitor />); expect(text(root.root)).toContain("Real Route"); expect(text(root.root)).toContain("real outage");
    await click(root.root.findAllByType("button")[0]);
    expect(transport.post).toHaveBeenCalledWith("/api/accounts/health/refresh", { wait: true }, { timeoutMs: 150000 });
    expect(transport.get.mock.calls.some(([url]) => String(url).includes("/api/monitor/overview?refresh=1"))).toBe(true);
  });
  it("Monitor does not announce successful health refresh when it fails", async () => {
    const root = await mount(<Monitor />); transport.post.mockRejectedValueOnce(new Error("health unavailable"));
    await click(root.root.findAllByType("button")[0]); expect(transport.toast).toHaveBeenLastCalledWith("health unavailable");
    expect(transport.get.mock.calls.filter(([url]) => String(url).includes("refresh=1"))).toHaveLength(0);
  });
  it("Proxy logs preserve server page 2 and metadata-only search matches", async () => {
    const root = await mount(<ProxyLogs />); await change(root.root.findAllByType("input")[0], "curl");
    expect(text(root.root)).toContain("different-model"); await click(button(root, "Next")); expect(text(root.root)).toContain("different-model");
    expect(transport.get.mock.calls.some(([url]) => String(url).includes("offset=10"))).toBe(true);
    await click(button(root, "Detail")); expect(text(root.root)).toContain("detail unavailable"); expect(text(root.root)).not.toContain("200 OK");
  });
  it("Proxy debug saves full capture settings, reloads them and displays actual attempts", async () => {
    const root = await mount(<ProxyLogs />); await click(button(root, "Debug"));
    const checkboxes = root.root.findAllByType("input").filter((n) => n.props.type === "checkbox");
    await act(async () => checkboxes[2].props.onChange({ target: { checked: true } }));
    await click(button(root, "Save capture"));
    expect(transport.put).toHaveBeenCalledWith("/api/settings/runtime", expect.objectContaining({ proxyDebugCaptureBodies: true, proxyDebugRetentionHours: 48, proxyDebugMaxBodyBytes: 4096 }));
    await click(button(root, "/v1/responses")); expect(text(root.root)).toContain("upstream unavailable"); expect(text(root.root)).toContain("503"); expect(text(root.root)).toContain('"real": "payload"');
  });
  it("Dashboard analysis controls send actual site/range requests and reveal server trend", async () => {
    const root = await mount(<Dashboard />); expect(text(root.root)).toContain("$7.000000");
    const selects = root.root.findAllByType("select"); await change(selects[0], "30"); await change(root.root.findAllByType("select")[1], "2");
    expect(transport.get.mock.calls.some(([url]) => String(url).includes("days=30") && String(url).includes("siteId=2"))).toBe(true);
    await click(button(root, "Spend trend")); expect(text(root.root)).toContain("default all-site analysis window");
  });
});
