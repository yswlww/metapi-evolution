import type { Announcement } from "../../data/prototype";
export interface BackendAnnouncement { id: number; siteId: number; platform: string; sourceKey: string; title: string; content: string; level: string; readAt?: string | null; firstSeenAt?: string | null; lastSeenAt?: string | null }
export type AnnouncementRow = Announcement & { siteId?: number; severity?: string; readAt?: string | null; lastSeenAt?: string | null };
export function mapAnnouncement(raw: BackendAnnouncement): AnnouncementRow {
  return { id: String(raw.id), title: raw.title, summary: raw.content ?? "", source: `${raw.platform} · ${raw.sourceKey}`, level: raw.level === "error" ? "security" : raw.level === "warning" ? "maintenance" : "info", read: Boolean(raw.readAt), publishedAt: raw.firstSeenAt ?? "", siteId: raw.siteId, severity: raw.level, readAt: raw.readAt, lastSeenAt: raw.lastSeenAt };
}
