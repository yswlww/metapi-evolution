import { useEffect, useMemo, useState } from "react";
import { Bug, Image, Send, Sparkles, Terminal, Video } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EmptyState, SearchField, SectionTitle, StatCard } from "../components/PrototypeUI";
import { useUiText } from "../i18n/useUiText";
import { useToast } from "../components/Toast";
import { PLAYGROUND_MODELS } from "../data/playground";
import { startProxyTestJob, getProxyTestJob, fetchModelsMarketplace, DATA_MODE } from "../lib/source";

type PlaygroundMode = "text" | "image" | "video";
type Protocol = "openai" | "claude" | "gemini" | "responses";

export default function Playground() {
  const t = useUiText();
  const { showToast } = useToast();
  const [mode, setMode] = useState<PlaygroundMode>("text");
  const [model, setModel] = useState(
    DATA_MODE === "prototype"
      ? (PLAYGROUND_MODELS.find((m) => m.modes.includes("text"))?.name ?? "")
      : "",
  );
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [protocol, setProtocol] = useState<Protocol>("openai");
  const [forcedChannel, setForcedChannel] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [responsePreview, setResponsePreview] = useState("");
  // Matrix of model names across the text/image/video modes. Built from the
  // real marketplace catalog in API mode; prototype list only in prototype
  // mode. An empty catalog stays empty (no fake chips).
  const [modelsByMode, setModelsByMode] = useState<Record<PlaygroundMode, string[]>>(() =>
    DATA_MODE === "prototype"
      ? {
        text: PLAYGROUND_MODELS.filter((m) => m.modes.includes("text")).map((m) => m.name),
        image: PLAYGROUND_MODELS.filter((m) => m.modes.includes("image")).map((m) => m.name),
        video: PLAYGROUND_MODELS.filter((m) => m.modes.includes("video")).map((m) => m.name),
      }
      : { text: [], image: [], video: [] },
  );
  const [catalogLoaded, setCatalogLoaded] = useState(DATA_MODE === "prototype");

  // Load the real model catalog from the marketplace endpoint.
  useEffect(() => {
    if (DATA_MODE === "prototype") return;
    fetchModelsMarketplace({ includePricing: false })
      .then(({ models }) => {
        const names = (models as Array<{ name?: string }>).map((m) => m.name).filter((n): n is string => !!n);
        // Text: all catalog models. Image/video: keep empty (catalog has no
        // modality tags).
        setModelsByMode((prev) => ({ ...prev, text: names }));
        setModel((cur) => (names.includes(cur) ? cur : names[0] ?? cur));
      })
      .catch(() => { /* keep empty on error */ })
      .finally(() => setCatalogLoaded(true));
  }, []);

  const filtered = modelsByMode[mode] ?? [];

  // Poll a proxy test job until it reaches a terminal state.
  const waitForJob = async (jobId: string, maxAttempts = 40): Promise<unknown> => {
    for (let i = 0; i < maxAttempts; i++) {
      const job = await getProxyTestJob(jobId) as any;
      const status = job?.status;
      if (status === "succeeded") return job;
      if (status === "failed" || status === "cancelled") {
        throw new Error(
          job?.error?.error?.message ?? job?.error?.message ?? `Proxy test ${status}`,
        );
      }
      // 1s between polls; the job runs server-side.
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Proxy test timed out.");
  };

  // Map the UI model picker to the underlying test request. The protocol
  // selector drives the upstream path/body shape (claude → /v1/messages,
  // responses → /v1/responses, openai/gemini → /v1/chat/completions).
  const runProxyTest = async () => {
    if (!model) throw new Error("No model selected. Refresh the Models page to discover available models.");
    const path = mode === "image"
      ? "/v1/images/generations"
      : protocol === "claude"
        ? "/v1/messages"
        : protocol === "responses"
          ? "/v1/responses"
          : "/v1/chat/completions";
    const jsonBody =
      mode === "image"
        ? { model, prompt: input, n: 1, size: "1024x1024" }
        : protocol === "claude"
          ? { model, max_tokens: 1024, messages: [{ role: "user", content: input }], stream: false }
          : protocol === "responses"
            ? { model, input, stream: false }
            : { model, messages: [{ role: "user", content: input }], stream: false };
    const envelope = {
      method: "POST" as const,
      path,
      requestKind: "json" as const,
      jobMode: true,
      stream: false,
      ...(protocol !== "openai" ? { targetFormat: protocol } : {}),
      ...(forcedChannel.trim() && !Number.isNaN(Number(forcedChannel))
        ? { forcedChannelId: Number(forcedChannel) }
        : {}),
      jsonBody,
    };
    const { jobId } = await startProxyTestJob(envelope);
    if (!jobId) throw new Error("Proxy test job did not return an id.");
    return waitForJob(jobId);
  };

  const handleRun = async () => {
    if (!input.trim()) return;
    setRunning(true);
    setResponsePreview("");
    try {
      const result = await runProxyTest();
      const payload = (result as any)?.result ?? result;
      setResponsePreview(JSON.stringify(payload, null, 2));
      showToast("Proxy test completed.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Proxy test failed.");
      setResponsePreview("");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tools"
        title={t("ui.playground.title")}
        description={t("ui.playground.desc")}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("ui.playground.models_label")} value={filtered.length} icon={<Terminal size={16} />} />
        <StatCard label={t("ui.playground.active_mode")} value={mode} icon={<Sparkles size={16} />} />
      </div>

      {/* Mode selector */}
      <div className="card p-4">
        <div className="mb-3 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.playground.mode")}</div>
        <div className="flex flex-wrap gap-1.5">
          {(["text", "image", "video"] as PlaygroundMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                mode === m
                  ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                  : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
              }`}
            >
              {m === "text" ? <Terminal size={12} /> : m === "image" ? <Image size={12} /> : <Video size={12} />}
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Model selector */}
      <div className="card p-4">
        <div className="mb-3 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.playground.model")}</div>
        {!catalogLoaded ? (
          <div className="py-2 text-xs text-[color:var(--color-muted)]">{t("ui.playground.loading_catalog")}</div>
        ) : filtered.length === 0 ? (
          <div className="py-2 text-xs text-[color:var(--color-muted)]">
            No models available. Refresh the Models page to discover them.
          </div>
        ) : (
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModel(m)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                model === m
                  ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                  : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* Protocol + forced channel */}
      <div className="card p-4">
        <div className="mb-3 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.playground.protocol_channel")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(["openai", "claude", "gemini", "responses"] as Protocol[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProtocol(p)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                  protocol === p
                    ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                    : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">{t("ui.playground.forced_channel")}</span>
            <input
              value={forcedChannel}
              onChange={(e) => setForcedChannel(e.target.value)}
              placeholder="auto (weighted)"
              className="h-8 w-44 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-2.5 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50"
            />
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="card p-4">
        <div className="mb-3 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.playground.prompt")}</div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            placeholder={mode === "text" ? "Enter your prompt here…" : mode === "image" ? "Describe the image to generate…" : "Describe the video to create…"}
            className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] p-3 font-mono text-xs text-[color:var(--color-fg)] placeholder:text-[color:var(--color-muted)] outline-none focus:border-[color:var(--color-lime)]/50"
          />
          <button
            type="button"
            onClick={handleRun}
            disabled={running || !input.trim() || !model}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-[11px] font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90 disabled:opacity-40"
          >
            {running ? "RUNNING…" : <><Send size={12} /> SEND</>}
          </button>
        </div>
      </div>

      {/* Output */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-muted)]">{t("ui.playground.output")}</span>
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] tracking-wider transition-colors ${
              showDebug
                ? "border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]"
                : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
            }`}
          >
            <Bug size={11} /> DEBUG
          </button>
        </div>
        <div className="min-h-[120px] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] p-3 text-xs text-[color:var(--color-muted)]">
          {running ? (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--color-lime)] border-t-transparent" />
              Processing response…
            </div>
          ) : responsePreview ? (
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-[color:var(--color-fg)]">{responsePreview}</pre>
          ) : input ? (
            <div className="space-y-2">
              <div className="text-[color:var(--color-fg)]">{model ? `Ready to test ${model}` : "No model selected"}</div>
              <div className="text-[color:var(--color-muted)]">{t("ui.playground.press_send")}</div>
            </div>
          ) : (
            "Enter a prompt and click Send to run a proxy test."
          )}
        </div>
        {showDebug && (
          <div className="mt-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]/40 p-3">
            <div className="mb-2 font-mono text-[10px] tracking-[0.2em] text-[color:var(--color-lime)]">{t("ui.playground.request_debug")}</div>
            <pre className="whitespace-pre-wrap font-mono text-[10px] leading-5 text-[color:var(--color-muted)]">
{`method: POST
path: ${
  mode === "image"
    ? "/v1/images/generations"
    : protocol === "claude"
      ? "/v1/messages"
      : protocol === "responses"
        ? "/v1/responses"
        : "/v1/chat/completions"
}
model: ${model}
channel: ${forcedChannel || "auto (weighted)"}
stream: false
body: ${
  mode === "image"
    ? JSON.stringify({ model, prompt: input.slice(0, 60), n: 1, size: "1024x1024" }, null, 2)
    : protocol === "claude"
      ? JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: input.slice(0, 60) }], stream: false }, null, 2)
      : protocol === "responses"
        ? JSON.stringify({ model, input: input.slice(0, 60), stream: false }, null, 2)
        : JSON.stringify({ model, messages: [{ role: "user", content: input.slice(0, 60) }], stream: false }, null, 2)
}`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
