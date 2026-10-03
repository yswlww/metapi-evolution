import { useEffect, useState } from "react";
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
import { apiGet, apiPost } from "../lib/client";
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
  addAccountAvailableModels,
  triggerCheckin,
} from "../lib/source";
import type { Account } from "../data/prototype";

/**
 * Administrator personal page.
 *
 * This control plane has a single administrator account (the one that signed
 * in). This page shows that account's profile, lets the admin rotate the
 * admin token, and manage personal/session settings. There is no multi-account
 * list here — the upstream accounts live under Sites → Accounts per site.
 */
export default function Accounts() {
  const t = useUiText();
  const { showToast } = useToast();
  const { token } = useAuth();

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
    if (!Number.isFinite(siteId) || siteId <= 0) { showToast("Select a site first."); return; }
    if (!addAccountForm.accessToken.trim()) { showToast("Access token is required."); return; }
    setVerifying(true);
    try {
      const res = await verifyAccountToken({ siteId, accessToken: addAccountForm.accessToken.trim() });
      if (res.success) {
        showToast("Token verified — you can now create the account.");
      } else {
        showToast(res.message ?? "Token verification failed.");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Token verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const loadUpstream = async () => {
    setUpstreamLoading(true);
    try {
      const data = await fetchAccounts({ refresh: true });
      setUpstreamAccounts(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load upstream accounts.");
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
      showToast(err instanceof Error ? err.message : "Failed to load account tokens.");
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
      showToast("Select a site first.");
      return;
    }
    setAddingAccount(true);
    try {
      if (addAccountForm.mode === "login") {
        if (!addAccountForm.username.trim() || !addAccountForm.password) {
          showToast("Username and password are required.");
          return;
        }
        await loginAccount({
          siteId,
          username: addAccountForm.username.trim(),
          password: addAccountForm.password,
        });
        showToast("Account logged in and created.");
      } else if (addAccountForm.mode === "apikey") {
        if (!addAccountForm.apiKey.trim()) {
          showToast("API key is required.");
          return;
        }
        await createAccount({
          siteId,
          username: addAccountForm.username.trim() || undefined,
          apiToken: addAccountForm.apiKey.trim(),
          credentialMode: "apiKey",
        });
        showToast("Account created with API key.");
      } else {
        if (!addAccountForm.accessToken.trim()) {
          showToast("Access token is required.");
          return;
        }
        await createAccount({
          siteId,
          username: addAccountForm.username.trim() || undefined,
          accessToken: addAccountForm.accessToken.trim(),
        });
        showToast("Account created with token.");
      }
      setAddAccountOpen(false);
      setAddAccountForm({ siteId: "", username: "", password: "", mode: "login", accessToken: "", apiKey: "" });
      await loadUpstream();
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Add account failed.");
    } finally {
      setAddingAccount(false);
    }
  };

  const handleAddToken = async () => {
    const accountId = Number(tokenForm.accountId);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      showToast("Select an account first.");
      return;
    }
    if (!tokenForm.token.trim()) {
      showToast("Token value is required.");
      return;
    }
    try {
      await addAccountToken({
        accountId,
        name: tokenForm.name.trim() || undefined,
        token: tokenForm.token.trim(),
      });
      showToast("Account token added.");
      setTokenAddOpen(false);
      setTokenForm({ accountId: "", name: "", token: "" });
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Add token failed.");
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await setDefaultAccountToken(id);
      showToast("Default token set.");
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Set default failed.");
    }
  };

  const handleDeleteToken = async (id: number) => {
    if (!window.confirm("Delete this account token?")) return;
    try {
      await deleteAccountToken(id);
      showToast("Token deleted.");
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete token failed.");
    }
  };

  const handleToggleToken = async (id: number, enabled: boolean) => {
    try {
      await updateAccountToken(id, { enabled });
      await loadTokens();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Toggle failed.");
    }
  };

  const handleRevealToken = async (id: number) => {
    if (revealedToken === id) { setRevealedToken(null); setRevealedValue(""); return; }
    try {
      const { token } = await getAccountTokenValue(id);
      setRevealedToken(id);
      setRevealedValue(token ?? "");
      showToast(token ? "Token value shown." : "Token value unavailable.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reveal failed.");
    }
  };

  const handleSyncTokens = async (accountId?: number) => {
    try {
      if (accountId) { await syncAccountTokens(accountId); showToast("Account tokens synced."); }
      else { await syncAllAccountTokens(false); showToast("All tokens synced."); }
      await loadTokens(accountId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed.");
    }
  };

  const handleToggleCheckin = async (id: number, enabled: boolean) => {
    try {
      await updateAccount(id, { checkinEnabled: enabled });
      // Update the local row immediately so the button label flips without
      // waiting on the server-side snapshot cache.
      setUpstreamAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, checkinEnabled: enabled } : a)));
      showToast(enabled ? "Check-in enabled for account." : "Check-in disabled for account.");
      // Refresh with ?refresh=1 to bypass the snapshot cache.
      const data = await fetchAccounts({ refresh: true });
      setUpstreamAccounts(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Check-in toggle failed.");
    }
  };

  const handleRebind = async (id: number) => {
    const token = window.prompt("Enter the new access token to rebind this account's session:");
    if (!token) return;
    try {
      await rebindAccountSession(id, { accessToken: token.trim() });
      showToast("Session rebound.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Rebind failed.");
    }
  };

  const handleRefreshHealth = async (id?: number) => {
    try {
      await refreshAccountHealth(id ? { accountId: id } : {});
      showToast(id ? "Account health refresh queued." : "Health refresh queued.");
      await loadUpstream();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Health refresh failed.");
    }
  };

  const handleTriggerCheckin = async (id: number) => {
    try {
      await triggerCheckin(id);
      showToast("Check-in triggered for account.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Check-in failed.");
    }
  };

  const handleAddModels = async (id: number) => {
    const input = window.prompt("Add manual model names (comma-separated) to this account's availability:");
    if (!input) return;
    const models = input.split(",").map((s) => s.trim()).filter(Boolean);
    if (!models.length) return;
    try {
      await addAccountAvailableModels(id, models);
      showToast("Manual models added.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Add models failed.");
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!window.confirm("Delete this upstream account?")) return;
    try {
      await deleteAccount(id);
      setUpstreamAccounts((prev) => prev.filter((a) => a.id !== id));
      showToast("Account deleted.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const handleRefreshBalance = async (id: number) => {
    setBusy((b) => ({ ...b, [`bal-${id}`]: true }));
    try {
      await refreshAccountBalance(id);
      showToast("Balance refreshed.");
      await loadUpstream();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Refresh failed.");
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
      await apiPost("/api/settings/auth/change", {
        oldToken: token,
        newToken: newToken.trim(),
      });
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
      showToast(err instanceof Error ? err.message : "Save failed.");
    }
  };

  return (
    <div className="space-y-6">
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
                        {verifying ? "VERIFYING…" : "VERIFY"}
                      </button>
                    </div>
                  </label>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={handleAddAccount} disabled={addingAccount}
                  className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40">
                  {addingAccount ? "ADDING…" : "ADD"}
                </button>
              </div>
            </div>
          )}

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
                    {upstreamAccounts.map((account) => (
                      <tr key={account.id} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-[color:var(--color-fg)]">{account.username}</td>
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
                            <button type="button" onClick={() => handleRefreshBalance(account.id)} disabled={busy[`bal-${account.id}`]}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40">
                              {busy[`bal-${account.id}`] ? "…" : "BALANCE"}
                            </button>
                            <button type="button" onClick={() => handleRefreshHealth(account.id)}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              HEALTH
                            </button>
                            <button type="button" onClick={() => handleRebind(account.id)}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              REBIND
                            </button>
                            <button type="button" onClick={() => handleToggleCheckin(account.id, account.checkinEnabled === false)}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              {account.checkinEnabled === false ? "ENABLE CHECK-IN" : "DISABLE CHECK-IN"}
                            </button>
                            <button type="button" onClick={() => handleTriggerCheckin(account.id)}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              CHECK-IN
                            </button>
                            <button type="button" onClick={() => handleAddModels(account.id)}
                              className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                              + MODELS
                            </button>
                            <button type="button" onClick={() => handleDeleteAccount(account.id)}
                              className="rounded-md border border-[color:var(--color-rose)]/40 px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10">
                              DELETE
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
            Upstream account credentials live here. Use the actions to refresh balance, delete, or manage tokens below.
          </p>

          {/* Account tokens */}
          <section className="space-y-4">
            <SectionTitle
              title={t("ui.accounts.tokens_title")}
              description={t("ui.accounts.tokens_desc")}
              eyebrow="Tokens"
              actions={
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleSyncTokens()}
                    className="h-8 rounded-lg border border-[color:var(--color-border)] px-3 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                    <RefreshCw size={11} /> SYNC ALL
                  </button>
                  <button type="button" onClick={() => setTokenAddOpen((v) => !v)}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-3 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
                    <Plus size={11} /> ADD TOKEN
                  </button>
                </div>
              }
            />

            {tokenAddOpen && (
              <div className="card p-4">
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
                      {accountTokens.map((tk) => (
                        <tr key={tk.id} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 font-medium text-[color:var(--color-fg)]">
                              {tk.name ?? `token-${tk.id}`}
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
                              {tk.enabled ? "ENABLED" : "DISABLED"}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              {!tk.isDefault && (
                                <button type="button" onClick={() => handleSetDefault(tk.id)}
                                  className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                                  DEFAULT
                                </button>
                              )}
                              <button type="button" onClick={() => handleSyncTokens(tk.account?.id)}
                                className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                                SYNC
                              </button>
                              <button type="button" onClick={() => handleRevealToken(tk.id)}
                                className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                                {revealedToken === tk.id ? "HIDE" : "REVEAL"}
                              </button>
                              <button type="button" onClick={() => handleDeleteToken(tk.id)}
                                className="rounded-md border border-[color:var(--color-rose)]/40 px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10">
                                DELETE
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
          eyebrow="Security"
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
          eyebrow="Preferences"
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