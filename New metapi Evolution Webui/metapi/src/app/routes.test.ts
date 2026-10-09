import assert from "node:assert/strict";
import test from "node:test";
import { APP_ROUTES } from "./routes.ts";

const REQUIRED_PATHS = [
  "/app/oauth",
  "/app/downstream-keys",
  "/app/site-announcements",
  "/app/events",
  "/app/import-export",
  "/app/notifications",
  "/app/models",
  "/app/about",
];

test("APP_ROUTES registers every required management page without duplicate paths", () => {
  const paths = APP_ROUTES.map((route) => route.path);

  assert.equal(new Set(paths).size, paths.length, "route paths must be unique");

  for (const path of REQUIRED_PATHS) {
    assert.ok(paths.includes(path), `missing required route: ${path}`);
  }
});
