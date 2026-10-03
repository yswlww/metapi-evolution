export type OAuthProviderStatus = "connected" | "available" | "maintenance";
export type OAuthConnectionStatus = "active" | "attention" | "expired" | "disabled";
export type RouteUnitStatus = "healthy" | "degraded" | "disabled";
export type DownstreamKeyStatus = "active" | "paused" | "expired";
export type AnnouncementLevel = "info" | "maintenance" | "security" | "release";
export type ProgramEventStatus = "success" | "warning" | "failure" | "info";
export type NotificationChannelStatus = "enabled" | "disabled" | "needs-attention";
export type NotificationChannelKind =
  | "webhook"
  | "bark"
  | "serverchan"
  | "telegram"
  | "smtp";
export type ModelStatus = "available" | "preview" | "deprecated";
export type ReleaseStatus = "current" | "available" | "planned";

export type AccountStatus = "healthy" | "degraded" | "unhealthy" | "disabled";
export type SiteStatus = "healthy" | "degraded" | "unhealthy" | "disabled";

export interface Route {
  id: string;
  modelPattern: string;
  displayName: string;
  enabled: boolean;
  strategy: string;
  priority: number;
  channelCount: number;
  avgLatency: number | null;
  avgCost: number | null;
}

export interface DashboardKpi {
  totalBalance: number;
  todaySpend: number;
  avgLatency: number;
  activeRoutes: number;
  healthyAccounts: number;
  totalAccounts: number;
}

export interface PlaygroundModel {
  id: string;
  name: string;
  modes: string[];
}

export interface ProxyLogEntry {
  id: string;
  status: "success" | "error" | "pending";
  model: string;
  channel: string;
  latencyMs: number;
  cost: number;
  createdAt: string;
  requestTokens: number;
  responseTokens: number;
}

export interface MonitorEntry {
  id: string;
  name: string;
  status: "healthy" | "degraded" | "down";
  uptimePercent: number;
  latencyMs: number;
  lastCheck: string;
}

export interface CheckinEntry {
  id: string;
  account: string;
  site: string;
  status: "success" | "failure" | "skipped";
  note: string;
  reward: number;
  occurredAt: string;
}

export interface Token {
  id: string;
  name: string;
  tokenPrefix: string;
  /** Linked upstream account this token grants access to. */
  account: string;
  /** Upstream site this token belongs to. */
  site: string;
  status: "active" | "expired";
  statusLabel: string;
  scope: string;
  group: string;
  isDefault: boolean;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  usageCount: number;
}

export interface Site {
  id: number;
  slug: string;
  name: string;
  adapter: string;
  url: string;
  balance: number;
  accounts: number;
  enabled: boolean;
  status: SiteStatus;
  statusLabel: string;
  region: string;
  note: string;
  // Backend-only fields surfaced so the edit form round-trips them.
  sortOrder?: number;
  customHeaders?: unknown;
  proxyUrl?: string | null;
  useSystemProxy?: boolean;
  globalWeight?: number;
  isPinned?: boolean;
  apiKey?: string | null;
}

export interface Account {
  id: number;
  siteSlug: string;
  siteName: string;
  adapter: string;
  username: string;
  balance: number;
  status: AccountStatus;
  statusLabel: string;
  tokens: number;
  lastCheckin: string;
  lastSeen: string;
  note: string;
  // Backend-only: whether scheduled check-in is enabled for this account.
  checkinEnabled?: boolean;
}

export interface Quota {
  used: number;
  limit: number;
  unit: "requests" | "tokens" | "route units";
  renewsAt: string;
}

export interface OAuthProvider {
  id: string;
  name: string;
  description: string;
  status: OAuthProviderStatus;
  statusLabel: string;
  connectionCount: number;
  authorizationType: "OAuth 2.0" | "Device authorization";
}

export interface OAuthConnection {
  id: string;
  providerId: string;
  accountName: string;
  accountEmail: string;
  siteUrl: string;
  projectId: string;
  proxyUrl: string | null;
  useSystemProxy: boolean;
  status: OAuthConnectionStatus;
  statusLabel: string;
  createdAt: string;
  lastRefreshedAt: string;
  quota: Quota;
  routeUnitIds: readonly string[];
}

