import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const page = (name: string) => readFileSync(new URL(`../${name}.tsx`, import.meta.url), "utf8");
test("domain API extensions keep authenticated transport as the single source", () => {
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  assert.match(api, /from "\.\.\/\.\.\/lib\/client"/);
  assert.doesNotMatch(api, /\bfetch\(|localStorage|Authorization/);
});
test("observation pages reuse only domain helpers, never a legacy top-level page", () => {
  for (const name of ["Models", "Dashboard", "ProgramLogs", "ProxyLogs", "SiteAnnouncements", "Monitor"]) {
    const imports = [...page(name).matchAll(/from ["']([^"']+)["']/g)].map((match) => match[1]);
    assert.equal(imports.some((path) => /src\/web\/pages\/(?!helpers\/)[^/]+$/.test(path)), false, name);
  }
});
test("standalone new UI does not render a legacy React-version component", () => {
  assert.doesNotMatch(page("SiteAnnouncements"), /import \{ SiteAnnouncementContent \} from "\.\.\//);
});
test("marketplace preserves 0-100 backend percentage", () => assert.doesNotMatch(page("Models"), /r \* 100/));
test("marketplace hydrates pricing without misusing account unitCost", () => {
  assert.match(page("Models"), /includePricing: true/);
  assert.doesNotMatch(page("Models"), /inputPricePerMillion: a\.unitCost/);
});
test("events paginate server rows", () => {
  assert.match(page("ProgramLogs"), /fetchEventPage/);
  assert.doesNotMatch(page("ProgramLogs"), /filtered\.slice\(0, visibleCount\)/);
});
test("announcements use real content and timestamps", () => {
  assert.match(page("SiteAnnouncements"), /mapAnnouncement/);
  assert.doesNotMatch(page("SiteAnnouncements"), /raw\.summary \?\? raw\.message/);
});
test("monitor health refresh and recent failures are wired", () => {
  assert.match(page("Monitor"), /refreshAccountHealth/);
  assert.match(page("Monitor"), /recentFailures/);
});
test("proxy details do not invent HTTP success or double paginate", () => {
  assert.doesNotMatch(page("ProxyLogs"), /status: 200 OK|POST \/v1\/chat\/completions/);
  assert.doesNotMatch(page("ProxyLogs"), /filtered\.slice\(start, start \+ perPage\)/);
});
test("dashboard exposes site and date-range analysis controls", () => {
  assert.match(page("Dashboard"), /analysisDays/);
  assert.match(page("Dashboard"), /analysisSite/);
});
