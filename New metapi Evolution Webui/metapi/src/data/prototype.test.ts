import assert from "node:assert/strict";
import test from "node:test";
import {
  ANNOUNCEMENTS,
  DOWNSTREAM_KEYS,
  DOWNSTREAM_TREND_POINTS,
  EXPORT_SCOPES,
  IMPORT_EXPORT_METADATA,
  MODELS,
  NOTIFICATION_CHANNELS,
  OAUTH_CONNECTIONS,
  OAUTH_PROVIDERS,
  OAUTH_ROUTE_UNITS,
  PROGRAM_EVENTS,
  ABOUT_METADATA,
} from "./prototype.ts";

const idsAreUnique = (records: ReadonlyArray<{ id: string }>) =>
  new Set(records.map((record) => record.id)).size === records.length;

test("prototype datasets provide non-empty realistic content for every management page", () => {
  const collections = [
    OAUTH_PROVIDERS,
    OAUTH_CONNECTIONS,
    OAUTH_ROUTE_UNITS,
    DOWNSTREAM_KEYS,
    DOWNSTREAM_TREND_POINTS,
    ANNOUNCEMENTS,
    PROGRAM_EVENTS,
    NOTIFICATION_CHANNELS,
    MODELS,
    EXPORT_SCOPES,
    ABOUT_METADATA.capabilities,
    ABOUT_METADATA.techStack,
    ABOUT_METADATA.resources,
    ABOUT_METADATA.releases,
  ];

  for (const collection of collections) {
    assert.ok(collection.length > 0, "each prototype collection must be populated");
  }

  assert.equal(IMPORT_EXPORT_METADATA.format, "JSON");
});

test("prototype record identifiers are stable, unique, and resolve their OAuth references", () => {
  const recordCollections = [
    OAUTH_PROVIDERS,
    OAUTH_CONNECTIONS,
    OAUTH_ROUTE_UNITS,
    DOWNSTREAM_KEYS,
    ANNOUNCEMENTS,
    PROGRAM_EVENTS,
    NOTIFICATION_CHANNELS,
    MODELS,
    EXPORT_SCOPES,
    ABOUT_METADATA.capabilities,
    ABOUT_METADATA.techStack,
    ABOUT_METADATA.resources,
    ABOUT_METADATA.releases,
  ];

  for (const records of recordCollections) {
    assert.ok(idsAreUnique(records), "IDs must be unique within each collection");
    for (const record of records) {
      assert.match(record.id, /^[a-z][a-z0-9-]*$/i, "IDs must be stable slugs");
    }
  }

  const providerIds = new Set(OAUTH_PROVIDERS.map((provider) => provider.id));
  const connectionIds = new Set(OAUTH_CONNECTIONS.map((connection) => connection.id));

  for (const connection of OAUTH_CONNECTIONS) {
    assert.ok(providerIds.has(connection.providerId));
  }

  for (const routeUnit of OAUTH_ROUTE_UNITS) {
    assert.ok(connectionIds.has(routeUnit.connectionId));
  }
});

test("prototype status fields stay within the UI status vocabulary", () => {
  const providerStatuses = new Set(["connected", "available", "maintenance"]);
  const connectionStatuses = new Set(["active", "attention", "expired", "disabled"]);
  const routeUnitStatuses = new Set(["healthy", "degraded", "disabled"]);
  const keyStatuses = new Set(["active", "paused", "expired"]);
  const announcementLevels = new Set(["info", "maintenance", "security", "release"]);
  const eventStatuses = new Set(["success", "warning", "failure", "info"]);
  const channelStatuses = new Set(["enabled", "disabled", "needs-attention"]);
  const modelStatuses = new Set(["available", "preview", "deprecated"]);
  const releaseStatuses = new Set(["current", "available", "planned"]);

  for (const provider of OAUTH_PROVIDERS) {
    assert.ok(providerStatuses.has(provider.status));
    assert.notEqual(provider.statusLabel.trim(), "");
  }
  for (const connection of OAUTH_CONNECTIONS) {
    assert.ok(connectionStatuses.has(connection.status));
    assert.notEqual(connection.statusLabel.trim(), "");
  }
  for (const routeUnit of OAUTH_ROUTE_UNITS) {
    assert.ok(routeUnitStatuses.has(routeUnit.status));
    assert.notEqual(routeUnit.statusLabel.trim(), "");
  }
  for (const key of DOWNSTREAM_KEYS) {
    assert.ok(keyStatuses.has(key.status));
    assert.notEqual(key.statusLabel.trim(), "");
  }
  for (const announcement of ANNOUNCEMENTS) {
    assert.ok(announcementLevels.has(announcement.level));
  }
  for (const event of PROGRAM_EVENTS) {
    assert.ok(eventStatuses.has(event.status));
    assert.notEqual(event.statusLabel.trim(), "");
  }
  for (const channel of NOTIFICATION_CHANNELS) {
    assert.ok(channelStatuses.has(channel.status));
    assert.notEqual(channel.statusLabel.trim(), "");
  }
  for (const model of MODELS) {
    assert.ok(modelStatuses.has(model.status));
    assert.notEqual(model.statusLabel.trim(), "");
  }
  for (const release of ABOUT_METADATA.releases) {
    assert.ok(releaseStatuses.has(release.status));
    assert.notEqual(release.statusLabel.trim(), "");
  }
});
