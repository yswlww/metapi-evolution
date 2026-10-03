import { useEffect, useState } from "react";
import { ExternalLink, Package, Wrench } from "lucide-react";
import { ABOUT_METADATA } from "../data/prototype";
import PageHeader from "../components/PageHeader";
import { SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import {
  getUpdateCenterStatus,
  checkUpdateCenter,
  deployUpdateCenter,
  rollbackUpdateCenter,
} from "../lib/source";

const STATUS_TONES: Record<string, string> = {
  current: "lime",
  available: "cyan",
  planned: "amber",
};

// Backend update-center status shape (subset we render).
interface UpdateCenterStatus {
  currentVersion?: string;
  githubRelease?: {
    displayVersion?: string;
    url?: string | null;
    publishedAt?: string;
  } | null;
  dockerHubTag?: {
    displayVersion?: string;
    digest?: string | null;
  } | null;
  helper?: {
    ok?: boolean;
    imageTag?: string | null;
    imageDigest?: string | null;
  };
  config?: {
    enabled?: boolean;
    defaultDeploySource?: string;
  };
}

export default function About() {
  const t = useUiText();
  const { showToast } = useToast();
  const meta = ABOUT_METADATA;
  const [updateStatus, setUpdateStatus] = useState<UpdateCenterStatus | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const reloadStatus = async () => {
    try {
      const data = await getUpdateCenterStatus();
      setUpdateStatus(data as UpdateCenterStatus);
    } catch {
      setUpdateStatus(null);
    }
  };

  useEffect(() => { reloadStatus(); }, []);

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await fn();
      showToast(okMsg);
      await reloadStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Operation failed.");
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const handleCheck = () => run("check", () => checkUpdateCenter(), "Update check completed.");
  const handleDeploy = () => {
    const tag = updateStatus?.githubRelease?.displayVersion ?? "latest";
    run("deploy", () => deployUpdateCenter({ source: "github-release", targetTag: tag }), `Deploy ${tag} queued.`);
  };
  const handleRollback = () => run("rollback", () => rollbackUpdateCenter({ targetRevision: updateStatus?.currentVersion ?? "1.4.0" }), "Rollback queued.");

  const updateAvailable = updateStatus?.githubRelease?.displayVersion
    && updateStatus.githubRelease.displayVersion !== updateStatus.currentVersion;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("ui.about.eyebrow")}
        title={t("ui.about.title")}
        description={t("ui.about.desc")}
      />

      {/* Hero card */}
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[color:var(--color-lime)]">
                <svg
                  viewBox="0 0 32 32"
                  className="h-7 w-7 text-[color:var(--color-ink)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 24 L10 8 L16 20 L22 8 L28 24" />
                </svg>
              </div>
              <div>
                <h2 className="font-display text-3xl tracking-tight text-[color:var(--color-fg)]">
                  {meta.productName}
                </h2>
                <div className="mt-0.5 text-sm text-[color:var(--color-muted)]">
                  {meta.tagline}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="chip chip-lime">v{updateStatus?.currentVersion ?? meta.version}</span>
              <span className="chip chip-cyan">{meta.license}</span>
              {updateStatus && updateStatus.helper?.ok && updateStatus.helper.imageTag ? (
                <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
                  image {updateStatus.helper.imageTag}
                </span>
              ) : !updateStatus ? (
                <>
                  <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
                    {t("ui.about.build", { rev: meta.buildRevision })}
                  </span>
                  <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
                    {t("ui.about.released", { date: new Date(meta.releasedAt).toLocaleDateString() })}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]">
            <Package size={28} className="text-[color:var(--color-lime)]" />
          </div>
        </div>
      </section>

      {/* Update center */}
      <section className="space-y-4">
        <SectionTitle title={t("ui.about.update_center")} description={t("ui.about.update_desc")} eyebrow="Updates" />
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--color-muted)]">{t("ui.about.current")}</div>
              <div className="mt-1 font-display text-2xl tracking-tight text-[color:var(--color-fg)]">
                v{updateStatus?.currentVersion ?? meta.version}
              </div>
              {updateAvailable && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="chip chip-cyan">v{updateStatus.githubRelease?.displayVersion} {t("ui.about.available")}</span>
                  {updateStatus.githubRelease?.url && (
                    <a href={updateStatus.githubRelease.url} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[10px] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                      release notes ↗
                    </a>
                  )}
                </div>
              )}
              {!updateStatus && (
                <div className="mt-1 text-xs text-[color:var(--color-muted)]">{t("ui.about.update_unreachable")}</div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleCheck} disabled={busy.check}
                className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40">
                {busy.check ? "CHECKING…" : "CHECK"}
              </button>
              <button type="button" onClick={handleDeploy} disabled={busy.deploy || !updateAvailable}
                className="rounded-lg bg-[color:var(--color-lime)] px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40">
                {busy.deploy ? "DEPLOYING…" : "DEPLOY"}
              </button>
              <button type="button" onClick={handleRollback} disabled={busy.rollback}
                className="rounded-lg border border-[color:var(--color-rose)]/40 px-3 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10 disabled:opacity-40">
                {busy.rollback ? "ROLLING BACK…" : "ROLLBACK"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.about.capabilities")}
          description={t("ui.about.capabilities_desc")}
          eyebrow={t("ui.about.capabilities")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {meta.capabilities.map((cap) => (
            <div key={cap.id} className="card p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] text-[color:var(--color-lime)]">
                <Wrench size={16} />
              </div>
              <h3 className="mt-3 font-display text-xl tracking-tight text-[color:var(--color-fg)]">
                {cap.label}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">
                {cap.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Data & Privacy */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.about.privacy")}
          description={t("ui.about.privacy_desc")}
          eyebrow={t("ui.about.privacy")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card p-4">
            <h3 className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">
              {t("ui.about.self_hosted")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">
              {t("ui.about.local_db")}
            </p>
          </div>
          <div className="card p-4">
            <h3 className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">
              {t("ui.about.no_third_party")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">
              {t("ui.about.privacy_desc")}
            </p>
          </div>
          <div className="card p-4">
            <h3 className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">
              {t("ui.about.local_db")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">
              {t("ui.about.privacy_desc")}
            </p>
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.about.tech_stack")}
          description={t("ui.about.tech_stack_desc")}
          eyebrow={t("ui.about.tech_stack")}
        />
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.about.technology")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.about.version")}</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t("ui.about.role")}</th>
                </tr>
              </thead>
              <tbody>
                {meta.techStack.map((entry) => (
                  <tr key={entry.id} className="border-b border-[color:var(--color-border)]/60 last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium text-[color:var(--color-fg)]">{entry.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="chip chip-cyan">{entry.version}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[color:var(--color-muted)]">
                      {entry.role}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.about.resources")}
          description={t("ui.about.resources_desc")}
          eyebrow={t("ui.about.resources")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {meta.resources.map((resource) => (
            <a
              key={resource.id}
              href={resource.href}
              target="_blank"
              rel="noopener noreferrer"
              className="card flex items-center gap-3 p-4 transition-colors hover:border-[color:var(--color-lime)]/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] text-[color:var(--color-lime)]">
                <ExternalLink size={16} />
              </div>
              <div>
                <h3 className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">
                  {resource.label}
                </h3>
                <p className="text-xs text-[color:var(--color-muted)]">
                  {resource.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Releases */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.about.releases")}
          description={t("ui.about.releases_desc")}
          eyebrow={t("ui.about.releases")}
        />
        <div className="space-y-4">
          {updateStatus ? (
            <>
              <article className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-2xl tracking-tight text-[color:var(--color-fg)]">
                        v{updateStatus.currentVersion}
                      </h3>
                      <span className="chip chip-lime">{t("ui.about.current")} RELEASE</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
                      {updateStatus.githubRelease?.publishedAt
                        ? new Date(updateStatus.githubRelease.publishedAt).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 space-y-1">
                  <li className="flex items-start gap-2 text-sm text-[color:var(--color-muted)]">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-lime)]" />
                    Running on the backend&apos;s current deployable version.
                  </li>
                </ul>
              </article>
              {updateAvailable && (
                <article className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-2xl tracking-tight text-[color:var(--color-fg)]">
                          v{updateStatus.githubRelease?.displayVersion}
                        </h3>
                        <span className="chip chip-cyan">{t("ui.about.available")}</span>
                      </div>
                      <div className="mt-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
                        {updateStatus.githubRelease?.publishedAt
                          ? new Date(updateStatus.githubRelease.publishedAt).toLocaleDateString()
                          : "—"}
                      </div>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1">
                    <li className="flex items-start gap-2 text-sm text-[color:var(--color-muted)]">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-lime)]" />
                      Update available — deploy from the Update Center above.
                    </li>
                  </ul>
                </article>
              )}
            </>
          ) : (
            meta.releases.map((release) => {
            const tone = STATUS_TONES[release.status] ?? "muted";
            return (
              <article key={release.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-2xl tracking-tight text-[color:var(--color-fg)]">
                        v{release.version}
                      </h3>
                      <span className={`chip chip-${tone}`}>{release.statusLabel}</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">
                      {new Date(release.releasedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 space-y-1">
                  {release.highlights.map((highlight, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm text-[color:var(--color-muted)]"
                    >
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-lime)]" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })
          )}
        </div>
      </section>
    </div>
  );
}