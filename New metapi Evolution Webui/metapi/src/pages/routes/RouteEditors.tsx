import { useState } from "react";
import { EditDrawer, Field, TextInput, Toggle } from "../../components/EditDrawer";
import { useUiText } from "../../i18n/useUiText";
import { ROUTING_STRATEGIES, sourceRouteOptions, type ChannelDraft, type ChannelRow, type RouteDraft, type RouteRow } from "../../lib/routesParity";
import { useRoutesText } from "./useRoutesText";

export const inputClass = "h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 text-xs text-[color:var(--color-fg)]";
export const buttonClass = "rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs text-[color:var(--color-fg)] disabled:opacity-40";
export type TokenOption = {id:number; accountId:number; name:string; enabled?:boolean};
export type AccountOption = {id:number; username:string; siteName:string};

export function RouteEditor({route, routes, onClose, onSave}: {route:RouteRow|null; routes:RouteRow[]; onClose:()=>void; onSave:(draft:RouteDraft)=>Promise<void>}) {
  const t = useUiText(), text = useRoutesText();
  const [draft,setDraft] = useState<RouteDraft>({modelPattern:route?.modelPattern ?? "", displayName:route?.displayName ?? "", routeMode:route?.routeMode === "explicit_group" ? "explicit_group" : "pattern", sourceRouteIds:[...(route?.sourceRouteIds ?? [])], strategy:route?.routingStrategy ?? "weighted", enabled:route?.enabled ?? true});
  const [search,setSearch] = useState("");
  const [saving,setSaving] = useState(false);
  const sources = sourceRouteOptions(routes,route?.id);
  const valid = draft.routeMode === "pattern" ? !!draft.modelPattern.trim() : !!draft.displayName.trim() && draft.sourceRouteIds.length > 0;
  return <EditDrawer open onClose={onClose} title={t(route ? "ui.routes.title_edit" : "ui.routes.title_new")} footer={<><button type="button" className={buttonClass} onClick={onClose} disabled={saving}>{t("ui.common.cancel")}</button><button type="button" className={buttonClass} disabled={saving || !valid} onClick={async()=>{setSaving(true);try {await onSave(draft);} finally {setSaving(false);}}}>{t("ui.common.save")}</button></>}>
    <Field label={text("mode")}><select className={inputClass} value={draft.routeMode} onChange={e=>setDraft({...draft,routeMode:e.target.value as RouteDraft["routeMode"]})}><option value="pattern">{text("pattern")}</option><option value="explicit_group">{text("explicit_group")}</option></select></Field>
    <Field label={draft.routeMode === "explicit_group" ? text("publicName") : t("ui.routes.display_name")}><TextInput value={draft.displayName} onChange={e=>setDraft({...draft,displayName:e.target.value})}/></Field>
    {draft.routeMode === "pattern" ? <Field label={t("ui.routes.model_pattern")} hint={text("globHint")}><TextInput value={draft.modelPattern} onChange={e=>setDraft({...draft,modelPattern:e.target.value})}/></Field> : <section className="mb-4" aria-label={text("sources")}>
      <p className="mb-2 text-xs">{text("sources")} · {text("sourcesHint")}</p>
      <input className={inputClass} aria-label={text("sourceSearch")} placeholder={text("sourceSearch")} value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="mt-2 max-h-64 space-y-2 overflow-auto">{sources.filter(r=>`${r.modelPattern} ${r.displayName ?? ""}`.toLowerCase().includes(search.toLowerCase())).map(r=><label key={r.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.sourceRouteIds.includes(r.id)} onChange={e=>setDraft({...draft, sourceRouteIds:e.target.checked ? [...draft.sourceRouteIds,r.id] : draft.sourceRouteIds.filter(id=>id!==r.id)})}/><span>{r.modelPattern}{r.displayName && r.displayName !== r.modelPattern ? ` · ${r.displayName}` : ""} · #{r.id}</span>{!r.enabled && <span>{t("ui.common.disabled")}</span>}</label>)}</div>
    </section>}
    <Field label={t("ui.routes.strategy")}><select className={inputClass} value={draft.strategy} onChange={e=>setDraft({...draft,strategy:e.target.value})}>{ROUTING_STRATEGIES.map(s=><option key={s} value={s}>{text(s)}</option>)}</select></Field>
    <div className="flex items-center justify-between"><span>{t("ui.routes.enabled")}</span><Toggle checked={draft.enabled} onChange={enabled=>setDraft({...draft,enabled})}/></div>
  </EditDrawer>;
}

export function ChannelEditor({channel, accounts, tokens, models, onClose, onSave}:{channel:ChannelRow|null; accounts:AccountOption[]; tokens:TokenOption[]; models:string[]; onClose:()=>void; onSave:(accountId:number,draft:ChannelDraft)=>Promise<void>}) {
  const t = useUiText(), text = useRoutesText();
  const [accountId,setAccountId] = useState(String(channel?.accountId ?? ""));
  const [draft,setDraft] = useState<ChannelDraft>({tokenId:channel?.tokenId == null ? "" : String(channel.tokenId), sourceModel:channel?.sourceModel ?? "", priority:String(channel?.priority ?? 0), weight:String(channel?.weight ?? 10)});
  const [saving,setSaving] = useState(false);
  const options = tokens.filter(t=>t.accountId===Number(accountId));
  return <EditDrawer open onClose={onClose} title={channel ? text("editChannel") : t("ui.routes.add_channel")} footer={<><button className={buttonClass} type="button" onClick={onClose} disabled={saving}>{t("ui.common.cancel")}</button><button className={buttonClass} type="button" disabled={saving || !accountId} onClick={async()=>{setSaving(true);try {await onSave(Number(accountId),draft);} finally {setSaving(false);}}}>{t("ui.common.save")}</button></>}>
    <Field label={t("ui.routes.account")}><select className={inputClass} disabled={!!channel} value={accountId} onChange={e=>{setAccountId(e.target.value);setDraft({...draft,tokenId:""});}}><option value="">{t("ui.routes.select_account")}</option>{channel && !accounts.some(a=>a.id===channel.accountId) && <option value={channel.accountId}>{channel.account?.username ?? channel.username ?? `#${channel.accountId}`}</option>}{accounts.map(a=><option key={a.id} value={a.id}>{a.username} · {a.siteName}</option>)}</select></Field>
    <Field label={text("binding")} hint={text("followHint")}><select className={inputClass} value={draft.tokenId} onChange={e=>setDraft({...draft,tokenId:e.target.value})}><option value="">{text("follow")}</option>{draft.tokenId && !options.some(t=>String(t.id)===draft.tokenId) && <option value={draft.tokenId}>{text("missingToken")} #{draft.tokenId}</option>}{options.map(tk=><option key={tk.id} value={tk.id}>{tk.name}{tk.enabled===false ? ` · ${t("ui.common.disabled")}` : ""}</option>)}</select></Field>
    <Field label={t("ui.routes.source_model_opt")}><TextInput value={draft.sourceModel} list="route-source-models" onChange={e=>setDraft({...draft,sourceModel:e.target.value})}/><datalist id="route-source-models">{models.map(m=><option key={m} value={m}/>)}</datalist></Field>
    <Field label={text("priority")} hint={text("bucketHint")}><input className={inputClass} type="number" min="0" step="1" value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value})}/></Field>
    <Field label={text("weight")}><input className={inputClass} type="number" min="0" step="any" value={draft.weight} onChange={e=>setDraft({...draft,weight:e.target.value})}/></Field>
  </EditDrawer>;
}
