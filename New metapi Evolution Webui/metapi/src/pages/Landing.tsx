import { useState } from "react";
import { ArrowRight, Globe, Key, Shield, Zap, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useUiText } from "../i18n/useUiText";

export default function Landing() {
  const t = useUiText();
  const { login } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Validate the admin token by hitting the backend auth/info endpoint with
  // the candidate token directly. We use a plain fetch (not the auto-reload
  // authenticated client) so a failed login does not reload the page.
  const handleLogin = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/auth/info", {
        method: "GET",
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (!res.ok) {
        throw new Error(res.status === 401 || res.status === 403 ? "invalid" : `http-${res.status}`);
      }
      // Valid token — persist it; App redirects to the app automatically.
      login(token.trim());
    } catch (err) {
      setError(err instanceof Error && err.message === "invalid"
        ? t("ui.login.invalid_token")
        : t("ui.login.unreachable"));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[color:var(--color-ink)]">
      {/* Hero */}
      <div className="relative overflow-hidden px-4 py-20 text-center sm:px-6 lg:px-10">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="relative mx-auto max-w-3xl">
          <span className="chip chip-lime mb-6 inline-flex items-center gap-1.5">{t("ui.landing.live")}</span>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="text-[color:var(--color-fg)]">metapi</span>{" "}
            <span className="text-[color:var(--color-lime)]">{t("ui.landing.evolution")}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[color:var(--color-muted)]">
            {t("ui.landing.tagline")}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--color-lime)] px-6 py-3 font-mono text-sm font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
            >
              {t("ui.landing.open_console")} <ArrowRight size={16} />
            </button>
            <a href="https://github.com/yswlww/metapi-evolution"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-6 py-3 font-mono text-sm tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
            >
              {t("ui.landing.github")}
            </a>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="px-4 py-16 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <span className="chip chip-cyan mb-3 inline-flex">{t("ui.landing.features")}</span>
            <h2 className="font-display text-3xl tracking-tight text-[color:var(--color-fg)]">{t("ui.landing.why")}</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: <Key size={20} />, title: t("ui.landing.feat_unified_title"), desc: t("ui.landing.feat_unified_desc") },
              { icon: <Zap size={20} />, title: t("ui.landing.feat_cost_title"), desc: t("ui.landing.feat_cost_desc") },
              { icon: <Globe size={20} />, title: t("ui.landing.feat_multi_title"), desc: t("ui.landing.feat_multi_desc") },
            ].map((feature) => (
              <div key={feature.title} className="card p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] text-[color:var(--color-lime)]">
                  {feature.icon}
                </div>
                <h3 className="mt-3 font-display text-xl tracking-tight text-[color:var(--color-fg)]">{feature.title}</h3>
                <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Supported adapters */}
      <div className="px-4 py-16 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <span className="chip chip-coral mb-3 inline-flex">{t("ui.landing.adapters_eyebrow")}</span>
            <h2 className="font-display text-3xl tracking-tight text-[color:var(--color-fg)]">{t("ui.landing.adapters_title")}</h2>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {["New API", "One API", "OneHub", "DoneHub", "Veloera", "AnyRouter", "AxonHub", "OrcaRouter", "Sub2API"].map((adapter) => (
              <span key={adapter} className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 px-4 py-1.5 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)]">
                {adapter}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Deploy */}
      <div className="px-4 py-16 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <span className="chip chip-amber mb-3 inline-flex">{t("ui.landing.deploy_eyebrow")}</span>
          <h2 className="font-display text-3xl tracking-tight text-[color:var(--color-fg)]">{t("ui.landing.deploy_title")}</h2>
          <p className="mt-3 text-sm text-[color:var(--color-muted)]">{t("ui.landing.deploy_desc")}</p>
          <div className="mt-6 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] p-4">
            <code className="font-mono text-xs text-[color:var(--color-lime)]">
              docker pull yswlww/metapi-evolution &amp;&amp; docker run -p 8080:8080 yswlww/metapi-evolution
            </code>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[color:var(--color-border)] px-4 py-8 text-center sm:px-6 lg:px-10">
        <p className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
          Metapi {t("ui.landing.evolution")} v1.4.1 · Apache-2.0 · © 2026 yswlww
        </p>
      </footer>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-[color:var(--color-ink)]/70 backdrop-blur-sm" onClick={() => setShowLogin(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-graphite)] p-6">
            <button type="button" onClick={() => setShowLogin(false)} className="absolute right-3 top-3 text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
              <X size={18} />
            </button>
            <div className="mb-4">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.login.title").toUpperCase()}</span>
              <h2 className="font-display text-2xl tracking-tight text-[color:var(--color-fg)]">{t("ui.login.title")}</h2>
              <p className="mt-1 text-xs text-[color:var(--color-muted)]">{t("ui.login.desc")}</p>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-[color:var(--color-muted)]">{t("ui.login.admin_token")}</span>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => { setToken(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder={t("ui.login.token_ph")}
                  className="h-10 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
                  autoFocus
                />
              </label>
              {error && (
                <p className="text-xs text-[color:var(--color-rose)]">{error}</p>
              )}
              <button
                type="button"
                onClick={handleLogin}
                disabled={loading || !token.trim()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--color-lime)] font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40"
              >
                {loading ? "SIGNING IN…" : t("ui.login.title").toUpperCase()}
              </button>
              <p className="text-center font-mono text-[10px] text-[color:var(--color-muted)]">
                {t("ui.login.local_hint")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}