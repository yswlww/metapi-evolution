import { renderSiteAnnouncementHtml } from "../../../../../src/web/pages/helpers/siteAnnouncementPresentation";
/** Reuse the legacy sanitizer, but create elements with the new UI's React runtime. */
export default function AnnouncementContent({ content }: { content: string }) {
  return <div className="announcement-rich-content" dangerouslySetInnerHTML={{ __html: renderSiteAnnouncementHtml(content) }} />;
}