export interface OAuthRouteUnit {
  id: string;
  connectionId: string;
  name: string;
  modelFamily: string;
  region: string;
  status: RouteUnitStatus;
  statusLabel: string;
  requestsPerMinute: number;
  dailyQuota: Quota;
}

export interface DownstreamKey {
  id: string;
  name: string;
  tokenPrefix: string;
  fullToken: string;
  groupName: string;
  tags: readonly string[];
  description: string;
  expiresAt: string | null;
  maxCost: number | null;
  maxRequests: number | null;
  // Backend cost usage (real keys); used to render an honest cost quota.
  usedCost?: number;
  supportedModels: readonly string[];
  selectedGroupRoutes: readonly string[];
  siteWeightMultipliers: Readonly<Record<string, number>>;
  excludedSiteIds: readonly number[];
  status: DownstreamKeyStatus;
  statusLabel: string;
  scopes: readonly string[];
  createdAt: string;
  lastUsedAt: string | null;
  requestQuota: Quota;
  requestsToday: number;
}

export interface TrendPoint {
  id: string;
  date: string;
  requests: number;
  errorRatePercent: number;
}

export interface Announcement {
  id: string;
  title: string;
  summary: string;
  level: AnnouncementLevel;
  publishedAt: string;
  source: string;
  read: boolean;
}

export interface ProgramEvent {
  id: string;
  type: "oauth" | "key" | "announcement" | "system" | "export";
  status: ProgramEventStatus;
  statusLabel: string;
  title: string;
  detail: string;
  occurredAt: string;
  read: boolean;
}

export interface NotificationDelivery {
  status: "delivered" | "failed" | "not-sent";
  statusLabel: string;
  occurredAt: string | null;
}

export interface NotificationChannel {
  id: string;
  kind: NotificationChannelKind;
  name: string;
  destination: string;
  status: NotificationChannelStatus;
  statusLabel: string;
  eventTypes: readonly ProgramEvent["type"][];
  lastDelivery: NotificationDelivery;
}

export interface ModelSiteOverride {
  id: string;
  siteName: string;
  enabled: boolean;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

export interface Model {
  id: string;
  provider: string;
  brand: string;
  name: string;
  family: string;
  status: ModelStatus;
  statusLabel: string;
  modalities: readonly ("text" | "image" | "audio")[];
  contextWindow: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  capabilities: readonly string[];
  description: string;
  tags: readonly string[];
  supportedEndpointTypes: readonly string[];
  accountCount: number;
  tokenCount: number;
  avgLatency: number | null;
  successRate: number | null;
  siteOverrides: readonly ModelSiteOverride[];
}

export interface ExportScope {
  id: string;
  label: string;
  description: string;
  recordCount: number;
}

export interface ImportExportMetadata {
  format: "JSON";
  schemaVersion: string;
  lastExportedAt: string;
  maximumImportSize: string;
  supportedSections: readonly string[];
}

export interface AboutCapability {
  id: string;
  label: string;
  description: string;
}

export interface TechStackEntry {
  id: string;
  name: string;
  role: string;
  version: string;
}

export interface ResourceLink {
  id: string;
  label: string;
  description: string;
  href: string;
}

export interface ReleaseNote {
  id: string;
  version: string;
  releasedAt: string;
  status: ReleaseStatus;
  statusLabel: string;
  highlights: readonly string[];
}

export interface AboutMetadata {
  productName: string;
  tagline: string;
  version: string;
  buildRevision: string;
  releasedAt: string;
  license: string;
  capabilities: readonly AboutCapability[];
  techStack: readonly TechStackEntry[];
  resources: readonly ResourceLink[];
  releases: readonly ReleaseNote[];
}

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "Authorize organization-scoped API access for OpenAI models.",
    status: "connected",
    statusLabel: "Connected",
    connectionCount: 2,
    authorizationType: "OAuth 2.0",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Connect Claude subscriptions and workspace credentials.",
    status: "connected",
    statusLabel: "Connected",
    connectionCount: 1,
    authorizationType: "OAuth 2.0",
  },
  {
    id: "google-ai",
    name: "Google AI",
    description: "Use a Google account to authorize Gemini route units.",
    status: "available",
    statusLabel: "Available to connect",
    connectionCount: 0,
    authorizationType: "Device authorization",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Associate organization access with source-control workflows.",
    status: "maintenance",
    statusLabel: "Provider maintenance",
    connectionCount: 0,
    authorizationType: "OAuth 2.0",
  },
];

