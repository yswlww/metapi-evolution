import { useState } from "react";
import { Boxes, Download, Upload, FolderSync } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { SectionTitle, StatCard, EmptyState } from "../components/PrototypeUI";
import { EditDrawer, Field, TextInput } from "../components/EditDrawer";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import {
  exportBackup,
  importBackup,
  saveBackupWebdavConfig,
  exportBackupToWebdav,
  importBackupFromWebdav,
} from "../lib/source";

// The backend backup export supports three scopes (all / accounts /
// preferences). These replace the old prototype scope list with fake record
// counts.
const EXPORT_SCOPES = [
  { id: "all", label: "Full backup", description: "Complete configuration backup." },
  { id: "accounts", label: "Connections & routes", description: "Upstream account credentials and routing." },
  { id: "preferences", label: "Preferences", description: "Workspace and notification preferences." },
] as const;

type ExportScopeId = (typeof EXPORT_SCOPES)[number]["id"];

export default function ImportExport() {
  const t = useUiText();
  const { showToast } = useToast();
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(
    new Set(EXPORT_SCOPES.map((s) => s.id)),
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dropHighlight, setDropHighlight] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    fileName: string;
    sections: string[];
    totalRecords: number;
    legacyNote?: string;
    rawData?: unknown;
  } | null>(null);
  const [webdavDrawer, setWebdavDrawer] = useState(false);
  const [webdavSynced, setWebdavSynced] = useState(false);
  const [importConfirm, setImportConfirm] = useState(false);
  const [webdavDraft, setWebdavDraft] = useState({ enabled: true, fileUrl: "", username: "", password: "", exportType: "all" as "all" | "accounts" | "preferences", autoSyncEnabled: false, autoSyncCron: "0 */6 * * *" });
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const flash = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2500);
  };

  const toggleScope = (id: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    const selected = EXPORT_SCOPES.filter((s) => selectedScopes.has(s.id));
    // The backend export takes a single type. Multiple selections export the
    // full backup ("all"); a single selection uses that scope's type.
    const exportType: "all" | "accounts" | "preferences" = selected.length === 1
      ? (selected[0].id as ExportScopeId)
      : "all";
    setBusy((b) => ({ ...b, export: true }));
    try {
      const data = await exportBackup(exportType);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `metapi-evolution-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const sizeKb = Math.round(new Blob([json]).size / 1024);
      flash(`Exported ${exportType} backup (${sizeKb} KB).`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy((b) => ({ ...b, export: false }));
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHighlight(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const data = JSON.parse(text);
        const sections = data.sections ?? [];
        const totalRecords = sections.reduce(
          (a: number, s: { recordCount?: number }) => a + (s.recordCount ?? 0),
          0,
        );
        // legacy format detection
        const rawType = data?.type ?? data?.["format"] ?? "";
        let legacyNote: string | undefined;
        if (rawType === "sub2api-data" || rawType === "sub2api-bundle" || "accounts" in (data ?? {}) || "proxies" in (data ?? {})) {
          legacyNote = t("ui.ie.legacy_sub2api");
        } else if (rawType === "ALL-API-Hub" || rawType === "all-api-hub-v2") {
          legacyNote = t("ui.ie.legacy_allapihub");
        }
        setImportPreview({
          fileName: file.name,
          sections: sections.map((s: { id?: string; label?: string }) => s.label ?? s.id ?? "Unknown"),
          totalRecords,
          legacyNote,
          rawData: data,
        });
        setImportConfirm(false);
      } catch {
        flash(t("ui.ie.invalid_json"));
      }
    });
  };

  const handleApplyImport = async () => {
    if (!importPreview?.rawData) return;
    setBusy((b) => ({ ...b, import: true }));
    try {
      await importBackup(importPreview.rawData);
      flash(t("ui.ie.applied_ok", { records: importPreview.totalRecords }));
      setImportPreview(null);
      setImportConfirm(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy((b) => ({ ...b, import: false }));
    }
  };

  const handleWebdavSave = async () => {
    setBusy((b) => ({ ...b, webdavSave: true }));
    try {
      await saveBackupWebdavConfig({
        enabled: webdavDraft.enabled,
        fileUrl: webdavDraft.fileUrl,
        username: webdavDraft.username,
        password: webdavDraft.password || undefined,
        clearPassword: !webdavDraft.password,
        exportType: webdavDraft.exportType,
        autoSyncEnabled: webdavDraft.autoSyncEnabled,
        autoSyncCron: webdavDraft.autoSyncCron,
      });
      flash(t("ui.ie.webdav_saved"));
      setWebdavDrawer(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "WebDAV save failed.");
    } finally {
      setBusy((b) => ({ ...b, webdavSave: false }));
    }
  };

  const handleWebdavPush = async () => {
    setBusy((b) => ({ ...b, webdavPush: true }));
    try {
      await exportBackupToWebdav(webdavDraft.exportType === "all" ? undefined : webdavDraft.exportType);
      setWebdavSynced(true);
      flash(t("ui.ie.webdav_pushed"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "WebDAV push failed.");
    } finally {
      setBusy((b) => ({ ...b, webdavPush: false }));
    }
  };

  const handleWebdavPull = async () => {
    setBusy((b) => ({ ...b, webdavPull: true }));
    try {
      await importBackupFromWebdav();
      setWebdavSynced(true);
      flash(t("ui.ie.webdav_pulled"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "WebDAV pull failed.");
    } finally {
      setBusy((b) => ({ ...b, webdavPull: false }));
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("ui.ie.eyebrow")}
        title={t("ui.ie.title")}
        description={t("ui.ie.desc")}
        actions={
          <button
            type="button"
            onClick={() => setWebdavDrawer(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)]"
          >
            <FolderSync size={12} /> {t("ui.ie.webdav")}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("ui.ie.format")}
          value="JSON"
          detail="Backend backup format"
          icon={<Boxes size={16} />}
        />
        <StatCard
          label={t("ui.ie.max_import")}
          value="—"
          icon={<Upload size={16} />}
        />
        <StatCard
          label={t("ui.ie.last_exported")}
          value="—"
          icon={<Download size={16} />}
        />
        <StatCard
          label={t("ui.ie.supported_sections")}
          value={3}
          detail="Accounts, preferences, all"
          icon={<Boxes size={16} />}
        />
      </div>

      {feedback && (
        <div className="rounded-lg border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3 font-mono text-xs tracking-wider text-[color:var(--color-lime)]">
          {feedback}
        </div>
      )}

      {/* Export */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.ie.export")}
          description={t("ui.ie.export_desc")}
          eyebrow={t("ui.ie.export")}
          actions={
            <button
              type="button"
              onClick={handleExport}
              disabled={selectedScopes.size === 0}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40"
            >
              <Download size={12} /> {t("ui.ie.export_btn", { n: selectedScopes.size })}
            </button>
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {EXPORT_SCOPES.map((scope) => {
            const selected = selectedScopes.has(scope.id);
            return (
              <button
                key={scope.id}
                type="button"
                onClick={() => toggleScope(scope.id)}
                className={`card p-4 text-left transition-all ${
                  selected
                    ? "ring-1 ring-[color:var(--color-lime)]/40"
                    : "opacity-60 hover:opacity-80"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl tracking-tight">{scope.label}</h3>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">
                      {scope.description}
                    </p>
                  </div>
                  {selected && (
                    <span className="chip chip-lime">{t("ui.ie.selected")}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Import */}
      <section className="space-y-4">
        <SectionTitle
          title={t("ui.ie.import")}
          description={t("ui.ie.import_desc")}
          eyebrow={t("ui.ie.import")}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropHighlight(true);
          }}
          onDragLeave={() => setDropHighlight(false)}
          onDrop={handleFileDrop}
          className={`card flex min-h-48 items-center justify-center px-5 py-8 text-center transition-colors ${
            dropHighlight ? "ring-1 ring-[color:var(--color-lime)]/40" : ""
          }`}
        >
          <EmptyState
            title={t("ui.ie.drop_title")}
            description={t("ui.ie.drop_desc")}
            icon={<Upload size={18} />}
          />
        </div>

        {importPreview && (
          <div className="card p-5">
            <h3 className="font-display text-xl tracking-tight">{importPreview.fileName}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {importPreview.sections.map((section) => (
                <span
                  key={section}
                  className="chip chip-cyan"
                >
                  {section}
                </span>
              ))}
            </div>
            <div className="mt-3 font-mono text-xs text-[color:var(--color-muted)]">
              {t("ui.ie.preview_total", { records: importPreview.totalRecords, sections: importPreview.sections.length })}
            </div>
            {importPreview.legacyNote && (
              <div className="mt-3 rounded-lg border border-[color:var(--color-amber)]/40 bg-[color:var(--color-amber)]/10 px-3 py-2 font-mono text-xs text-[color:var(--color-amber)]">
                {importPreview.legacyNote}
              </div>
            )}
            {!importConfirm && (
              <div className="mt-4 rounded-lg border border-[color:var(--color-amber)]/40 bg-[color:var(--color-amber)]/10 px-4 py-3 text-xs leading-5 text-[color:var(--color-fg)]">
                {t("ui.ie.overwrite_warn")}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
              >
                {t("ui.common.cancel")}
              </button>
              {!importConfirm ? (
                <button
                  type="button"
                  onClick={() => setImportConfirm(true)}
                  className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90"
                >
                  {t("ui.ie.confirm_import")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={busy.import}
                  className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40"
                >
                  {busy.import ? "APPLYING…" : t("ui.ie.apply")}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {webdavDrawer && (
        <EditDrawer
          open
          onClose={() => setWebdavDrawer(false)}
          title={t("ui.ie.webdav_drawer")}
          eyebrow={t("ui.ie.webdav_eyebrow")}
          footer={
            <>
              <button
                type="button"
                onClick={() => setWebdavDrawer(false)}
                className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
              >
                {t("ui.common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleWebdavSave}
                disabled={busy.webdavSave}
                className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40"
              >
                {busy.webdavSave ? "SAVING…" : t("ui.common.save")}
              </button>
            </>
          }
        >
          <Field label={t("ui.ie.webdav_url")}>
            <TextInput value={webdavDraft.fileUrl} onChange={(e) => setWebdavDraft((d) => ({ ...d, fileUrl: e.target.value }))} placeholder={t("ui.ie.webdav_url_ph")} />
          </Field>
          <Field label={t("ui.ie.username")}>
            <TextInput value={webdavDraft.username} onChange={(e) => setWebdavDraft((d) => ({ ...d, username: e.target.value }))} placeholder="username" />
          </Field>
          <Field label={t("ui.ie.password")}>
            <TextInput type="password" value={webdavDraft.password} onChange={(e) => setWebdavDraft((d) => ({ ...d, password: e.target.value }))} placeholder="••••••••" />
          </Field>
          <Field label={t("ui.ie.export_type")}>
            <select value={webdavDraft.exportType} onChange={(e) => setWebdavDraft((d) => ({ ...d, exportType: e.target.value as "all" | "accounts" | "preferences" }))} className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 py-2 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50">
              <option value="all">{t("ui.ie.export_all")}</option>
              <option value="accounts">{t("ui.ie.export_conn_routes")}</option>
              <option value="preferences">{t("ui.ie.export_settings")}</option>
            </select>
          </Field>
          <Field label={t("ui.ie.auto_sync")}>
            <TextInput value={webdavDraft.autoSyncCron} onChange={(e) => setWebdavDraft((d) => ({ ...d, autoSyncCron: e.target.value }))} defaultValue="0 */6 * * *" placeholder="0 */6 * * *" />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/60 px-3 py-2.5">
            <span className={`font-mono text-[10px] tracking-wider ${webdavSynced ? "text-[color:var(--color-lime)]" : "text-[color:var(--color-muted)]"}`}>
              {webdavSynced ? t("ui.ie.webdav_status_synced") : t("ui.ie.webdav_status_never")}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleWebdavPush}
                disabled={busy.webdavPush}
                className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40"
              >
                {busy.webdavPush ? "PUSHING…" : t("ui.ie.webdav_push")}
              </button>
              <button
                type="button"
                onClick={handleWebdavPull}
                disabled={busy.webdavPull}
                className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40"
              >
                {busy.webdavPull ? "PULLING…" : t("ui.ie.webdav_pull")}
              </button>
            </div>
          </div>
        </EditDrawer>
      )}
    </div>
  );
}