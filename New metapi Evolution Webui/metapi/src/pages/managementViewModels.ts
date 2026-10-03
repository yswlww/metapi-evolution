import type {
  DownstreamKey,
  DownstreamKeyStatus,
  OAuthConnection,
  OAuthConnectionStatus,
  OAuthProvider,
  OAuthRouteUnit,
  Quota,
} from "../data/prototype";

export interface OAuthConnectionFilters {
  query: string;
  providerId: "all" | string;
  status: "all" | OAuthConnectionStatus;
}

export interface DownstreamKeyFilters {
  query: string;
  group: "all" | string;
  status: "all" | DownstreamKeyStatus;
}

interface QuotaViewModel {
  used: number;
  limit: number;
  unit: Quota["unit"];
  renewsAt: string;
  percent: number;
  text: string;
}

export interface OAuthConnectionViewModel extends OAuthConnection {
  providerName: string;
  routeUnits: readonly OAuthRouteUnit[];
  quota: QuotaViewModel;
}

export interface DownstreamKeyViewModel extends DownstreamKey {
  group: string;
  tags: readonly string[];
  maskedToken: string;
  requestQuota: QuotaViewModel;
  costQuota: QuotaViewModel;
}

const DOWNSTREAM_KEY_METADATA: Readonly<
  Record<string, { group: string; costLimit: number; costPerRequest: number }>
> = {
  "key-production-gateway": { group: "Production", costLimit: 120, costPerRequest: 0.0012 },
  "key-staging-ci": { group: "Delivery", costLimit: 32, costPerRequest: 0.0008 },
  "key-analytics-readonly": { group: "Analytics", costLimit: 8, costPerRequest: 0.0001 },
  "key-contractor-expired": { group: "Preview", costLimit: 5, costPerRequest: 0.0007 },
};

function percent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function formatQuantity(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

function quotaViewModel(quota: Pick<Quota, "used" | "limit" | "unit" | "renewsAt"> | undefined | null): QuotaViewModel {
  // Backend OAuth snapshots may carry only { windows: { fiveHour, sevenDay } }
  // with no top-level used/limit. Tolerate that — show a neutral quota bar and
  // let the page resolve the selected window separately.
  const used = quota?.used ?? 0;
  const limit = quota?.limit ?? 0;
  const unit = quota?.unit ?? "tokens";
  return {
    used,
    limit,
    unit,
    renewsAt: quota?.renewsAt ?? "",
    percent: percent(used, limit),
    text: `${formatQuantity(used)} / ${formatQuantity(limit)} ${unit}`,
  };
}

function costQuotaViewModel(used: number, limit: number): QuotaViewModel {
  return {
    used,
    limit,
    unit: "requests",
    renewsAt: "",
    percent: percent(used, limit),
    // limit 0 means the key has no cost cap — show used cost without a fake limit.
    text: limit > 0
      ? `$${used.toFixed(2)} / $${limit.toFixed(2)} estimated cost`
      : `$${used.toFixed(2)} used · no cost cap`,
  };
}

export function filterOAuthConnections(
  connections: readonly OAuthConnection[],
  filters: OAuthConnectionFilters,
): readonly OAuthConnection[] {
  const query = filters.query.trim().toLowerCase();

  return connections.filter((connection) => {
    const matchesQuery =
      query.length === 0 ||
      [connection.accountName, connection.accountEmail, connection.providerId]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesProvider = filters.providerId === "all" || connection.providerId === filters.providerId;
    const matchesStatus = filters.status === "all" || connection.status === filters.status;

    return matchesQuery && matchesProvider && matchesStatus;
  });
}

export function buildOAuthConnectionViewModels(
  connections: readonly OAuthConnection[],
  providers: readonly OAuthProvider[],
  routeUnits: readonly OAuthRouteUnit[],
  filters: OAuthConnectionFilters,
): readonly OAuthConnectionViewModel[] {
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name]));

  return filterOAuthConnections(connections, filters).map((connection) => {
    const rawQuota = connection.quota as any;
    const flat = quotaViewModel(rawQuota);
    return {
      ...connection,
      providerName: providerNames.get(connection.providerId) ?? "Unknown provider",
      routeUnits: routeUnits.filter((routeUnit) => routeUnit.connectionId === connection.id),
      // Preserve the backend snapshot (windows.fiveHour / sevenDay) alongside
      // the computed flat view so the page can render the selected window.
      quota: { ...flat, windows: rawQuota?.windows ?? undefined },
    } as OAuthConnectionViewModel;
  });
}

export function downstreamKeyGroup(key: Pick<DownstreamKey, "id" | "groupName">): string {
  const groupName = "groupName" in key && key.groupName ? key.groupName : undefined;
  return groupName ?? DOWNSTREAM_KEY_METADATA[key.id]?.group ?? "Unassigned";
}

export function filterDownstreamKeys(
  keys: readonly DownstreamKey[],
  filters: DownstreamKeyFilters,
): readonly DownstreamKey[] {
  const query = filters.query.trim().toLowerCase();

  return keys.filter((key) => {
    const matchesQuery =
      query.length === 0 ||
      [key.name, key.tokenPrefix, key.groupName, ...key.scopes, ...key.tags, downstreamKeyGroup(key)]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesGroup = filters.group === "all" || downstreamKeyGroup(key) === filters.group;
    const matchesStatus = filters.status === "all" || key.status === filters.status;

    return matchesQuery && matchesGroup && matchesStatus;
  });
}

export function buildDownstreamKeyViewModels(
  keys: readonly DownstreamKey[],
  filters: DownstreamKeyFilters,
  usageOverrides: Readonly<Record<string, number>> = {},
): readonly DownstreamKeyViewModel[] {
  return filterDownstreamKeys(keys, filters).map((key) => {
    const metadata = DOWNSTREAM_KEY_METADATA[key.id] ?? {
      group: "Unassigned",
      costLimit: 20,
      costPerRequest: 0.001,
    };
    const requestsToday = usageOverrides[key.id] ?? key.requestsToday;
    const isPrototypeKey = Object.prototype.hasOwnProperty.call(DOWNSTREAM_KEY_METADATA, key.id);
    // Real keys: cost quota comes from the backend policy (usedCost / maxCost).
    // maxCost null means no cap — render $used with no fake limit.
    const hasRealCost = typeof key.maxCost === "number" && key.maxCost > 0;
    const costLimit = hasRealCost ? key.maxCost! : (isPrototypeKey ? metadata.costLimit : 0);
    const costUsed = hasRealCost
      ? (key.usedCost ?? 0)
      : isPrototypeKey
        ? Number((requestsToday * metadata.costPerRequest).toFixed(2))
        : (key.usedCost ?? 0);

    return {
      ...key,
      requestsToday,
      group: key.groupName || (isPrototypeKey ? metadata.group : "Unassigned"),
      tags: key.tags.length > 0 ? key.tags : key.scopes,
      maskedToken: `${key.tokenPrefix}••••••••`,
      requestQuota: quotaViewModel({
        used: requestsToday,
        limit: key.requestQuota.limit,
        unit: key.requestQuota.unit,
        renewsAt: key.requestQuota.renewsAt,
      }),
      costQuota: costQuotaViewModel(costUsed, costLimit),
    };
  });
}
