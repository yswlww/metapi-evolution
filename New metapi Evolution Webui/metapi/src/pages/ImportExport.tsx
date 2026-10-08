import { useEffect, useState } from "react";
import { useLang } from "../contexts/LangContext";
import { backupPreview, webdavDraftFromConfig, webdavPayload } from "../lib/backupParity";
import { Boxes, Download, Upload, FolderSync } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { SectionTitle, StatCard, EmptyState } from "../components/PrototypeUI";
import { EditDrawer, Field, TextInput } from "../components/EditDrawer";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { exportBackup, importBackup, getBackupWebdavConfig, saveBackupWebdavConfig, exportBackupToWebdav, importBackupFromWebdav } from "../lib/source";
const EXPORT_SCOPES = [
  { id: "all", labelKey: "ui.import.scope_full", descKey: "ui.import.scope_full_desc" },
  { id: "accounts", labelKey: "ui.import.scope_connections", descKey: "ui.import.scope_connections_desc" },
  { id: "preferences", labelKey: "ui.import.scope_preferences", descKey: "ui.import.scope_preferences_desc" },
] as const;
type ExportScopeId = (typeof EXPORT_SCOPES)[number]["id"];
export default function ImportExport() {
  const t = useUiText();
  const { showToast } = useToast();
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(EXPORT_SCOPES.map((s) => s.id)));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dropHighlight, setDropHighlight] = useState(false);
  const [importPreview, setImportPreview] = useState<{fileName: string; sections: string[]; totalRecords: number; legacyNote?: string; rawData?: unknown;} | null>(null);
  const [webdavDrawer, setWebdavDrawer] = useState(false);
  const [webdavSynced, setWebdavSynced] = useState(false);
  const [importConfirm, setImportConfirm] = useState(false);
  const [webdavDraft, setWebdavDraft] = useState(() => webdavDraftFromConfig({}));
  const [webdavSaved, setWebdavSaved] = useState(() => webdavDraftFromConfig({}));
  const [webdavLoaded, setWebdavLoaded] = useState(false);
  const [syncState, setSyncState] = useState<{lastSyncAt?: string | null; lastError?: string | null}>({});
  const {lang} = useLang();
  const local = (en: string, hant: string, hans: string) => lang === 'zh-Hant' ? hant : lang === 'zh-Hans' ? hans : en;
  const loadWebdav = async () => {
    setWebdavLoaded(false);
    const response = await getBackupWebdavConfig() as {state?: {lastSyncAt?: string | null; lastError?: string | null}};
    const draft = webdavDraftFromConfig(response);
    setWebdavDraft(draft); setWebdavSaved(draft); setWebdavLoaded(true);
    setSyncState(response.state ?? {});
  };
  useEffect(() => { let active = true; getBackupWebdavConfig().then(response => {
    if (!active) return;
    const draft = webdavDraftFromConfig(response);
    setWebdavDraft(draft); setWebdavSaved(draft); setWebdavLoaded(true);
    setSyncState((response as {state?: typeof syncState}).state ?? {});
  }).catch(error => {if (active) showToast(error instanceof Error ? error.message : t('ui.settings.err_load'));});
    return () => {active = false;};
  }, [showToast]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const flash = (msg: string) => {setFeedback(msg); window.setTimeout(() => setFeedback(null), 2500);};
  const toggleScope = (id: string) => {setSelectedScopes((prev) => {const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;});};
  const handleExport = async () => {
    const selected = EXPORT_SCOPES.filter((s) => selectedScopes.has(s.id));
    const exportType: "all" | "accounts" | "preferences" = selected.length === 1 ? (selected[0].id as ExportScopeId) : "all";
    setBusy((b) => ({ ...b, export: true }));
    try {
      const data = await exportBackup(exportType); const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" }); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `metapi-evolution-export-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
      const sizeKb = Math.round(new Blob([json]).size / 1024); flash(local(`Exported ${exportType} backup (${sizeKb} KB).`, `已匯出 ${exportType} 備份（${sizeKb} KB）。`, `已导出 ${exportType} 备份（${sizeKb} KB）。`));
    } catch (err) {showToast(err instanceof Error ? err.message : t("ui.import.export_failed"));}
    finally {setBusy((b) => ({ ...b, export: false }));}
  };
  const readFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const preview = backupPreview(data);
      setImportPreview({fileName: file.name, ...preview, rawData: data});
      setImportConfirm(false);
    } catch {setImportPreview(null); flash(t('ui.ie.invalid_json'));}
  };
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDropHighlight(false);
    const file = e.dataTransfer.files[0]; if (file) void readFile(file);
  };
  const handleApplyImport = async () => {
    if (!importPreview?.rawData) return; setBusy((b) => ({ ...b, import: true }));
    try {await importBackup(importPreview.rawData); flash(local('Backup import completed.', '備份匯入已完成。', '备份导入已完成。')); setImportPreview(null); setImportConfirm(false);}
    catch (err) {showToast(err instanceof Error ? err.message : t("ui.import.import_failed"));}
    finally {setBusy((b) => ({ ...b, import: false }));}
  };
  const handleWebdavSave = async () => {
    if (!webdavLoaded) {showToast(t('ui.settings.err_load')); return;}
    setBusy((b) => ({ ...b, webdavSave: true }));
    try {
      await saveBackupWebdavConfig(webdavPayload(webdavDraft));
      await loadWebdav();
      flash(t("ui.ie.webdav_saved")); setWebdavDrawer(false);
    } catch (err) {showToast(err instanceof Error ? err.message : t("ui.import.webdav_save_failed"));}
    finally {setBusy((b) => ({ ...b, webdavSave: false }));}
  };
  const handleWebdavPush = async () => {
    setBusy((b) => ({ ...b, webdavPush: true }));
    try {await exportBackupToWebdav(webdavSaved.exportType === "all" ? undefined : webdavSaved.exportType); setWebdavSynced(true); flash(t("ui.ie.webdav_pushed"));}
    catch (err) {showToast(err instanceof Error ? err.message : t("ui.import.webdav_push_failed"));}
    finally {setBusy((b) => ({ ...b, webdavPush: false }));}
  };
  const handleWebdavPull = async () => {
    if (!window.confirm(t('ui.ie.overwrite_warn'))) return;
    setBusy((b) => ({ ...b, webdavPull: true }));
    try {await importBackupFromWebdav(); setWebdavSynced(true); flash(t("ui.ie.webdav_pulled"));}
    catch (err) {showToast(err instanceof Error ? err.message : t("ui.import.webdav_pull_failed"));}
    finally {setBusy((b) => ({ ...b, webdavPull: false }));}
  };
  return <div className="space-y-8">
    <PageHeader eyebrow={t("ui.ie.eyebrow")} title={t("ui.ie.title")} description={t("ui.ie.desc")} actions={<button type="button" onClick={() => {setWebdavDraft({...webdavSaved}); setWebdavDrawer(true); void loadWebdav().catch(error => showToast(String(error)));}} className="flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/50 px-4 font-mono text-xs tracking-wider text-[color:var(--color-fg)] hover:border-[color:var(--color-border-bright)]"><FolderSync size={12} /> {t("ui.ie.webdav")}</button>} />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label={t("ui.ie.format")} value="JSON" detail={t("ui.import.format_desc")} icon={<Boxes size={16} />} />
      <StatCard label={t("ui.ie.max_import")} value="—" icon={<Upload size={16} />} />
      <StatCard label={t("ui.ie.last_exported")} value="—" icon={<Download size={16} />} />
      <StatCard label={t("ui.ie.supported_sections")} value={3} detail={t("ui.import.scope_all_note")} icon={<Boxes size={16} />} />
    </div>
    {feedback && <div className="rounded-lg border border-[color:var(--color-lime)]/30 bg-[color:var(--color-lime)]/10 px-4 py-3 font-mono text-xs tracking-wider text-[color:var(--color-lime)]">{feedback}</div>}
    <section className="space-y-4">
      <SectionTitle title={t("ui.ie.export")} description={t("ui.ie.export_desc")} eyebrow={t("ui.ie.export")} actions={<button type="button" onClick={handleExport} disabled={selectedScopes.size === 0} className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40"><Download size={12} /> {t("ui.ie.export_btn", { n: selectedScopes.size })}</button>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{EXPORT_SCOPES.map((scope) => {const selected = selectedScopes.has(scope.id); return <button key={scope.id} type="button" onClick={() => toggleScope(scope.id)} className={`card p-4 text-left transition-all ${selected ? "ring-1 ring-[color:var(--color-lime)]/40" : "opacity-60 hover:opacity-80"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-display text-xl tracking-tight">{t(scope.labelKey)}</h3><p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{t(scope.descKey)}</p></div>{selected && <span className="chip chip-lime">{t("ui.ie.selected")}</span>}</div></button>;})}</div>
    </section>
    <section className="space-y-4">
      <SectionTitle title={t("ui.ie.import")} description={t("ui.ie.import_desc")} eyebrow={t("ui.ie.import")} />
      <label className="block text-xs text-[color:var(--color-muted)]">{local('Choose backup file', '選擇備份檔案', '选择备份文件')}<input type="file" accept="application/json,.json" className="mt-2 block w-full" onChange={event => {const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = '';}} /></label>
      <div onDragOver={(e) => {e.preventDefault(); setDropHighlight(true);}} onDragLeave={() => setDropHighlight(false)} onDrop={handleFileDrop} className={`card flex min-h-48 items-center justify-center px-5 py-8 text-center transition-colors ${dropHighlight ? "ring-1 ring-[color:var(--color-lime)]/40" : ""}`}><EmptyState title={t("ui.ie.drop_title")} description={t("ui.ie.drop_desc")} icon={<Upload size={18} />} /></div>
      {importPreview && <div className="card p-5">
        <h3 className="font-display text-xl tracking-tight">{importPreview.fileName}</h3>
        <div className="mt-3 flex flex-wrap gap-2">{importPreview.sections.map((section) => <span key={section} className="chip chip-cyan">{section}</span>)}</div>
        <div className="mt-3 font-mono text-xs text-[color:var(--color-muted)]">{t("ui.ie.preview_total", { records: importPreview.totalRecords, sections: importPreview.sections.length })}</div>
        {importPreview.legacyNote && <div className="mt-3 rounded-lg border border-[color:var(--color-amber)]/40 bg-[color:var(--color-amber)]/10 px-3 py-2 font-mono text-xs text-[color:var(--color-amber)]">{importPreview.legacyNote}</div>}
        {!importConfirm && <div className="mt-4 rounded-lg border border-[color:var(--color-amber)]/40 bg-[color:var(--color-amber)]/10 px-4 py-3 text-xs leading-5 text-[color:var(--color-fg)]">{t("ui.ie.overwrite_warn")}</div>}
        <div className="mt-4 flex gap-2"><button type="button" onClick={() => setImportPreview(null)} className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">{t("ui.common.cancel")}</button>{!importConfirm ? <button type="button" onClick={() => setImportConfirm(true)} className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">{t("ui.ie.confirm_import")}</button> : <button type="button" onClick={handleApplyImport} disabled={busy.import} className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40">{busy.import ? local('Applying…', '套用中…', '应用中…') : t("ui.ie.apply")}</button>}</div>
      </div>}
    </section>
    {webdavDrawer && <EditDrawer open onClose={() => setWebdavDrawer(false)} title={t("ui.ie.webdav_drawer")} eyebrow={t("ui.ie.webdav_eyebrow")} footer={<><button type="button" onClick={() => setWebdavDrawer(false)} className="h-9 rounded-lg border border-[color:var(--color-border)] px-4 font-mono text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">{t("ui.common.cancel")}</button><button type="button" onClick={handleWebdavSave} disabled={busy.webdavSave || !webdavLoaded} className="h-9 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40">{busy.webdavSave ? local('Saving…', '儲存中…', '保存中…') : t("ui.common.save")}</button></>}>
      <fieldset disabled={!webdavLoaded || busy.webdavSave || busy.webdavPush || busy.webdavPull} className="space-y-4 min-w-0">
      <Field label={local('Enabled', '啟用', '启用')}><input type="checkbox" checked={webdavDraft.enabled} onChange={event => setWebdavDraft(d => ({...d, enabled: event.target.checked}))} /></Field>
      <Field label={t("ui.ie.webdav_url")}><TextInput value={webdavDraft.fileUrl} onChange={(e) => setWebdavDraft((d) => ({ ...d, fileUrl: e.target.value }))} placeholder={t("ui.ie.webdav_url_ph")} /></Field>
      <Field label={t("ui.ie.username")}><TextInput value={webdavDraft.username} onChange={(e) => setWebdavDraft((d) => ({ ...d, username: e.target.value }))} placeholder="username" /></Field>
      <Field label={t("ui.ie.password")}><TextInput type="password" value={webdavDraft.password} onChange={(e) => setWebdavDraft((d) => ({ ...d, password: e.target.value, clearPassword: false }))} placeholder="••••••••" /></Field>
      <Field label={local('Clear stored password', '清除已儲存密碼', '清除已保存密码')}><input type="checkbox" checked={webdavDraft.clearPassword} onChange={event => setWebdavDraft(d => ({...d, clearPassword: event.target.checked, password: ''}))} /></Field>
      <p className="text-xs text-[color:var(--color-muted)]">{local('Leave password blank to preserve the saved password.', '密碼留空會保留已儲存密碼。', '密码留空会保留已保存密码。')}</p>
      <Field label={t("ui.ie.export_type")}><select value={webdavDraft.exportType} onChange={(e) => setWebdavDraft((d) => ({ ...d, exportType: e.target.value as "all" | "accounts" | "preferences" }))} className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 py-2 font-mono text-xs text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"><option value="all">{t("ui.ie.export_all")}</option><option value="accounts">{t("ui.ie.export_conn_routes")}</option><option value="preferences">{t("ui.ie.export_settings")}</option></select></Field>
      <Field label={t("ui.ie.auto_sync")}><input type="checkbox" checked={webdavDraft.autoSyncEnabled} onChange={event => setWebdavDraft(d => ({...d, autoSyncEnabled: event.target.checked}))} /><TextInput value={webdavDraft.autoSyncCron} onChange={(e) => setWebdavDraft((d) => ({ ...d, autoSyncCron: e.target.value }))} placeholder="0 */6 * * *" /></Field>
      {syncState.lastSyncAt && <p>{new Date(syncState.lastSyncAt).toLocaleString()}</p>}
      {syncState.lastError && <p role="alert">{syncState.lastError}</p>}
      <p className="text-xs text-[color:var(--color-muted)]">{local('Push and pull use the saved configuration. Save draft changes first.', '推送與拉取使用已儲存設定。請先儲存草稿變更。', '推送与拉取使用已保存设置。请先保存草稿更改。')}</p>
      <div className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]/60 px-3 py-2.5"><span className={`font-mono text-[10px] tracking-wider ${webdavSynced ? "text-[color:var(--color-lime)]" : "text-[color:var(--color-muted)]"}`}>{webdavSynced ? t("ui.ie.webdav_status_synced") : t("ui.ie.webdav_status_never")}</span><div className="flex gap-2"><button type="button" onClick={handleWebdavPush} disabled={busy.webdavPush} className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40">{busy.webdavPush ? local('Pushing…', '推送中…', '推送中…') : t("ui.ie.webdav_push")}</button><button type="button" onClick={handleWebdavPull} disabled={busy.webdavPull} className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] disabled:opacity-40">{busy.webdavPull ? local('Pulling…', '拉取中…', '拉取中…') : t("ui.ie.webdav_pull")}</button></div></div>
      </fieldset>
    </EditDrawer>}
  </div>;
}
