import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Route, Trash2 } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, SearchField, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { fetchRoutes, deleteRoute, clearRouteCooldown, rebuildRoutes, fetchRouteChannels, addChannel, updateChannel, deleteChannel, batchUpdateChannelPriorities, fetchAccounts, fetchAccountTokens, batchUpdateRoutes } from "../lib/source";
import { buildChannelPayload, buildRoutePayload, decorateRouteCapabilities, filterRoutes, movePriorityBucket, routeBrand, routeModels, type RouteRow, type ChannelRow, type RouteDraft, type ChannelDraft, type RouteFilters } from "../lib/routesParity";
import { fetchRouteModelCatalog, saveParityRoute } from "../lib/routesParityApi";
import { RouteEditor, ChannelEditor, buttonClass, inputClass, type AccountOption, type TokenOption } from "./routes/RouteEditors";
import { DecisionPanel, DecisionRefresh } from "./routes/RouteDecisions";
import { useRoutesText, type RoutesTextKey } from "./routes/useRoutesText";

const emptyFilters:RouteFilters = {search:"",status:"",mode:"",site:"",brand:"",capability:"",group:"",sort:"channels"};
export default function Routes() {
  const t = useUiText(), text = useRoutesText(), {showToast} = useToast();
  const [routes,setRoutes] = useState<RouteRow[]>([]);
  const [selectedId,setSelectedId] = useState<number|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [filters,setFilters] = useState<RouteFilters>(emptyFilters);
  const [channels,setChannels] = useState<ChannelRow[]>([]);
  const [channelsLoading,setChannelsLoading] = useState(false);
  const [channelError,setChannelError] = useState("");
  const [revision,setRevision] = useState(0);
  const [accounts,setAccounts] = useState<AccountOption[]>([]);
  const [tokens,setTokens] = useState<TokenOption[]>([]);
  const [models,setModels] = useState<string[]>([]);
  const [endpointTypes,setEndpointTypes] = useState<Record<string,string[]>>({});
  const [catalogError,setCatalogError] = useState("");
  const [routeEditor,setRouteEditor] = useState<{route:RouteRow|null}|null>(null);
  const [channelEditor,setChannelEditor] = useState<{channel:ChannelRow|null}|null>(null);
  const [batchIds,setBatchIds] = useState<Set<number>>(new Set());
  const [busy,setBusy] = useState(false);
  const selected = routes.find(r=>r.id===selectedId);
  const inherited = selected?.routeMode === "explicit_group";
  const sortedChannels = [...channels].sort((a,b)=>a.priority-b.priority || a.id-b.id);
  const priorities = [...new Set(sortedChannels.map(c=>c.priority))];
  const message = (err:unknown)=>{
    if(err instanceof Error && ["invalidRoute","invalidStrategy","invalidChannel"].includes(err.message)) return text(err.message as RoutesTextKey);
    return err instanceof Error ? err.message : text("error");
  };
  const loadRoutes = async()=>{
    setLoading(true);setError("");
    try {
      const result = await fetchRoutes() as RouteRow[];
      setRoutes(result);
      setBatchIds(ids=>new Set([...ids].filter(id=>result.some(r=>r.id===id))));
      setSelectedId(id=>id !== null && result.some(r=>r.id===id) ? id : null);
    } catch(err){setError(message(err));} finally{setLoading(false);}
  };
  const loadCatalog = async()=>{
    setCatalogError("");
    try {
      const [catalog,accts,toks] = await Promise.all([fetchRouteModelCatalog(),fetchAccounts(),fetchAccountTokens()]);
      setModels(Object.keys(catalog.models ?? {}).sort());setEndpointTypes(catalog.endpointTypesByModel ?? {});
      setAccounts(accts.map(a=>({id:a.id,username:a.username,siteName:a.siteName})));
      setTokens((toks as Array<{id:number; accountId?:number; account?:{id:number}; name?:string; enabled?:boolean}>).map(tk=>({id:tk.id,accountId:tk.accountId ?? tk.account?.id ?? 0,name:tk.name ?? `#${tk.id}`,enabled:tk.enabled})));
    } catch(err){setCatalogError(message(err));}
  };
  useEffect(()=>{void loadRoutes();void loadCatalog(); /* eslint-disable-next-line react-hooks/exhaustive-deps */},[]);
  useEffect(()=>{
    if(selectedId===null){setChannels([]);setChannelError("");return;}
    let cancelled=false;setChannelsLoading(true);setChannels([]);setChannelError("");
    fetchRouteChannels(selectedId).then(data=>{if(!cancelled)setChannels(data as ChannelRow[]);}).catch(err=>{if(!cancelled)setChannelError(message(err));}).finally(()=>{if(!cancelled)setChannelsLoading(false);});
    return()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedId,revision]);
  const decorated = useMemo(()=>decorateRouteCapabilities(routes,endpointTypes),[routes,endpointTypes]);
  const filtered = useMemo(()=>filterRoutes(decorated,filters),[decorated,filters]);
  const sites = [...new Set(routes.flatMap(r=>r.siteNames ?? (r.channels ?? []).map(c=>c.site?.name ?? c.siteName ?? "")).filter(Boolean))].sort();
  const brands = [...new Set(routes.flatMap(r=>routeModels(r,routes).map(routeBrand)))].sort();
  const capabilities = [...new Set(Object.values(endpointTypes).flat())].sort();
  const groups = routes.filter(r=>r.routeMode === "explicit_group" || !r.modelPattern || /[?*]/.test(r.modelPattern) || r.modelPattern.toLowerCase().startsWith("re:"));
  const sourceModels = selected ? [...new Set([...models,...routeModels(selected,routes)])].sort() : models;
  // Retain the existing page's summary metrics while extending its route workflow.
  const routeAverages = routes.map(r=>{
    const rows=r.channels ?? [];
    const calls=rows.reduce((sum,c)=>sum+(c.successCount ?? 0)+(c.failCount ?? 0),0);
    return {latency:calls ? Math.round(rows.reduce((sum,c)=>sum+(c.totalLatencyMs ?? 0),0)/calls) : 0, cost:rows.length ? rows.reduce((sum,c)=>sum+(c.totalCost ?? 0),0)/rows.length : 0};
  });
  const run = async(action:()=>Promise<void>, options:{reload?:boolean;success?:string}={reload:true})=>{
    if(busy)return;
    setBusy(true);
    try {await action();showToast(options.success ?? text("saved"));if(options.reload !== false){await loadRoutes();setRevision(n=>n+1);}}catch(err){showToast(message(err));}finally{setBusy(false);}
  };
  const saveRoute = async(draft:RouteDraft)=>{
    try {
      buildRoutePayload(draft);
      await saveParityRoute(routeEditor?.route?.id ?? null,draft);
      setRouteEditor(null);showToast(text("saved"));await loadRoutes();setRevision(n=>n+1);
    } catch(err){showToast(message(err));}
  };
  const saveChannel = async(accountId:number,draft:ChannelDraft)=>{
    if(!selected)return;
    try {
      const payload=buildChannelPayload(draft);
      if(channelEditor?.channel) await updateChannel(channelEditor.channel.id,payload);
      else await addChannel(selected.id,{accountId,...payload,sourceModel:payload.sourceModel ?? undefined});
      setChannelEditor(null);showToast(text("saved"));await loadRoutes();setRevision(n=>n+1);
    }catch(err){showToast(message(err));}
  };
  const toggleBatch = (id:number)=>setBatchIds(ids=>{const next=new Set(ids);if(next.has(id))next.delete(id);else next.add(id);return next;});
  const selectFilter = (key:keyof RouteFilters,label:string,options:Array<{value:string;label:string}>)=><label className="min-w-32 flex-1 text-xs">{label}<select className={inputClass} value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}><option value="">{text("all")}</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  return <div className="space-y-6">
    <PageHeader eyebrow={t("ui.routes.eyebrow_fed")} title={t("ui.routes.title")} description={t("ui.routes.desc")} actions={<button type="button" className={buttonClass} disabled={busy} onClick={()=>setRouteEditor({route:null})}><Plus size={14} className="inline"/> {t("ui.common.add_route")}</button>}/>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label={t("ui.routes.total_rules")} value={routes.length} icon={<Route size={16}/>}/>
      <StatCard label={t("ui.routes.active")} value={routes.filter(r=>r.enabled).length} icon={<Route size={16}/>}/>
      <StatCard label={t("ui.routes.avg_latency")} value={routes.length ? `${Math.round(routeAverages.reduce((sum,r)=>sum+r.latency,0)/routes.length)}ms` : "—"} icon={<Route size={16}/>}/>
      <StatCard label={t("ui.routes.avg_cost")} value={routes.length ? `$${(routeAverages.reduce((sum,r)=>sum+r.cost,0)/routes.length).toFixed(2)}` : "—"} icon={<Route size={16}/>}/>
    </div>
    <div className="card space-y-3 p-4">
      <SearchField label={t("ui.routes.search_ph")} placeholder={t("ui.routes.search_ph")} value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/>
      <div className="flex flex-wrap gap-3">
        {selectFilter("status",text("status"),[{value:"enabled",label:t("ui.common.enabled")},{value:"disabled",label:t("ui.common.disabled")}])}
        {selectFilter("mode",text("mode"),[{value:"pattern",label:text("pattern")},{value:"explicit_group",label:text("explicit_group")}])}
        {selectFilter("site",text("site"),sites.map(s=>({value:s,label:s})))}
        {selectFilter("brand",text("brand"),brands.map(b=>({value:b,label:b === "other" ? text("other") : b})))}
        {selectFilter("capability",text("capability"),capabilities.map(c=>({value:c,label:c})))}
        {selectFilter("group",text("group"),groups.map(r=>({value:String(r.id),label:r.displayName || r.modelPattern})))}
        <label className="min-w-32 flex-1 text-xs">{text("sort")}<select className={inputClass} value={filters.sort} onChange={e=>setFilters({...filters,sort:e.target.value})}><option value="channels">{text("channelSort")}</option><option value="name">{text("nameSort")}</option><option value="name_desc">{text("nameDesc")}</option></select></label>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || loading} onClick={()=>{void loadRoutes();void loadCatalog();setRevision(n=>n+1);}}><RefreshCw size={12} className="inline"/> {text("refresh")}</button><button type="button" className={buttonClass} onClick={()=>setFilters(emptyFilters)}>{text("clear")}</button><button type="button" className={buttonClass} disabled={busy} onClick={()=>void run(()=>rebuildRoutes(true,false),{reload:true,success:text("rebuildQueued")})}>{text("rebuild")}</button></div>
      {catalogError && <p role="alert" className="text-xs text-[color:var(--color-rose)]">{catalogError}</p>}
      <DecisionRefresh onCompleted={()=>{void loadRoutes();setRevision(n=>n+1);}}/>
    </div>
    {error && <p role="alert" className="text-sm text-[color:var(--color-rose)]">{error}</p>}
    {batchIds.size > 0 && <div className="card flex flex-wrap items-center gap-2 p-3"><span className="text-xs">{batchIds.size} {text("selected")}</span>{(["enable","disable"] as const).map(action=><button key={action} type="button" className={buttonClass} disabled={busy} onClick={()=>void run(async()=>{await batchUpdateRoutes({ids:[...batchIds],action});setBatchIds(new Set());})}>{t(`ui.common.${action}`)}</button>)}<button type="button" className={buttonClass} onClick={()=>setBatchIds(new Set())}>{text("clear")}</button></div>}
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-2">{loading && !routes.length ? <p>{t("ui.routes.loading_routes")}</p> : !filtered.length ? <EmptyState title={t("ui.routes.no_match")} description={t("ui.routes.no_match_desc")} icon={<Route size={18}/>}/> : filtered.map(route=><div key={route.id} className={`card flex items-start gap-3 p-4 ${selectedId===route.id ? "ring-1 ring-[color:var(--color-lime)]" : ""}`}>
        <input type="checkbox" aria-label={`${text("selected")} ${route.displayName || route.modelPattern}`} checked={batchIds.has(route.id)} disabled={busy} onChange={()=>toggleBatch(route.id)} className="mt-1"/>
        <button type="button" className="min-w-0 flex-1 text-left" disabled={busy} onClick={()=>{setSelectedId(route.id);setChannelEditor(null);}}><span className="block break-words font-display text-xl">{route.displayName || route.modelPattern}</span><span className="block break-words font-mono text-xs text-[color:var(--color-muted)]">{route.modelPattern}</span><span className="mt-2 block text-xs">{text(route.routeMode === "explicit_group" ? "explicit_group" : "pattern")} · {route.routingStrategy && ["weighted","round_robin","stable_first"].includes(route.routingStrategy) ? text(route.routingStrategy as RoutesTextKey) : route.routingStrategy} · {route.channelCount ?? route.channels?.length ?? 0} {t("ui.routes.channels")} · {t(route.enabled ? "ui.common.enabled" : "ui.common.disabled")}</span></button>
      </div>)}</div>
      {selected ? <aside className="card min-w-0 space-y-4 p-4">
        <h2 className="break-words font-display text-xl">{selected.displayName || selected.modelPattern}</h2>
        <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={()=>setRouteEditor({route:selected})}>{t("ui.common.edit")}</button><button type="button" className={buttonClass} disabled={busy} onClick={()=>void run(()=>clearRouteCooldown(selected.id))}>{t("ui.routes.cooldown_clear_hint")}</button><button type="button" className={buttonClass} disabled={busy} aria-label={text("deleteRoute")} onClick={()=>{if(window.confirm(text("deleteRoute")))void run(()=>deleteRoute(selected.id));}}><Trash2 size={14}/></button></div>
        {inherited && <div className="space-y-2 text-xs"><p>{text("groupHint")}</p>{(selected.sourceRouteIds ?? []).map(id=><button key={id} className={buttonClass} type="button" disabled={busy} onClick={()=>setSelectedId(id)}>{text("openSource")}: {routes.find(r=>r.id===id)?.modelPattern ?? `#${id}`}</button>)}</div>}
        <section className="space-y-2 border-t border-[color:var(--color-border)] pt-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-xs">{t("ui.routes.channels")} · {channels.length}</h3>{!inherited && <button type="button" className={buttonClass} disabled={busy || !!catalogError} onClick={()=>setChannelEditor({channel:null})}>{t("ui.routes.add_channel")}</button>}</div>
          {!inherited && <p className="text-xs text-[color:var(--color-muted)]">{text("bucketHint")}</p>}
          {channelsLoading ? <p className="text-xs">{t("ui.routes.loading_channels")}</p> : channelError ? <p role="alert" className="text-xs text-[color:var(--color-rose)]">{channelError}</p> : !channels.length ? <p className="text-xs">{text("emptyChannels")}</p> : priorities.map((priority,index)=><div key={priority} className="rounded-lg border border-[color:var(--color-border)] p-2">
            <div className="flex items-center gap-2 text-xs"><span className="flex-1">{text("priority")}: {priority}</span>{!inherited && <><button type="button" className={buttonClass} title={text("moveUp")} aria-label={text("moveUp")} disabled={busy || index===0} onClick={()=>void run(()=>batchUpdateChannelPriorities(movePriorityBucket(channels,sortedChannels.find(c=>c.priority===priority)!.id,-1)))}><ArrowUp size={12}/></button><button type="button" className={buttonClass} title={text("moveDown")} aria-label={text("moveDown")} disabled={busy || index===priorities.length-1} onClick={()=>void run(()=>batchUpdateChannelPriorities(movePriorityBucket(channels,sortedChannels.find(c=>c.priority===priority)!.id,1)))}><ArrowDown size={12}/></button></>}</div>
            {sortedChannels.filter(c=>c.priority===priority).map(channel=><div key={channel.id} className="mt-2 space-y-1 border-t border-[color:var(--color-border)] pt-2 text-xs"><div>{channel.account?.username ?? channel.username ?? `#${channel.accountId}`} · {channel.site?.name ?? channel.siteName ?? ""}</div><div className="break-words">{channel.token?.name ?? channel.tokenName ?? text("follow")} · {channel.sourceModel ?? "—"} · {text("weight")}: {channel.weight}</div>{inherited ? <span>{t(channel.enabled ? "ui.common.enabled" : "ui.common.disabled")}</span> : <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || !!catalogError} onClick={()=>setChannelEditor({channel})}>{text("editChannel")}</button><button type="button" className={buttonClass} disabled={busy} onClick={()=>void run(()=>updateChannel(channel.id,{enabled:!channel.enabled}))}>{t(channel.enabled ? "ui.common.disable" : "ui.common.enable")}</button><button type="button" className={buttonClass} disabled={busy} aria-label={text("deleteChannel")} onClick={()=>{if(window.confirm(text("deleteChannel")))void run(()=>deleteChannel(channel.id));}}><Trash2 size={12}/></button></div>}</div>)}
          </div>)}
        </section>
        <DecisionPanel key={selected.id} routeId={selected.id} revision={revision} models={sourceModels} snapshot={selected.decisionSnapshot} refreshedAt={selected.decisionRefreshedAt}/>
      </aside> : <div className="card p-8 text-center text-sm">{t("ui.routes.select_route")}</div>}
    </div>
    {routeEditor && <RouteEditor key={routeEditor.route?.id ?? "new"} route={routeEditor.route} routes={routes} onClose={()=>setRouteEditor(null)} onSave={saveRoute}/>}
    {channelEditor && <ChannelEditor key={channelEditor.channel?.id ?? "new"} channel={channelEditor.channel} accounts={accounts} tokens={tokens} models={sourceModels} onClose={()=>setChannelEditor(null)} onSave={saveChannel}/>}
  </div>;
}