export const OAUTH_CONNECTIONS: readonly OAuthConnection[] = [
  {
    id: "conn-openai-platform",
    providerId: "openai",
    accountName: "Platform Production",
    accountEmail: "platform@metapi-evolution.dev",
    siteUrl: "https://api.openai.com/v1",
    projectId: "",
    proxyUrl: null,
    useSystemProxy: false,
    status: "active",
    statusLabel: "Active and refreshing",
    createdAt: "2026-08-14T09:20:00Z",
    lastRefreshedAt: "2026-09-10T08:42:00Z",
    quota: { used: 6780000, limit: 10000000, unit: "tokens", renewsAt: "2026-10-01T00:00:00Z" },
    routeUnitIds: ["route-openai-us-east", "route-openai-eu-west"],
  },
  {
    id: "conn-openai-research",
    providerId: "openai",
    accountName: "Research Sandbox",
    accountEmail: "research@metapi-evolution.dev",
    siteUrl: "https://api.openai.com/v1",
    projectId: "proj-research-01",
    proxyUrl: "http://proxy.internal:8080",
    useSystemProxy: false,
    status: "attention",
    statusLabel: "Quota renewal pending",
    createdAt: "2026-08-23T14:10:00Z",
    lastRefreshedAt: "2026-09-09T22:07:00Z",
    quota: { used: 940000, limit: 1000000, unit: "tokens", renewsAt: "2026-09-12T00:00:00Z" },
    routeUnitIds: ["route-openai-research"],
  },
  {
    id: "conn-anthropic-primary",
    providerId: "anthropic",
    accountName: "Inference Primary",
    accountEmail: "inference@metapi-evolution.dev",
    siteUrl: "https://api.anthropic.com",
    projectId: "",
    proxyUrl: null,
    useSystemProxy: true,
    status: "active",
    statusLabel: "Active and refreshing",
    createdAt: "2026-08-18T11:35:00Z",
    lastRefreshedAt: "2026-09-10T08:39:00Z",
    quota: { used: 58, limit: 100, unit: "route units", renewsAt: "2026-09-30T00:00:00Z" },
    routeUnitIds: ["route-anthropic-global"],
  },
];

export const OAUTH_ROUTE_UNITS: readonly OAuthRouteUnit[] = [
  {
    id: "route-openai-us-east",
    connectionId: "conn-openai-platform",
    name: "Production US East",
    modelFamily: "GPT-5",
    region: "us-east-1",
    status: "healthy",
    statusLabel: "Healthy",
    requestsPerMinute: 450,
    dailyQuota: { used: 41200, limit: 60000, unit: "requests", renewsAt: "2026-09-11T00:00:00Z" },
  },
  {
    id: "route-openai-eu-west",
    connectionId: "conn-openai-platform",
    name: "Production EU West",
    modelFamily: "GPT-5 mini",
    region: "eu-west-1",
    status: "healthy",
    statusLabel: "Healthy",
    requestsPerMinute: 180,
    dailyQuota: { used: 12300, limit: 30000, unit: "requests", renewsAt: "2026-09-11T00:00:00Z" },
  },
  {
    id: "route-openai-research",
    connectionId: "conn-openai-research",
    name: "Research Batch",
    modelFamily: "GPT-5",
    region: "us-central",
    status: "degraded",
    statusLabel: "Near daily quota",
    requestsPerMinute: 60,
    dailyQuota: { used: 9620, limit: 10000, unit: "requests", renewsAt: "2026-09-11T00:00:00Z" },
  },
  {
    id: "route-anthropic-global",
    connectionId: "conn-anthropic-primary",
    name: "Global Inference",
    modelFamily: "Claude Sonnet",
    region: "global",
    status: "healthy",
    statusLabel: "Healthy",
    requestsPerMinute: 240,
    dailyQuota: { used: 27300, limit: 45000, unit: "requests", renewsAt: "2026-09-11T00:00:00Z" },
  },
];

