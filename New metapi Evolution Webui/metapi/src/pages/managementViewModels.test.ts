import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDownstreamKeyViewModels,
  buildOAuthConnectionViewModels,
  filterDownstreamKeys,
  filterOAuthConnections,
} from "./managementViewModels.ts";
import {
  DOWNSTREAM_KEYS,
  OAUTH_CONNECTIONS,
  OAUTH_PROVIDERS,
  OAUTH_ROUTE_UNITS,
} from "../data/prototype.ts";

test("OAuth connection filters combine case-insensitive account search with provider and status", () => {
  const result = filterOAuthConnections(OAUTH_CONNECTIONS, {
    query: "PLATFORM@METAPI-EVOLUTION.DEV",
    providerId: "openai",
    status: "active",
  });

  assert.deepEqual(result.map((connection) => connection.id), ["conn-openai-platform"]);
});

test("OAuth connection view models resolve provider, route units, and quota display", () => {
  const [connection] = buildOAuthConnectionViewModels(
    OAUTH_CONNECTIONS,
    OAUTH_PROVIDERS,
    OAUTH_ROUTE_UNITS,
    { query: "Research", providerId: "all", status: "all" },
  );

  assert.equal(connection.providerName, "OpenAI");
  assert.deepEqual(connection.routeUnits.map((routeUnit) => routeUnit.id), ["route-openai-research"]);
  assert.equal(connection.quota.percent, 94);
  assert.equal(connection.quota.text, "940.0k / 1.0M tokens");
});

test("Downstream key filters match a masked-key prefix and derived group", () => {
  const result = filterDownstreamKeys(DOWNSTREAM_KEYS, {
    query: "mpe_test",
    group: "Delivery",
    status: "active",
  });

  assert.deepEqual(result.map((key) => key.id), ["key-staging-ci"]);
});

test("Downstream key view models mask tokens and use local reset usage in both quotas", () => {
  const [key] = buildDownstreamKeyViewModels(
    DOWNSTREAM_KEYS,
    { query: "Production", group: "all", status: "all" },
    { "key-production-gateway": 0 },
  );

  assert.equal(key.group, "Production");
  assert.equal(key.maskedToken, "mpe_live_7K3A••••••••");
  assert.equal(key.requestQuota.text, "0 / 80.0k requests");
  assert.equal(key.costQuota.text, "$0.00 / $120.00 estimated cost");
});
