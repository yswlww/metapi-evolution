import type { Model } from "../../data/prototype";

export interface GroupPricing { quotaType: number; inputPerMillion?: number; outputPerMillion?: number; perCallInput?: number; perCallOutput?: number; perCallTotal?: number }
export interface PricingSource { siteId: number; siteName: string; accountId: number; username: string | null; ownerBy: string | null; enableGroups: string[]; groupPricing: Record<string, GroupPricing> }
export interface MarketplaceRow {
  name: string; accountCount: number; tokenCount: number; avgLatency: number | null; successRate: number | null;
  description?: string | null; tags?: string[]; supportedEndpointTypes?: string[]; pricingSources?: PricingSource[];
  accounts: Array<{ id: number; site: string; username: string | null; latency: number | null; balance: number }>;
}
export type MarketplaceModel = Omit<Model, "contextWindow" | "inputPricePerMillion" | "outputPricePerMillion" | "siteOverrides"> & {
  contextWindow: number | null; inputPricePerMillion: number | null; outputPricePerMillion: number | null;
  siteOverrides: ReadonlyArray<{ id: string; siteName: string; enabled: boolean; inputPricePerMillion: number | null; outputPricePerMillion: number | null }>;
  pricingSources: PricingSource[];
};
const known = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
function minimumPrice(sources: PricingSource[], key: "inputPerMillion" | "outputPerMillion") {
  const values = sources.flatMap((source) => Object.values(source.groupPricing ?? {}).filter((p) => p.quotaType === 0).map((p) => p[key])).filter(known);
  return values.length ? Math.min(...values) : null;
}
export function mapMarketplaceModel(raw: MarketplaceRow): MarketplaceModel {
  const pricingSources = raw.pricingSources ?? [];
  return {
    id: raw.name, provider: raw.accounts[0]?.site ?? "—", brand: "", name: raw.name,
    family: raw.name.split(/[-_/]/)[0] ?? raw.name, status: "available", statusLabel: "", modalities: [],
    contextWindow: null, inputPricePerMillion: minimumPrice(pricingSources, "inputPerMillion"), outputPricePerMillion: minimumPrice(pricingSources, "outputPerMillion"),
    capabilities: raw.tags ?? [], description: raw.description ?? "", tags: raw.tags ?? [], supportedEndpointTypes: raw.supportedEndpointTypes ?? [],
    accountCount: raw.accountCount ?? raw.accounts.length, tokenCount: raw.tokenCount ?? 0, avgLatency: raw.avgLatency ?? null, successRate: raw.successRate ?? null, pricingSources,
    siteOverrides: raw.accounts.map((a) => {
      const sources = pricingSources.filter((s) => s.accountId === a.id);
      return { id: String(a.id), siteName: a.site, enabled: true, inputPricePerMillion: minimumPrice(sources, "inputPerMillion"), outputPricePerMillion: minimumPrice(sources, "outputPerMillion") };
    }),
  };
}
export function uniqueAccountCount(models: MarketplaceModel[]): number { return new Set(models.flatMap((m) => m.siteOverrides.map((a) => a.id))).size; }
export function formatSuccessRate(value: number | null): string { return known(value) ? `${value.toFixed(1)}%` : "—"; }
export function formatPrice(value: number | null | undefined): string { return known(value) ? `$${value.toFixed(4)}` : "—"; }
