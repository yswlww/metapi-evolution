import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/index.js';
import {
  ACCOUNT_TOKEN_VALUE_STATUS_READY,
  isUsableAccountToken,
} from './accountTokenService.js';
import {
  requiresManagedAccountTokens,
  supportsDirectAccountRoutingConnection,
} from './accountExtraConfig.js';
import { getBlockedBrandRules, isModelBlockedByBrand } from './brandMatcher.js';

export type RouteChannelCandidate = {
  modelName: string;
  accountId: number;
  tokenId: number | null;
  oauthRouteUnitId: number | null;
};

export type DatabaseExecutor = typeof db;

export type SiteDisabledModelRow = { siteId: number; modelName: string };

/**
 * Single normalization rule for site-disabled models.
 *
 * Route building and the token-candidates statistics endpoint must agree on
 * which models a site has disabled, otherwise the UI keeps advertising a model
 * as "pending" that routing will never select. Both call this helper so there
 * is exactly one owner of the rule (including trim + case folding, so
 * whitespace-padded rows restored from a backup cannot bypass the filter).
 */
export function buildSiteDisabledModelFilter(rows: SiteDisabledModelRow[]): {
  isDisabled(siteId: number, modelName: string): boolean;
  size: number;
} {
  const disabledBySite = new Map<number, Set<string>>();
  for (const row of rows) {
    const normalizedSiteId = Number(row.siteId);
    const normalizedName = String(row.modelName ?? '').trim().toLowerCase();
    if (!Number.isFinite(normalizedSiteId) || normalizedSiteId <= 0 || !normalizedName) continue;
    const names = disabledBySite.get(normalizedSiteId) ?? new Set<string>();
    names.add(normalizedName);
    disabledBySite.set(normalizedSiteId, names);
  }
  return {
    isDisabled: (siteId: number, modelName: string) =>
      disabledBySite.get(Number(siteId))?.has(String(modelName ?? '').trim().toLowerCase()) ?? false,
    size: disabledBySite.size,
  };
}

function normalizeModelName(modelName: string | null | undefined): string {
  return (modelName || '').trim();
}

export function buildRouteChannelCandidateKey(input: {
  accountId: number;
  tokenId: number | null;
  oauthRouteUnitId: number | null;
}): string {
  return input.oauthRouteUnitId
    ? `route-unit:${input.oauthRouteUnitId}`
    : `account:${input.accountId}:${input.tokenId ?? 'account'}`;
}

export function buildAutomaticRouteChannelIdentity(input: {
  accountId: number;
  tokenId: number | null;
  oauthRouteUnitId: number | null;
  sourceModel: string | null;
}): string {
  const sourceModel = normalizeModelName(input.sourceModel).toLowerCase();
  const rawIdentity = input.oauthRouteUnitId
    ? `route-unit:${input.oauthRouteUnitId}:${sourceModel}`
    : `account:${input.accountId}:${input.tokenId ?? 'account'}:${sourceModel}`;
  return createHash('sha256').update(rawIdentity).digest('hex');
}

