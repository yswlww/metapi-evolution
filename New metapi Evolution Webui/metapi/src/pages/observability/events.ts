export interface BackendEvent { id: number; type: string; level?: string; title: string; message?: string | null; read: boolean; createdAt?: string | null }
export type EventResult = "success" | "warning" | "failure" | "info" | "skipped" | "running";
export interface ProgramEvent { id: string; type: string; status: EventResult; title: string; detail: string; occurredAt: string; read: boolean }
export function eventResult(row: Pick<BackendEvent, "title" | "message" | "level">): EventResult {
  const text = `${row.title} ${row.message ?? ""}`.toLowerCase();
  const count = (re: RegExp) => { const m = text.match(re); return m ? Number(m[1]) : undefined; };
  const success = count(/成功[^\d]{0,6}(\d+)/) ?? count(/success(?:ful)?[^\d]{0,6}(\d+)/);
  const failed = count(/失败[^\d]{0,6}(\d+)/) ?? count(/失敗[^\d]{0,6}(\d+)/) ?? count(/failed[^\d]{0,6}(\d+)/);
  const skipped = count(/跳[过過][^\d]{0,6}(\d+)/) ?? count(/skipped?[^\d]{0,6}(\d+)/);
  if (failed !== undefined || success !== undefined || skipped !== undefined) return (failed ?? 0) > 0 ? "failure" : (success ?? 0) > 0 ? "success" : (skipped ?? 0) > 0 ? "skipped" : "success";
  if (/失败|失敗|failed|error/.test(text)) return "failure";
  if (/跳过|跳過|skipped/.test(text)) return "skipped";
  if (/进行中|進行中|已开始|已開始|running|pending/.test(text)) return "running";
  if (/成功|已完成|completed|finished/.test(text) || row.level === "success") return "success";
  return row.level === "error" || row.level === "failure" ? "failure" : row.level === "warning" ? "warning" : "info";
}
export function mapEvent(raw: BackendEvent): ProgramEvent { return { id: String(raw.id), type: raw.type, status: eventResult(raw), title: raw.title, detail: raw.message ?? "", occurredAt: raw.createdAt ?? "", read: Boolean(raw.read) }; }
export function eventPageQuery(params: { offset: number; limit: number; type?: string; unread?: boolean }): string {
  const q = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
  if (params.type && params.type !== "all") q.set("type", params.type);
  if (params.unread) q.set("read", "false");
  return q.toString();
}
export function appendEventPage<T extends { id: string }>(base: T[], rows: T[]): T[] { const byId = new Map(base.map((r) => [r.id, r])); for (const r of rows) byId.set(r.id, r); return [...byId.values()]; }
