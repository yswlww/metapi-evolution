import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import AccountEditor from './accounts/AccountEditor';
import AccountModels from './accounts/AccountModels';
import TokenEditor, { TokenGroupSelect } from './accounts/TokenEditor';
import { useManagementText } from '../lib/managementParityText';
import { batchOutcome, buildOrderUpdates, filterTokens, rotateAdminCredential, sortManagementRows, type BatchResponse } from '../lib/managementParity';
import {
  BadgeCheck,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  User,
  Users,
  Server,
  Trash2,
  Wallet,
  Activity,
  Plus,
  Copy,
  Star,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { apiGet, apiPost, apiPut } from "../lib/client";
import {
  updateRuntimeSettings,
  fetchAccounts,
  deleteAccount,
  refreshAccountBalance,
  fetchAccountTokens,
  addAccountToken,
  setDefaultAccountToken,
  deleteAccountToken,
  updateAccountToken,
  getAccountTokenValue,
  syncAccountTokens,
  syncAllAccountTokens,
  loginAccount,
  createAccount,
  fetchSites,
  verifyAccountToken,
  rebindAccountSession,
  refreshAccountHealth,
  updateAccount,
  triggerCheckin,
} from "../lib/source";
import type { Account } from "../data/prototype";

/** Administrator profile plus upstream account and token management. */
export default function Accounts() {
  const t = useUiText();
  const l = useManagementText();
  const location = useLocation();
  const [rawAccounts, setRawAccounts] = useState<any[]>([]);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [modelAccount, setModelAccount] = useState<any | null>(null);
  const [editingToken, setEditingToken] = useState<any | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<number>>(new Set());
  const [selectedTokens, setSelectedTokens] = useState<Set<number>>(new Set());
  const [managementBusy, setManagementBusy] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [connectionFilter, setConnectionFilter] = useState('all');
  const [tokenFilters, setTokenFilters] = useState({ query: '', status: 'all', accountId: '', group: '' });
  const [tokenGroup, setTokenGroup] = useState('default');
  const { showToast } = useToast();
  const { token, login } = useAuth();

  const [maskedToken, setMaskedToken] = useState("••••••••");
  const [reveal, setReveal] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [confirmToken, setConfirmToken] = useState("");
  const [changing, setChanging] = useState(false);
  const [ipAllow, setIpAllow] = useState("");
  const [tab, setTab] = useState<"profile" | "upstream">("profile");
  const [upstreamAccounts, setUpstreamAccounts] = useState<Account[]>([]);
  const [upstreamLoading, setUpstreamLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [accountTokens, setAccountTokens] = useState<any[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenAddOpen, setTokenAddOpen] = useState(false);
  const [tokenForm, setTokenForm] = useState({ accountId: "", name: "", token: "" });
  const [revealedToken, setRevealedToken] = useState<number | null>(null);
  const [revealedValue, setRevealedValue] = useState("");
  const [availableSites, setAvailableSites] = useState<any[]>([]);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addAccountForm, setAddAccountForm] = useState({ siteId: "", username: "", password: "", mode: "login" as "login" | "token" | "apikey", accessToken: "", apiKey: "" });
  const [addingAccount, setAddingAccount] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Verify the entered access token against the selected site. The backend
  // refuses to create an account until the token verifies.
  const handleVerifyToken = async () => {
    const siteId = Number(addAccountForm.siteId);
    if (!Number.isFinite(siteId) || siteId <= 0) { showToast(t("ui.toast.select_site")); return; }
    if (!addAccountForm.accessToken.trim()) { showToast(t("ui.toast.access_token_required")); return; }
    setVerifying(true);
    try {
      const res = await verifyAccountToken({ siteId, accessToken: addAccountForm.accessToken.trim() });
      if (res.success) {
        showToast(t("ui.toast.token_verified"));
      } else {
        showToast(res.message ?? t("ui.toast.token_verify_failed"));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.token_verify_failed"));
    } finally {
      setVerifying(false);
    }
  };

  const loadUpstream = async () => {
    setUpstreamLoading(true);
    try {
      const [data, snapshot] = await Promise.all([fetchAccounts({ refresh: true }), apiGet<{ accounts?: any[] }>('/api/accounts?refresh=1')]);
      setUpstreamAccounts(data);
      setRawAccounts(snapshot.accounts ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.load_accounts_failed"));
    } finally {
      setUpstreamLoading(false);
    }
  };

  const loadTokens = async (accountId?: number) => {
    setTokensLoading(true);
    try {
      const data = await fetchAccountTokens(accountId);
      setAccountTokens(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.load_tokens_failed"));
    } finally {
      setTokensLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "upstream") {
      loadUpstream();
      loadTokens();
      fetchSites()
        .then((s) => setAvailableSites(s))
        .catch(() => setAvailableSites([]));
    }
  }, [tab]);

  const handleAddAccount = async () => {
    const siteId = Number(addAccountForm.siteId);
    if (!Number.isFinite(siteId) || siteId <= 0) {
      showToast(t("ui.toast.select_site"));
      return;
    }
    setAddingAccount(true);
    try {
      if (addAccountForm.mode === "login") {
        if (!addAccountForm.username.trim() || !addAccountForm.password) {
          showToast(t("ui.toast.creds_required"));
          return;
        }
        await loginAccount({
          siteId,
          username: addAccountForm.username.trim(),
          password: addAccountForm.password,
        });
        showToast(t("ui.toast.account_login_created"));
      } else if (addAccountForm.mode === "apikey") {
        if (!addAccountForm.apiKey.trim()) {
          showToast(t("ui.toast.api_key_required"));
          return;
        }
        await createAccount({
          siteId,
          username: addAccountForm.username.trim() || undefined,
          apiToken: addAccountForm.apiKey.trim(),
          credentialMode: "apiKey",
        });
        showToast(t("ui.toast.account_created_key"));
      } else {
        if (!addAccountForm.accessToken.trim()) {
          showToast(t("ui.toast.access_token_required"));
          return;
        }
        await createAccount({
          siteId,
          username: addAccountForm.username.trim() || undefined,
          accessToken: addAccountForm.accessToken.trim(),
        });
        showToast(t("ui.toast.account_created_token"));
      }
      setAddAccountOpen(false);
      setAddAccountForm({ siteId: "", username: "", password: "", mode: "login", accessToken: "", apiKey: "" });
      await loadUpstream();
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.add_account_failed"));
    } finally {
      setAddingAccount(false);
    }
  };

  const handleAddToken = async () => {
    const accountId = Number(tokenForm.accountId);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      showToast(t("ui.toast.select_account"));
      return;
    }
    if (!tokenForm.token.trim()) {
      showToast(t("ui.toast.token_value_required"));
      return;
    }
    try {
      await addAccountToken({
        accountId,
        name: tokenForm.name.trim() || undefined,
        token: tokenForm.token.trim(),
        group: tokenGroup,
      });
      showToast(t("ui.toast.token_added"));
      setTokenAddOpen(false);
      setTokenForm({ accountId: "", name: "", token: "" });
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.add_token_failed"));
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await setDefaultAccountToken(id);
      showToast(t("ui.toast.default_token_set"));
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.set_default_failed"));
    }
  };

  const handleDeleteToken = async (id: number) => {
    if (!window.confirm(t("ui.accounts.confirm_delete_token"))) return;
    try {
      await deleteAccountToken(id);
      showToast(t("ui.toast.token_deleted"));
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.delete_token_failed"));
    }
  };

  const handleToggleToken = async (id: number, enabled: boolean) => {
    try {
      await updateAccountToken(id, { enabled });
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.toggle_failed"));
    }
  };

  const handleRevealToken = async (id: number) => {
    if (revealedToken === id) { setRevealedToken(null); setRevealedValue(""); return; }
    try {
      const { token } = await getAccountTokenValue(id);
      setRevealedToken(id);
      setRevealedValue(token ?? "");
      showToast(token ? t("ui.toast.token_value_shown") : t("ui.toast.token_value_unavailable"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.reveal_failed"));
    }
  };

  const handleSyncTokens = async (accountId?: number) => {
    try {
      if (accountId) { await syncAccountTokens(accountId); showToast(t("ui.toast.tokens_synced_one")); }
      else { await syncAllAccountTokens(false); showToast(t("ui.toast.tokens_synced_all")); }
      await loadTokens(accountId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.sync_failed"));
    }
  };

  const handleToggleCheckin = async (id: number, enabled: boolean) => {
    try {
      await updateAccount(id, { checkinEnabled: enabled });
      // Update the local row immediately so the button label flips without
      // waiting on the server-side snapshot cache.
      setUpstreamAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, checkinEnabled: enabled } : a)));
      showToast(enabled ? t("ui.toast.checkin_enabled") : t("ui.toast.checkin_disabled"));
      // Refresh with ?refresh=1 to bypass the snapshot cache.
      const [data, snapshot] = await Promise.all([fetchAccounts({ refresh: true }), apiGet<{ accounts?: any[] }>('/api/accounts?refresh=1')]);
      setUpstreamAccounts(data);
      setRawAccounts(snapshot.accounts ?? []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.checkin_toggle_failed"));
    }
  };

  const handleRebind = async (id: number) => {
    const token = window.prompt(t("ui.toast.rebind_prompt"));
    if (!token) return;
    try {
      await rebindAccountSession(id, { accessToken: token.trim() });
      showToast(t("ui.toast.session_rebound"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.rebind_failed"));
    }
  };

  const handleRefreshHealth = async (id?: number) => {
    try {
      await refreshAccountHealth(id ? { accountId: id } : {});
      showToast(id ? t("ui.toast.health_refresh_queued_account") : t("ui.toast.health_refresh_queued"));
      await loadUpstream();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.health_refresh_failed"));
    }
  };

  const handleTriggerCheckin = async (id: number) => {
    try {
      await triggerCheckin(id);
      showToast(t("ui.toast.checkin_triggered"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.checkin_failed"));
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!window.confirm(t("ui.accounts.confirm_delete_account"))) return;
    try {
      await deleteAccount(id);
      setUpstreamAccounts((prev) => prev.filter((a) => a.id !== id));
      showToast(t("ui.toast.account_deleted"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.delete_failed"));
    }
  };

  const handleRefreshBalance = async (id: number) => {
    setBusy((b) => ({ ...b, [`bal-${id}`]: true }));
    try {
      await refreshAccountBalance(id);
      showToast(t("ui.toast.balance_refreshed"));
      await loadUpstream();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.refresh_failed"));
    } finally {
      setBusy((b) => ({ ...b, [`bal-${id}`]: false }));
    }
  };

  // Load the current admin token's masked form + runtime settings from backend.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await apiGet<{ masked?: string }>("/api/settings/auth/info");
        if (!cancelled && info?.masked) setMaskedToken(info.masked);
      } catch {
        /* backend unreachable — keep placeholder */
      }
      try {
        const runtime = await apiGet<any>("/api/settings/runtime");
        if (!cancelled) {
          setIpAllow(Array.isArray(runtime?.adminIpAllowlist) ? runtime.adminIpAllowlist.join(", ") : "");
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRotate = async () => {
    if (!newToken.trim()) {
      showToast(t("ui.accounts.token_required"));
      return;
    }
    if (newToken !== confirmToken) {
      showToast(t("ui.accounts.token_mismatch"));
      return;
    }
    setChanging(true);
    try {
      await rotateAdminCredential(newToken, async nextToken => {
        const result = await apiPost<{ success?: boolean; message?: string }>('/api/settings/auth/change', { oldToken: token, newToken: nextToken });
        if (result.success === false) throw new Error(result.message || t('ui.accounts.token_rotate_failed'));
      }, login);
      setMaskedToken(newToken.trim().slice(0, 4) + "••••••••");
      setNewToken("");
      setConfirmToken("");
      showToast(t("ui.accounts.token_rotated"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.accounts.token_rotate_failed"));
    } finally {
      setChanging(false);
    }
  };

  const handleSaveSession = async () => {
    try {
      await updateRuntimeSettings({
        adminIpAllowlist: ipAllow.split(",").map((s) => s.trim()).filter(Boolean),
      });
      showToast(t("ui.accounts.settings_saved"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("ui.toast.save_failed"));
    }
  };

  const connectionMode = (row: any) => row?.credentialMode === 'apikey' || row?.capabilities?.proxyOnly ? 'apikey' : 'session';
  const orderedAccounts = sortManagementRows(rawAccounts).map(raw => upstreamAccounts.find(a => a.id === raw.id)).filter((a): a is Account => !!a);
  const visibleAccounts = (rawAccounts.length ? orderedAccounts : upstreamAccounts).filter(a => (!accountSearch || `${a.username} ${a.siteName}`.toLowerCase().includes(accountSearch.toLowerCase())) && (connectionFilter === 'all' || connectionMode(rawAccounts.find(r => r.id === a.id)) === connectionFilter));
  const visibleTokens = filterTokens(accountTokens, tokenFilters);
  const toggleId = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => setter(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const runManagement = async (operation: () => Promise<unknown>) => { setManagementBusy(true); try { await operation(); await loadUpstream(); await loadTokens(); } catch(e) { showToast(e instanceof Error ? e.message : l('failed')); } finally { setManagementBusy(false); } };
  const runBatch = (kind: 'accounts' | 'account-tokens', action: string) => {
    const selected = kind === 'accounts' ? selectedAccounts : selectedTokens;
    if (!selected.size || (action === 'delete' && !window.confirm(l('confirmDelete')))) return;
    void runManagement(async () => { const result = batchOutcome(await apiPost<BatchResponse>(`/api/${kind}/batch`, { ids: [...selected], action })); (kind === 'accounts' ? setSelectedAccounts : setSelectedTokens)(new Set(result.failedIds)); showToast(`${l('success')}: ${result.succeeded}; ${l('failed')}: ${result.failedIds.length}${result.messages.length ? ` — ${result.messages.join('; ')}` : ''}`); });
  };
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('siteId') || params.get('segment') === 'tokens') setTab('upstream');
    if (params.get('create') === '1' && params.get('siteId')) { setAddAccountOpen(true); setAddAccountForm(prev => ({ ...prev, siteId: params.get('siteId') || '' })); }
  }, [location.search]);

  return (
    <div className="space-y-6">
      {editingAccount && <AccountEditor key={editingAccount.id} account={editingAccount} onClose={() => setEditingAccount(null)} onSaved={loadUpstream} />}
      {modelAccount && <AccountModels key={modelAccount.id} account={modelAccount} onClose={() => setModelAccount(null)} />}
      {editingToken && <TokenEditor key={editingToken.id} token={editingToken} onClose={() => setEditingToken(null)} onSaved={loadTokens} />}
      <PageHeader
        eyebrow={t("ui.accounts.eyebrow")}
        title={t("ui.accounts.title")}
        description={t("ui.accounts.desc")}
      />

      {/* Tab switch: Admin profile vs upstream account credentials */}
      <div className="flex gap-1.5">
        {([
          { key: "profile" as const, label: t("ui.accounts.tab_profile"), icon: <User size={13} /> },
          { key: "upstream" as const, label: t("ui.accounts.tab_upstream"), icon: <Users size={13} /> },
        ]).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
              tab === item.key
                ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
            }`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {tab === "upstream" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label={t("ui.accounts.accounts_label")} value={upstreamAccounts.length} icon={<Users size={16} />} />
              <StatCard label={t("ui.accounts.active_label")} value={upstreamAccounts.filter((a) => a.status === "healthy").length} trend={{ label: "enabled", tone: "lime" }} icon={<Activity size={16} />} />
              <StatCard label={t("ui.accounts.total_balance")} value={`$${upstreamAccounts.reduce((a, c) => a + c.balance, 0).toFixed(2)}`} icon={<Wallet size={16} />} />
              <StatCard label={t("ui.accounts.sites_label")} value={new Set(upstreamAccounts.map((a) => a.siteSlug)).size} icon={<Server size={16} />} />
            </div>
            <button
              type="button"
              onClick={() => setAddAccountOpen((v) => !v)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
            >
              <Plus size={13} /> ADD ACCOUNT
            </button>
          </div>

          {addAccountOpen && (
            <div className="card p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.accounts.site")}</span>
                  <select
                    value={addAccountForm.siteId}
                    onChange={(e) => setAddAccountForm((f) => ({ ...f, siteId: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                  >
                    <option value="">{t("ui.accounts.select_site")}</option>
                    {availableSites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.adapter})</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.accounts.credential")}</span>
                  <select
                    value={addAccountForm.mode}
                    onChange={(e) => setAddAccountForm((f) => ({ ...f, mode: e.target.value as "login" | "token" | "apikey" }))}
                    className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                  >
                    <option value="login">{t("ui.accounts.password_login")}</option>
                    <option value="token">{t("ui.accounts.access_token")}</option>
                    <option value="apikey">{t("ui.accounts.api_key")}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.accounts.username")}</span>
                  <input
                    value={addAccountForm.username}
                    onChange={(e) => setAddAccountForm((f) => ({ ...f, username: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                  />
                </label>
                {addAccountForm.mode === "login" ? (
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.accounts.password")}</span>
                    <input
                      type="password"
                      value={addAccountForm.password}
                      onChange={(e) => setAddAccountForm((f) => ({ ...f, password: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    />
                  </label>
                ) : addAccountForm.mode === "apikey" ? (
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.accounts.api_key")}</span>
                    <input
                      value={addAccountForm.apiKey}
                      onChange={(e) => setAddAccountForm((f) => ({ ...f, apiKey: e.target.value }))}
                      placeholder="sk-…"
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.accounts.access_token")}</span>
                    <div className="flex gap-2">
                      <input
                        value={addAccountForm.accessToken}
                        onChange={(e) => setAddAccountForm((f) => ({ ...f, accessToken: e.target.value }))}
                        placeholder="sk-…"
                        className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                      />
                      <button type="button" onClick={handleVerifyToken} disabled={verifying}
                        className="h-9 shrink-0 rounded-lg border border-[color:var(--color-border)] px-2.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40">
                        {verifying ? t("ui.accounts.verifying") : t("ui.accounts.verify")}
                      </button>
                    </div>
                  </label>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={handleAddAccount} disabled={addingAccount}
                  className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40">
                  {addingAccount ? t("ui.accounts.adding") : t("ui.common.add")}
                </button>
              </div>
            </div>
          )}

          <div className="card flex flex-wrap gap-3 p-4">
            <input aria-label={l('search')} placeholder={l('search')} value={accountSearch} onChange={e => setAccountSearch(e.target.value)} className="rounded border bg-[color:var(--color-panel)] p-2" />
            <select aria-label={l('connection')} value={connectionFilter} onChange={e => setConnectionFilter(e.target.value)}><option value="all">{l('all')}</option><option value="session">{l('session')}</option><option value="apikey">{l('apiKey')}</option></select>
            <button onClick={() => setSelectedAccounts(new Set(visibleAccounts.map(a => a.id)))}>{l('selectAll')}</button><button onClick={() => setSelectedAccounts(new Set())}>{l('clear')}</button>
            {selectedAccounts.size > 0 && <div className="flex flex-wrap gap-3" role="group" aria-label={l('select')}><span>{selectedAccounts.size}</span>{(['enable', 'disable', 'refreshBalance', 'delete'] as const).map(action => <button key={action} disabled={managementBusy} onClick={() => runBatch('accounts', action)}>{l(action === 'enable' ? 'enabled' : action === 'disable' ? 'disabled' : action === 'refreshBalance' ? 'balance' : 'delete')}</button>)}</div>}
          </div>
          <div className="card overflow-hidden">
            {upstreamLoading ? (
              <div className="p-8 text-center text-sm text-[color:var(--color-muted)]">{t("ui.accounts.loading")}</div>
            ) : upstreamAccounts.length === 0 ? (
              <div className="p-8 text-center text-sm text-[color:var(--color-muted)]">{t("ui.accounts.none")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)]">
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.account")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.site")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.status")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.balance")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.last_checkin")}</th>
                      <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAccounts.map((account) => (
                      <tr key={account.id} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-[color:var(--color-fg)]"><label className="flex gap-2"><input type="checkbox" aria-label={`${l('select')} ${account.username}`} checked={selectedAccounts.has(account.id)} onChange={() => toggleId(setSelectedAccounts, account.id)} />{account.username}</label><small>{l(connectionMode(rawAccounts.find(r => r.id === account.id)) === 'apikey' ? 'apiKey' : 'session')}</small></td>
                        <td className="px-4 py-3 text-[color:var(--color-muted)]">{account.siteName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider ${
                            account.status === "healthy" ? "bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]" :
                            account.status === "unhealthy" ? "bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)]" :
                            "bg-[color:var(--color-muted)]/10 text-[color:var(--color-muted)]"
                          }`}>{account.statusLabel}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[color:var(--color-fg)]">${account.balance.toFixed(2)}</td>
                        <td className="px-4 py-3 font-mono text-[10px] text-[color:var(--color-muted)]">
                          {account.lastCheckin ? new Date(account.lastCheckin).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button disabled={managementBusy} onClick={() => setEditingAccount(rawAccounts.find(r => r.id === account.id))}>{l('edit')}</button>
                            <button disabled={managementBusy} onClick={() => runManagement(() => apiPut(`/api/accounts/${account.id}`, { isPinned: !rawAccounts.find(r => r.id === account.id)?.isPinned }))}>{l('pin')}</button>
                            {(['up', 'down'] as const).map(direction => <button key={direction} disabled={managementBusy} onClick={() => runManagement(() => Promise.all(buildOrderUpdates(rawAccounts, account.id, direction).map(update => apiPut(`/api/accounts/${update.id}`, { sortOrder: update.sortOrder }))))}>{l(direction)}</button>)}
                            <button type="button" onClick={() => handleRefreshBalance(account.id)} disabled={busy[`bal-${account.id}`]}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40">
                              {busy[`bal-${account.id}`] ? "…" : t("ui.accounts.balance")}
                            </button>
                            <button type="button" onClick={() => handleRefreshHealth(account.id)}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              {t("ui.accounts.health")}
                            </button>
                            <button type="button" onClick={() => handleRebind(account.id)}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              {t("ui.accounts.rebind")}
                            </button>
                            <button type="button" onClick={() => handleToggleCheckin(account.id, account.checkinEnabled === false)}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              {account.checkinEnabled === false ? t("ui.accounts.enable_checkin") : t("ui.accounts.disable_checkin")}
                            </button>
                            <button type="button" onClick={() => handleTriggerCheckin(account.id)}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              {t("ui.accounts.checkin_btn")}
                            </button>
                            <button type="button" onClick={() => setModelAccount(rawAccounts.find(r => r.id === account.id) ?? { id: account.id, username: account.username, siteId: Number(account.siteSlug) })}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              {l('models')}
                            </button>
                            <button type="button" onClick={() => handleDeleteAccount(account.id)}
                              className="rounded-md border border-[color:var(--color-rose)]/40 px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10">
                              {t("ui.common.delete")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-xs text-[color:var(--color-muted)]">
            {t("ui.accounts.upstream_hint")}
          </p>

          {/* Account tokens */}
          <section className="space-y-4">
            <SectionTitle
              title={t("ui.accounts.tokens_title")}
              description={t("ui.accounts.tokens_desc")}
              eyebrow={t("ui.shell.nav.tokens")}
              actions={
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleSyncTokens()}
                    className="h-8 rounded-lg border border-[color:var(--color-border)] px-3 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                    <RefreshCw size={11} /> {t("ui.accounts.sync_all")}
                  </button>
                  <button type="button" onClick={() => setTokenAddOpen((v) => !v)}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-3 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
                    <Plus size={11} /> {t("ui.accounts.add_token")}
                  </button>
                </div>
              }
            />

            <div className="card flex flex-wrap gap-3 p-3">
              <input aria-label={l('search')} value={tokenFilters.query} placeholder={l('search')} onChange={e => setTokenFilters(f => ({ ...f, query: e.target.value }))} className="rounded border bg-[color:var(--color-panel)] p-2" />
              <select aria-label={l('status')} value={tokenFilters.status} onChange={e => setTokenFilters(f => ({ ...f, status: e.target.value }))}>{['all', 'enabled', 'disabled', 'pending'].map(s => <option key={s} value={s}>{l(s as 'all' | 'enabled' | 'disabled' | 'pending')}</option>)}</select>
              <select aria-label={l('username')} value={tokenFilters.accountId} onChange={e => setTokenFilters(f => ({ ...f, accountId: e.target.value }))}><option value="">{l('all')}</option>{upstreamAccounts.map(a => <option key={a.id} value={a.id}>{a.username} · {a.siteName}</option>)}</select>
              <select aria-label={l('group')} value={tokenFilters.group} onChange={e => setTokenFilters(f => ({ ...f, group: e.target.value }))}><option value="">{l('all')}</option>{[...new Set(accountTokens.map(t => t.tokenGroup || 'default'))].map(g => <option key={g} value={g}>{g}</option>)}</select>
              <button onClick={() => setSelectedTokens(new Set(visibleTokens.map(t => t.id)))}>{l('selectAll')}</button><button onClick={() => setSelectedTokens(new Set())}>{l('clear')}</button>
              {selectedTokens.size > 0 && <div className="flex flex-wrap gap-3"><span>{selectedTokens.size}</span>{(['enable', 'disable', 'delete'] as const).map(action => <button key={action} disabled={managementBusy} onClick={() => runBatch('account-tokens', action)}>{l(action === 'enable' ? 'enabled' : action === 'disable' ? 'disabled' : 'delete')}</button>)}</div>}
            </div>
            {tokenAddOpen && (
              <div className="card p-4">
                <TokenGroupSelect accountId={Number(tokenForm.accountId)} value={tokenGroup} onChange={setTokenGroup} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.accounts.account")}</span>
                    <select
                      value={tokenForm.accountId}
                      onChange={(e) => setTokenForm((f) => ({ ...f, accountId: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    >
                      <option value="">{t("ui.accounts.select_account")}</option>
                      {upstreamAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.username} ({a.siteName})</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.accounts.name")}</span>
                    <input
                      value={tokenForm.name}
                      onChange={(e) => setTokenForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={t("ui.accounts.name_ph")}
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.accounts.token_value")}</span>
                    <input
                      value={tokenForm.token}
                      onChange={(e) => setTokenForm((f) => ({ ...f, token: e.target.value }))}
                      placeholder="sk-…"
                      className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                    />
                  </label>
                </div>
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={handleAddToken}
                    className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
                    ADD
                  </button>
                </div>
              </div>
            )}

            <div className="card overflow-hidden">
              {tokensLoading ? (
                <div className="p-6 text-center text-sm text-[color:var(--color-muted)]">{t("ui.accounts.loading_tokens")}</div>
              ) : accountTokens.length === 0 ? (
                <div className="p-6 text-center text-sm text-[color:var(--color-muted)]">{t("ui.accounts.no_tokens")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)]">
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.name")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.account")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.site")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.token")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.status")}</th>
                        <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.accounts.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTokens.map((tk) => (
                        <tr key={tk.id} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 font-medium text-[color:var(--color-fg)]">
                              <input type="checkbox" aria-label={`${l('select')} ${tk.name}`} checked={selectedTokens.has(tk.id)} onChange={() => toggleId(setSelectedTokens, tk.id)} />
                              {tk.name ?? `token-${tk.id}`} <small>{tk.tokenGroup || 'default'}</small>
                              {tk.isDefault && <Star size={10} className="text-[color:var(--color-lime)]" />}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[color:var(--color-muted)]">{tk.account?.username ?? ""}</td>
                          <td className="px-4 py-3 text-[color:var(--color-muted)]">{tk.site?.name ?? ""}</td>
                          <td className="px-4 py-3 font-mono text-[color:var(--color-muted)]">
                          {revealedToken === tk.id ? (revealedValue || (tk.token ?? "")) : (tk.tokenMasked ?? tk.token ?? "")}
                        </td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => handleToggleToken(tk.id, !tk.enabled)}
                              className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider ${
                                tk.enabled ? "bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]" : "bg-[color:var(--color-muted)]/10 text-[color:var(--color-muted)]"
                              }`}>
                              {tk.enabled ? t("ui.routes.enabled") : t("ui.accounts.filter.disabled")}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <button onClick={() => setEditingToken(tk)}>{l('edit')}</button>
                              {!tk.isDefault && (
                                <button type="button" onClick={() => handleSetDefault(tk.id)}
                                  className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                                  {t("ui.accounts.default_tag")}
                                </button>
                              )}
                              <button type="button" onClick={() => handleSyncTokens(tk.account?.id)}
                                className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                                {t("ui.accounts.sync")}
                              </button>
                              <button type="button" onClick={() => handleRevealToken(tk.id)}
                                className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                                {revealedToken === tk.id ? t("ui.accounts.hide") : t("ui.accounts.reveal")}
                              </button>
                              <button type="button" onClick={() => handleDeleteToken(tk.id)}
                                className="rounded-md border border-[color:var(--color-rose)]/40 px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10">
                                {t("ui.common.delete")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <>
      {/* Profile summary */}
      <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--color-lime)]/15 text-[color:var(--color-lime)]">
          <User size={30} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl tracking-tight text-[color:var(--color-fg)]">
              {t("ui.accounts.admin_name")}
            </h2>
            <span className="chip chip-lime">{t("ui.accounts.role_admin")}</span>
          </div>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            {t("ui.accounts.profile_desc")}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 font-mono text-[11px] text-[color:var(--color-muted)]">
            <span className="flex items-center gap-1.5">
              <BadgeCheck size={13} className="text-[color:var(--color-lime)]" />
              {t("ui.accounts.signed_in")}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-[color:var(--color-lime)]" />
              {t("ui.accounts.single_admin")}
            </span>
          </div>
        </div>
      </div>

      {/* Admin token */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.accounts.token_title")}
          description={t("ui.accounts.token_desc")}
          eyebrow={t("ui.settings.tab_security")}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card p-5">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--color-muted)]">
              {t("ui.accounts.current_token")}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 py-2 font-mono text-sm text-[color:var(--color-fg)]">
                {reveal ? token : maskedToken}
              </code>
              <button
                type="button"
                onClick={() => setReveal(!reveal)}
                className="shrink-0 rounded-lg border border-[color:var(--color-border)] p-2 text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                aria-label={reveal ? t("ui.accounts.hide_token") : t("ui.accounts.reveal_token")}
              >
                {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Rotate token */}
          <div className="card p-5 lg:col-span-2">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--color-muted)]">
              {t("ui.accounts.rotate_token")}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="password"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                placeholder={t("ui.accounts.new_token_ph")}
                className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
              />
              <input
                type="password"
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value)}
                placeholder={t("ui.accounts.confirm_token_ph")}
                className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-[color:var(--color-muted)]">{t("ui.accounts.rotate_hint")}</span>
              <button
                type="button"
                onClick={handleRotate}
                disabled={changing}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40"
              >
                <RefreshCw size={12} className={changing ? "animate-spin" : ""} />
                {t("ui.accounts.rotate_btn")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Personal settings */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.accounts.settings_title")}
          description={t("ui.accounts.settings_desc")}
          eyebrow={t("ui.import.scope_preferences")}
        />
        <div className="card p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">
                {t("ui.accounts.ip_allow")}
              </span>
              <input
                value={ipAllow}
                onChange={(e) => setIpAllow(e.target.value)}
                placeholder="127.0.0.1, ::1"
                className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
              />
            </label>
            <div className="flex items-end pb-1">
              <p className="text-xs leading-5 text-[color:var(--color-muted)]">
                {t("ui.accounts.ip_allow_desc")}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSaveSession}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
            >
              <KeyRound size={12} /> {t("ui.accounts.save_settings")}
            </button>
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  );
}