export async function loadFilteredRouteChannelCandidates(
  database: DatabaseExecutor = db,
): Promise<RouteChannelCandidate[]> {
  const tokenRows = await database.select().from(schema.tokenModelAvailability)
    .innerJoin(schema.accountTokens, eq(schema.tokenModelAvailability.tokenId, schema.accountTokens.id))
    .innerJoin(schema.accounts, eq(schema.accountTokens.accountId, schema.accounts.id))
    .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
    .where(and(
      eq(schema.tokenModelAvailability.available, true),
      eq(schema.accountTokens.enabled, true),
      eq(schema.accountTokens.valueStatus, ACCOUNT_TOKEN_VALUE_STATUS_READY),
      eq(schema.accounts.status, 'active'),
      eq(schema.sites.status, 'active'),
    ))
    .all();
  const usableTokenRows = tokenRows.filter((row) => (
    isUsableAccountToken(row.account_tokens)
    && requiresManagedAccountTokens(row.accounts)
  ));

  const accountRows = await database.select().from(schema.modelAvailability)
    .innerJoin(schema.accounts, eq(schema.modelAvailability.accountId, schema.accounts.id))
    .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
    .where(and(
      eq(schema.modelAvailability.available, true),
      eq(schema.accounts.status, 'active'),
      eq(schema.sites.status, 'active'),
    ))
    .all();

  const disabledModelRows = await database.select().from(schema.siteDisabledModels).all();
  const siteDisabledModelFilter = buildSiteDisabledModelFilter(disabledModelRows);

  const blockedBrandRules = getBlockedBrandRules(config.globalBlockedBrands);
  const globalAllowedModels = new Set(
    config.globalAllowedModels.map((modelName) => modelName.toLowerCase().trim()).filter(Boolean),
  );
  const isAllowed = (siteId: number, modelName: string) => {
    const normalized = modelName.toLowerCase();
    if (globalAllowedModels.size > 0 && !globalAllowedModels.has(normalized)) return false;
    if (siteDisabledModelFilter.isDisabled(siteId, modelName)) return false;
    return blockedBrandRules.length === 0 || !isModelBlockedByBrand(modelName, blockedBrandRules);
  };

  const routeUnitRows = await database.select({
    unitId: schema.oauthRouteUnits.id,
    accountId: schema.oauthRouteUnitMembers.accountId,
    sortOrder: schema.oauthRouteUnitMembers.sortOrder,
    memberId: schema.oauthRouteUnitMembers.id,
  }).from(schema.oauthRouteUnitMembers)
    .innerJoin(schema.oauthRouteUnits, eq(schema.oauthRouteUnitMembers.unitId, schema.oauthRouteUnits.id))
    .where(eq(schema.oauthRouteUnits.enabled, true))
    .all();
  routeUnitRows.sort((left, right) => (
    left.unitId - right.unitId
    || (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
    || left.memberId - right.memberId
  ));
  const representativeByUnitId = new Map<number, number>();
  const routeUnitByAccountId = new Map<number, { routeUnitId: number; representativeAccountId: number }>();
  for (const row of routeUnitRows) {
    if (!representativeByUnitId.has(row.unitId)) {
      representativeByUnitId.set(row.unitId, row.accountId);
    }
    routeUnitByAccountId.set(row.accountId, {
      routeUnitId: row.unitId,
      representativeAccountId: representativeByUnitId.get(row.unitId)!,
    });
  }

  const candidatesByModel = new Map<string, Map<string, RouteChannelCandidate>>();
  const addCandidate = (
    modelNameRaw: string | null | undefined,
    accountId: number,
    tokenId: number | null,
    siteId: number,
    oauthRouteUnitId: number | null = null,
  ) => {
    const modelName = normalizeModelName(modelNameRaw);
    if (!modelName || !isAllowed(siteId, modelName)) return;
    const candidate = { modelName, accountId, tokenId, oauthRouteUnitId };
    const candidates = candidatesByModel.get(modelName) ?? new Map<string, RouteChannelCandidate>();
    candidates.set(buildRouteChannelCandidateKey(candidate), candidate);
    candidatesByModel.set(modelName, candidates);
  };

  for (const row of usableTokenRows) {
    addCandidate(
      row.token_model_availability.modelName,
      row.accounts.id,
      row.account_tokens.id,
      row.accounts.siteId,
    );
  }

  for (const row of accountRows) {
    if (!supportsDirectAccountRoutingConnection(row.accounts)) continue;
    const routeUnit = routeUnitByAccountId.get(row.accounts.id);
    if (routeUnit) {
      addCandidate(
        row.model_availability.modelName,
        routeUnit.representativeAccountId,
        null,
        row.accounts.siteId,
        routeUnit.routeUnitId,
      );
      continue;
    }
    addCandidate(row.model_availability.modelName, row.accounts.id, null, row.accounts.siteId);
  }

  return Array.from(candidatesByModel.values()).flatMap((candidates) => Array.from(candidates.values()));
}