export const DOWNSTREAM_KEYS: readonly DownstreamKey[] = [
  {
    id: "key-production-gateway",
    name: "Production Gateway",
    tokenPrefix: "mpe_live_7K3A",
    fullToken: "sk-mpe_live_7K3A9f2c1d8e4b5a6d7e8f9a0b1c2d3e4f5a",
    groupName: "Production",
    tags: ["gateway", "primary"],
    description: "Primary gateway key for production services.",
    expiresAt: null,
    maxCost: 120,
    maxRequests: 80000,
    supportedModels: ["gpt-5", "gpt-5-mini", "claude-sonnet"],
    selectedGroupRoutes: ["gpt-*"],
    siteWeightMultipliers: { "1": 1.2, "7": 0.8 },
    excludedSiteIds: [],
    status: "active",
    statusLabel: "Active",
    scopes: ["models:read", "requests:write", "usage:read"],
    createdAt: "2026-07-28T10:00:00Z",
    lastUsedAt: "2026-09-10T08:44:00Z",
    requestQuota: { used: 53600, limit: 80000, unit: "requests", renewsAt: "2026-09-11T00:00:00Z" },
    requestsToday: 53600,
  },
  {
    id: "key-staging-ci",
    name: "Staging CI",
    tokenPrefix: "mpe_test_F91Q",
    fullToken: "sk-mpe_test_F91Q1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
    groupName: "Delivery",
    tags: ["ci", "staging"],
    description: "CI pipeline access for staging deployment.",
    expiresAt: "2026-12-31T23:59:59Z",
    maxCost: 32,
    maxRequests: 20000,
    supportedModels: ["gpt-5-mini"],
    selectedGroupRoutes: [],
    siteWeightMultipliers: {},
    excludedSiteIds: [2],
    status: "active",
    statusLabel: "Active",
    scopes: ["models:read", "requests:write"],
    createdAt: "2026-08-12T16:20:00Z",
    lastUsedAt: "2026-09-10T07:16:00Z",
    requestQuota: { used: 9200, limit: 20000, unit: "requests", renewsAt: "2026-09-11T00:00:00Z" },
    requestsToday: 9200,
  },
  {
    id: "key-analytics-readonly",
    name: "Analytics Read-only",
    tokenPrefix: "mpe_live_4XP8",
    fullToken: "sk-mpe_live_4XP8b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f",
    groupName: "Analytics",
    tags: ["readonly"],
    description: "Read-only usage analytics access.",
    expiresAt: null,
    maxCost: 8,
    maxRequests: 5000,
    supportedModels: [],
    selectedGroupRoutes: ["usage:*"],
    siteWeightMultipliers: {},
    excludedSiteIds: [],
    status: "paused",
    statusLabel: "Paused by owner",
    scopes: ["usage:read"],
    createdAt: "2026-08-30T09:45:00Z",
    lastUsedAt: "2026-09-08T17:04:00Z",
    requestQuota: { used: 0, limit: 5000, unit: "requests", renewsAt: "2026-09-11T00:00:00Z" },
    requestsToday: 0,
  },
  {
    id: "key-contractor-expired",
    name: "Contractor Preview",
    tokenPrefix: "mpe_test_C2M7",
    fullToken: "sk-mpe_test_C2M7f0e1d2c3b4a5968778695a4b3c2d1e0f",
    groupName: "Preview",
    tags: ["contractor"],
    description: "Preview access for contractor review.",
    expiresAt: "2026-09-01T23:59:59Z",
    maxCost: 5,
    maxRequests: 1000,
    supportedModels: ["gpt-4o-mini"],
    selectedGroupRoutes: [],
    siteWeightMultipliers: {},
    excludedSiteIds: [],
    status: "expired",
    statusLabel: "Expired on September 1",
    scopes: ["models:read"],
    createdAt: "2026-08-01T12:00:00Z",
    lastUsedAt: null,
    requestQuota: { used: 0, limit: 1000, unit: "requests", renewsAt: "2026-09-11T00:00:00Z" },
    requestsToday: 0,
  },
];

