import { formatPrice, type MarketplaceModel } from "./marketplace";
import { useObservationLabels } from "./labels";
export default function ModelMetadata({ model }: { model: MarketplaceModel }) {
  const l = useObservationLabels();
  return <details className="mt-3 text-xs"><summary className="cursor-pointer">{l("Metadata & group prices", "中繼資料與群組定價", "元数据与分组定价")}</summary>
    <p className="my-2 whitespace-pre-wrap">{model.description || l("Upstream description unavailable", "上游未提供說明", "上游未提供说明")}</p>
    <p>{l("Endpoints", "端點", "端点")}: {model.supportedEndpointTypes.join(", ") || "—"}</p>
    <p>{l("Tags", "標籤", "标签")}: {model.tags.join(", ") || "—"}</p>
    <p className="my-2">{l("Headline prices show minimum reported per-million prices; unknown values are —.", "摘要價格為已回報的每百萬最低價；未知值顯示 —。", "摘要价格为已报告的每百万最低价；未知值显示 —。")}</p>
    {model.pricingSources.length === 0 ? <p>—</p> : model.pricingSources.map((s, i) => <section key={`${s.accountId}-${s.siteId}-${i}`} className="my-2 rounded border border-[color:var(--color-border)] p-2">
      <p>{s.siteName} · {s.username ?? s.accountId} · {s.ownerBy ?? "—"}</p>
      <p>{l("Enabled groups", "啟用群組", "启用分组")}: {s.enableGroups.join(", ") || "—"}</p>
      {Object.entries(s.groupPricing).map(([group, p]) => <p key={group} className="mt-1 font-mono">{group}: {p.quotaType === 0 ? `${formatPrice(p.inputPerMillion)} / ${formatPrice(p.outputPerMillion)} USD / 1M` : `${l("Per call", "每次呼叫", "每次调用")}: ${formatPrice(p.perCallTotal)} (${formatPrice(p.perCallInput)} / ${formatPrice(p.perCallOutput)})`}</p>)}
    </section>)}
  </details>;
}
