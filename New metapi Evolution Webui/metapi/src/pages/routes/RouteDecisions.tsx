import { useEffect, useState } from "react";
import { useUiText } from "../../i18n/useUiText";
import { fetchRouteDecisionTask, fetchRouteModelDecision, fetchRouteWideDecision, refreshRouteDecisionTask } from "../../lib/routesParityApi";
import type { DecisionTask, RouteDecision } from "../../lib/routesParity";
import { buttonClass, inputClass } from "./RouteEditors";
import { useRoutesText, type RoutesTextKey } from "./useRoutesText";

const taskKey = "metapi.routes.decision-task";
export function DecisionRefresh({onCompleted}:{onCompleted:()=>void}) {
  const text = useRoutesText();
  const [jobId,setJobId] = useState<string|null>(()=>{try{return localStorage.getItem(taskKey);}catch{return null;}});
  const [task,setTask] = useState<DecisionTask|null>(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    if (!jobId) return;
    let cancelled = false;
    let timer:ReturnType<typeof setTimeout> | undefined;
    const poll = async()=>{
      try {
        const next = await fetchRouteDecisionTask(jobId);
        if(cancelled) return;
        setTask(next);setError("");
        if(next.status === "succeeded" || next.status === "failed") {
          try{localStorage.removeItem(taskKey);}catch{/* storage optional */}
          if(next.status === "succeeded") onCompleted();
        } else timer = setTimeout(poll,1500);
      } catch(err) {if(!cancelled)setError(err instanceof Error ? err.message : text("error"));}
    };
    void poll();
    return ()=>{cancelled=true;if(timer)clearTimeout(timer);};
    // Parent completion handler is deliberately not a polling dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[jobId,retry]);
  const active = !!jobId && (!task || !["succeeded","failed"].includes(task.status));
  return <div className="space-y-2">
    <button type="button" className={buttonClass} disabled={busy || active} onClick={async()=>{
      setBusy(true);setError("");
      try {const result=await refreshRouteDecisionTask();setTask({id:result.jobId,status:result.status});setJobId(result.jobId);try{localStorage.setItem(taskKey,result.jobId);}catch{/* storage optional */}setRetry(n=>n+1);} catch(err){setError(err instanceof Error?err.message:text("error"));} finally{setBusy(false);}
    }}>{text("refreshDecisions")}</button>
    {jobId && <div className="text-xs" role="status">{text("task")} · {task && ["pending","running","succeeded","failed"].includes(task.status) ? text(task.status as RoutesTextKey) : text("queued")} · {jobId}</div>}
    {task?.logs?.length ? <details className="text-xs"><summary>{text("task")}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{task.logs.map(entry=>entry.message ?? "").join("\n")}</pre></details>:null}
    {task?.status === "failed" && <p role="alert" className="text-xs text-[color:var(--color-rose)]">{task.error || text("failed")}</p>}
    {error && <div role="alert" className="text-xs text-[color:var(--color-rose)]">{error}{jobId && <><button type="button" className={buttonClass} onClick={()=>setRetry(n=>n+1)}>{text("retryTask")}</button><button type="button" className={buttonClass} onClick={()=>{setJobId(null);setTask(null);setError("");try{localStorage.removeItem(taskKey);}catch{/* storage optional */}}}>{text("clear")}</button></>}</div>}
  </div>;
}

export function DecisionPanel({routeId,revision,models,snapshot,refreshedAt}:{routeId:number; revision:number; models:string[];snapshot?:RouteDecision|null;refreshedAt?:string|null}) {
  const text = useRoutesText(), t = useUiText();
  const [model,setModel] = useState("");
  const [requested,setRequested] = useState("");
  const [requestVersion,setRequestVersion] = useState(0);
  const [decision,setDecision] = useState<RouteDecision|null>(null);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  useEffect(()=>{
    let cancelled=false;setLoading(true);setDecision(null);setError("");
    if(snapshot && !requested && requestVersion===0){setDecision(snapshot);setLoading(false);return;}
    const request = requested ? fetchRouteModelDecision(routeId,requested) : fetchRouteWideDecision(routeId);
    request.then(result=>{if(!cancelled)setDecision(result);}).catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:text("error"));}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[routeId,revision,requested,requestVersion,snapshot]);
  return <section className="space-y-3 border-t border-[color:var(--color-border)] pt-4">
    <h3 className="font-mono text-xs">{text("selection")}</h3>
    <p className="text-xs text-[color:var(--color-muted)]">{text(snapshot && !requested && requestVersion===0 ? "cached" : "liveDecision")}{snapshot && !requested && requestVersion===0 && refreshedAt ? ` · ${refreshedAt}` : ""}</p>
    <label className="block text-xs">{text("concrete")}<input className={inputClass} list="route-decision-models" value={model} onChange={e=>setModel(e.target.value)}/><datalist id="route-decision-models">{models.map(m=><option key={m} value={m}/>)}</datalist></label>
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={loading} onClick={()=>{setRequested(model.trim());setRequestVersion(n=>n+1);}}>{text("inspect")}</button><button type="button" className={buttonClass} disabled={loading} onClick={()=>{setModel("");setRequested("");setRequestVersion(n=>n+1);}}>{text("routeWide")}</button></div>
    {loading ? <p className="text-xs">{t("ui.routes.loading_channels")}</p> : error ? <p role="alert" className="text-xs text-[color:var(--color-rose)]">{error}</p> : decision ? <>
      <ul className="space-y-1 text-xs">{decision.summary.map((line,index)=><li key={index}>{line}</li>)}</ul>
      <div className="space-y-2">{decision.candidates.map(candidate=><div key={candidate.channelId} className="rounded border border-[color:var(--color-border)] p-2 text-xs">
        <div>{candidate.username} · {candidate.siteName} · {candidate.tokenName}</div>
        <div className="font-mono">{text("selection")}: {Number.isFinite(candidate.probability) ? `${candidate.probability.toFixed(2)}%` : "—"} · {text("priority")}: {candidate.priority} · {text("weight")}: {candidate.weight}</div>
        <div>{text(candidate.eligible ? "eligible" : "ineligible")} · {candidate.reason}</div>
      </div>)}</div>
    </> : <p className="text-xs">{text("noDecision")}</p>}
  </section>;
}