export const DOWNSTREAM_TREND_POINTS: readonly TrendPoint[] = [
  { id: "trend-2026-09-03", date: "2026-09-03", requests: 38200, errorRatePercent: 0.14 },
  { id: "trend-2026-09-04", date: "2026-09-04", requests: 41600, errorRatePercent: 0.11 },
  { id: "trend-2026-09-05", date: "2026-09-05", requests: 39800, errorRatePercent: 0.17 },
  { id: "trend-2026-09-06", date: "2026-09-06", requests: 45100, errorRatePercent: 0.09 },
  { id: "trend-2026-09-07", date: "2026-09-07", requests: 43700, errorRatePercent: 0.12 },
  { id: "trend-2026-09-08", date: "2026-09-08", requests: 48200, errorRatePercent: 0.08 },
  { id: "trend-2026-09-09", date: "2026-09-09", requests: 49100, errorRatePercent: 0.1 },
];

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: "announcement-v141-release",
    title: "Metapi Evolution 1.4.1 is available",
    summary: "The release adds improved provider routing diagnostics and refreshed management UI foundations.",
    level: "release",
    publishedAt: "2026-09-09T13:00:00Z",
    source: "Metapi Evolution",
    read: false,
  },
  {
    id: "announcement-route-maintenance",
    title: "Scheduled route maintenance",
    summary: "EU West route-unit capacity will be reduced between 01:00 and 01:20 UTC on September 12.",
    level: "maintenance",
    publishedAt: "2026-09-09T08:30:00Z",
    source: "Operations",
    read: false,
  },
  {
    id: "announcement-key-rotation",
    title: "Rotate keys created before August",
    summary: "Keys created before August 1 should be rotated before the next security review window.",
    level: "security",
    publishedAt: "2026-09-06T16:10:00Z",
    source: "Security",
    read: true,
  },
  {
    id: "announcement-model-catalog",
    title: "Model catalog metadata updated",
    summary: "Context-window and pricing metadata were refreshed for currently available model families.",
    level: "info",
    publishedAt: "2026-09-04T10:15:00Z",
    source: "Catalog",
    read: true,
  },
];

export const PROGRAM_EVENTS: readonly ProgramEvent[] = [
  {
    id: "event-oauth-refresh-success",
    type: "oauth",
    status: "success",
    statusLabel: "Completed",
    title: "OAuth token refreshed",
    detail: "Inference Primary refreshed its Anthropic access token.",
    occurredAt: "2026-09-10T08:39:00Z",
    read: false,
  },
  {
    id: "event-key-quota-warning",
    type: "key",
    status: "warning",
    statusLabel: "Attention required",
    title: "Research Sandbox is nearing quota",
    detail: "The connection has consumed 94% of its monthly token allocation.",
    occurredAt: "2026-09-10T07:55:00Z",
    read: false,
  },
  {
    id: "event-announcement-sync",
    type: "announcement",
    status: "success",
    statusLabel: "Completed",
    title: "Announcements synchronized",
    detail: "Four announcements are available in the local prototype feed.",
    occurredAt: "2026-09-09T13:02:00Z",
    read: true,
  },
  {
    id: "event-export-created",
    type: "export",
    status: "info",
    statusLabel: "Information",
    title: "Configuration export prepared",
    detail: "A JSON export was prepared with routing and notification sections selected.",
    occurredAt: "2026-09-09T10:21:00Z",
    read: true,
  },
  {
    id: "event-webhook-failure",
    type: "system",
    status: "failure",
    statusLabel: "Delivery failed",
    title: "Operations webhook did not respond",
    detail: "The endpoint exceeded the prototype delivery timeout during the last test.",
    occurredAt: "2026-09-08T18:44:00Z",
    read: true,
  },
];

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  {
    id: "channel-operations-webhook",
    kind: "webhook",
    name: "Operations Webhook",
    destination: "https://ops.example.test/hooks/metapi",
    status: "needs-attention",
    statusLabel: "Needs attention",
    eventTypes: ["oauth", "system"],
    lastDelivery: { status: "failed", statusLabel: "Last test failed", occurredAt: "2026-09-08T18:44:00Z" },
  },
  {
    id: "channel-oncall-telegram",
    kind: "telegram",
    name: "On-call Telegram",
    destination: "@metapi_evolution_oncall",
    status: "enabled",
    statusLabel: "Enabled",
    eventTypes: ["oauth", "key", "system"],
    lastDelivery: { status: "delivered", statusLabel: "Delivered", occurredAt: "2026-09-10T07:56:00Z" },
  },
  {
    id: "channel-release-smtp",
    kind: "smtp",
    name: "Release Digest",
    destination: "releases@metapi-evolution.dev",
    status: "enabled",
    statusLabel: "Enabled",
    eventTypes: ["announcement", "export"],
    lastDelivery: { status: "delivered", statusLabel: "Delivered", occurredAt: "2026-09-09T13:03:00Z" },
  },
  {
    id: "channel-personal-bark",
    kind: "bark",
    name: "Personal Bark",
    destination: "Device key not configured",
    status: "disabled",
    statusLabel: "Disabled",
    eventTypes: ["key"],
    lastDelivery: { status: "not-sent", statusLabel: "No delivery sent", occurredAt: null },
  },
  {
    id: "channel-legacy-serverchan",
    kind: "serverchan",
    name: "Legacy Server酱",
    destination: "Send key not configured",
    status: "disabled",
    statusLabel: "Disabled",
    eventTypes: ["system"],
    lastDelivery: { status: "not-sent", statusLabel: "No delivery sent", occurredAt: null },
  },
];

export const MODELS: readonly Model[] = [
  {
    id: "model-openai-gpt-5",
    provider: "OpenAI",
    brand: "OpenAI",
    name: "GPT-5",
    family: "GPT-5",
    status: "available",
    statusLabel: "Available",
    modalities: ["text", "image"],
    contextWindow: 400000,
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10,
    capabilities: ["reasoning", "tool use", "structured output"],
    description: "Flagship reasoning model with tool use and structured output.",
    tags: ["flagship", "reasoning"],
    supportedEndpointTypes: ["chat/completions", "responses"],
    accountCount: 3,
    tokenCount: 12,
    avgLatency: 1420,
    successRate: 0.993,
    siteOverrides: [
      { id: "override-gpt5-primary", siteName: "Primary", enabled: true, inputPricePerMillion: 1.15, outputPricePerMillion: 9.5 },
      { id: "override-gpt5-staging", siteName: "Staging", enabled: true, inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
    ],
  },
  {
    id: "model-anthropic-claude-sonnet",
    provider: "Anthropic",
    brand: "Anthropic",
    name: "Claude Sonnet",
    family: "Claude 4.5",
    status: "available",
    statusLabel: "Available",
    modalities: ["text", "image"],
    contextWindow: 200000,
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    capabilities: ["analysis", "vision", "long context"],
    description: "Balanced model for analysis, vision, and long-context tasks.",
    tags: ["balanced", "long context"],
    supportedEndpointTypes: ["messages"],
    accountCount: 2,
    tokenCount: 8,
    avgLatency: 1870,
    successRate: 0.988,
    siteOverrides: [
      { id: "override-sonnet-primary", siteName: "Primary", enabled: true, inputPricePerMillion: 3, outputPricePerMillion: 15 },
    ],
  },
  {
    id: "model-google-gemini-flash",
    provider: "Google",
    brand: "Google",
    name: "Gemini 2.5 Flash",
    family: "Gemini 2.5",
    status: "preview",
    statusLabel: "Preview",
    modalities: ["text", "image", "audio"],
    contextWindow: 1000000,
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 2.5,
    capabilities: ["multimodal", "fast inference", "long context"],
    description: "Low-latency multimodal model with a 1M context window.",
    tags: ["multimodal", "low-cost"],
    supportedEndpointTypes: ["generateContent"],
    accountCount: 1,
    tokenCount: 4,
    avgLatency: 980,
    successRate: 0.971,
    siteOverrides: [
      { id: "override-flash-lab", siteName: "Lab", enabled: false, inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },
    ],
  },
  {
    id: "model-openai-gpt-4o-mini",
    provider: "OpenAI",
    brand: "OpenAI",
    name: "GPT-4o mini",
    family: "GPT-4o",
    status: "deprecated",
    statusLabel: "Deprecated",
    modalities: ["text", "image"],
    contextWindow: 128000,
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    capabilities: ["low-cost", "vision"],
    description: "Legacy low-cost model with vision support.",
    tags: ["low-cost", "legacy"],
    supportedEndpointTypes: ["chat/completions"],
    accountCount: 1,
    tokenCount: 3,
    avgLatency: 820,
    successRate: 0.994,
    siteOverrides: [
      { id: "override-gpt4o-legacy", siteName: "Legacy", enabled: false, inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    ],
  },
];

export const EXPORT_SCOPES: readonly ExportScope[] = [
  { id: "export-oauth", label: "OAuth connections", description: "Providers, connections, and route-unit preferences.", recordCount: 7 },
  { id: "export-keys", label: "Downstream keys", description: "Key metadata without secret values.", recordCount: 4 },
  { id: "export-notifications", label: "Notification channels", description: "Channel settings without delivery secrets.", recordCount: 5 },
  { id: "export-preferences", label: "Workspace preferences", description: "Prototype display and routing preferences.", recordCount: 3 },
];

export const IMPORT_EXPORT_METADATA: ImportExportMetadata = {
  format: "JSON",
  schemaVersion: "metapi-evolution.prototype/v1",
  lastExportedAt: "2026-09-09T10:21:00Z",
  maximumImportSize: "5 MB",
  supportedSections: ["OAuth connections", "Downstream keys", "Notification channels", "Workspace preferences"],
};

export const ABOUT_METADATA: AboutMetadata = {
  productName: "Metapi Evolution",
  tagline: "A deliberate control plane for multi-provider AI routing.",
  version: "1.4.1",
  buildRevision: "2b4b896",
  releasedAt: "2026-09-09T13:00:00Z",
  license: "Apache-2.0",
  capabilities: [
    { id: "capability-routing", label: "Provider routing", description: "Direct traffic through monitored provider route units." },
    { id: "capability-keys", label: "Downstream access", description: "Issue scoped keys for teams and environments." },
    { id: "capability-observability", label: "Operational signals", description: "Review events, notices, quota, and delivery state." },
    { id: "capability-portability", label: "Portable settings", description: "Prepare local JSON exports and review imports safely." },
  ],
  techStack: [
    { id: "stack-react", name: "React", role: "User interface", version: "19" },
    { id: "stack-typescript", name: "TypeScript", role: "Typed application code", version: "7" },
    { id: "stack-vite", name: "Vite", role: "Build and development tooling", version: "7" },
    { id: "stack-tailwind", name: "Tailwind CSS", role: "Token-aware styling", version: "4" },
  ],
  resources: [
    { id: "resource-repository", label: "Repository", description: "Source code and issue tracking.", href: "https://github.com/yswlww/metapi-evolution" },
    { id: "resource-release-notes", label: "Release notes", description: "Version history and upgrade notes.", href: "https://github.com/yswlww/metapi-evolution/releases" },
    { id: "resource-documentation", label: "Documentation", description: "Architecture and operating references.", href: "https://github.com/yswlww/metapi-evolution/tree/main/docs" },
  ],
  releases: [
    {
      id: "release-v141",
      version: "1.4.1",
      releasedAt: "2026-09-09T13:00:00Z",
      status: "current",
      statusLabel: "Current release",
      highlights: ["Refreshed repository identity", "Published project pages", "Completed dependency remediation"],
    },
    {
      id: "release-v142",
      version: "1.4.2",
      releasedAt: "2026-09-16T00:00:00Z",
      status: "planned",
      statusLabel: "Planned",
      highlights: ["Eight-page UI prototype", "Local interaction polish", "No API integration in this stage"],
    },
  ],
};
