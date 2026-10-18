"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

type RunStatus = "success" | "failure";
type AiRun = {
  id: string; provider: string; model: string; status: RunStatus; durationMs: number;
  inputTokens: number | null; outputTokens: number | null; errorCode: string | null;
  startedAt: string; createdAt: string;
};
type RunsResponse = { data: AiRun[]; pagination: { limit: number; offset: number } };
const number = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
const duration = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${number(n)} ms`;
const date = (s: string) => new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(s));

export default function Home() {
  const [runs, setRuns] = useState<AiRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | RunStatus>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [model, setModel] = useState("qwen2.5:3b");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedResponse, setGeneratedResponse] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [lastGeneration, setLastGeneration] = useState<{ durationMs: number; inputTokens: number | null; outputTokens: number | null; id: string } | null>(null);

  const loadRuns = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/runs?limit=50&offset=0", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not load AI runs.");
      setRuns((payload as RunsResponse).data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to FaultLens API.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRuns(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRuns]);

  const visibleRuns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((r) => (filter === "all" || r.status === filter) &&
      (!q || [r.provider, r.model, r.id, r.errorCode ?? ""].join(" ").toLowerCase().includes(q)));
  }, [runs, filter, search]);

  const metrics = useMemo(() => {
    const successful = runs.filter((r) => r.status === "success").length;
    const failed = runs.length - successful;
    const knownInputTokens = runs.some((r) => r.inputTokens !== null);
    const knownOutputTokens = runs.some((r) => r.outputTokens !== null);
    const totalTokens = runs.reduce((sum, r) => sum + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0);
    return {
      total: runs.length, successful, failed,
      rate: runs.length ? Math.round(successful / runs.length * 100) : 0,
      latency: runs.length ? runs.reduce((sum, r) => sum + r.durationMs, 0) / runs.length : 0,
      totalTokens: knownInputTokens || knownOutputTokens ? totalTokens : null,
    };
  }, [runs]);

  async function generateWithOllama(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenerating(true);
    setGenerationError("");
    setGeneratedResponse("");
    setLastGeneration(null);
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Generation failed.");
      setGeneratedResponse(payload.response);
      setLastGeneration({
        durationMs: payload.run.durationMs,
        inputTokens: payload.run.inputTokens,
        outputTokens: payload.run.outputTokens,
        id: payload.run.id,
      });
      setPrompt("");
      await loadRuns(true);
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : "Could not generate a response.");
      await loadRuns(true);
    } finally {
      setGenerating(false);
    }
  }

  async function createDemoRun() {
    setCreating(true);
    setError("");
    const failed = Math.random() < 0.18;
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "demo-provider", model: "demo-chat-model", status: failed ? "failure" : "success",
          durationMs: Math.floor(180 + Math.random() * 1800),
          inputTokens: Math.floor(80 + Math.random() * 500),
          outputTokens: Math.floor(30 + Math.random() * 700),
          errorCode: failed ? "DEMO_UPSTREAM_TIMEOUT" : null,
          startedAt: new Date().toISOString(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not create demo run.");
      await loadRuns(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create demo run.");
    } finally {
      setCreating(false);
    }
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark">F</span><span>fault<span className="brand-light">lens</span></span></Link>
      <div className="section-label">WORKSPACE</div>
      <div className="workspace"><span className="workspace-avatar">D</span><span><strong>Demo workspace</strong><small>Personal project</small></span><span className="chevron">⌄</span></div>
      <div className="section-label nav-label">OBSERVABILITY</div>
      <nav className="navigation" aria-label="Main navigation">
        <a className="nav-item active" href="#overview"><span className="nav-icon">◫</span>Overview</a>
        <a className="nav-item" href="#runs"><span className="nav-icon">≋</span>AI runs<span className="nav-count">{runs.length}</span></a>
        <Link className="nav-item" href="/evaluations"><span className="nav-icon">⌁</span>Prompt evaluations<span className="nav-count">NEW</span></Link>
        <Link className="nav-item" href="/analytics"><span className="nav-icon">◷</span>Cost &amp; performance</Link>
        <Link className="nav-item" href="/alerts"><span className="nav-icon">⚑</span>Reliability alerts<span className="nav-count">NEW</span></Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-card"><span className="privacy-icon">⌑</span><strong>Privacy by default</strong><p>Run metadata only. Prompts and responses are not stored in AI run history.</p><p>Prompt templates and evaluation cases are stored for comparison.</p></div>
        <div className="profile"><span className="user-avatar">K</span><span><strong>Kushagra Rai</strong><small>Local developer</small></span></div>
      </div>
    </aside>

    <section className="main-content" id="overview">
      <div className="content-wrap">
        <header className="topbar"><div><p className="eyebrow">AI OBSERVABILITY / OVERVIEW</p><h1>Run health at a glance<span>.</span></h1><p className="subtitle">Track requests, troubleshoot failures, and compare prompt versions.</p></div><button className="secondary-button" onClick={() => void loadRuns(true)} disabled={refreshing}>{refreshing ? "Refreshing…" : "↻ Refresh"}</button></header>
        {error && <div role="alert" className="error-banner"><strong>Could not load or create run</strong><p>{error}</p></div>}

        <section className="panel mb-6" aria-labelledby="playground-title">
          <div className="panel-heading">
            <div><h2 id="playground-title">Ollama playground</h2><p>Send a real prompt to a local model and inspect the recorded metadata.</p></div>
            <span className="database-pill"><i />REAL GENERATION</span>
          </div>
          <form className="mt-5 space-y-4" onSubmit={generateWithOllama}>
            <label className="block text-sm text-slate-300">Model
              <input className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400" value={model} onChange={(event) => setModel(event.target.value)} maxLength={160} required />
            </label>
            <label className="block text-sm text-slate-300">Prompt
              <textarea className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={12000} rows={4} placeholder="Ask the local model something…" required />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button className="primary-button" disabled={generating || !prompt.trim() || !model.trim()}>{generating ? "Generating…" : "Run prompt"}</button>
              <span className="text-xs text-slate-500">Raw prompts and outputs are returned to the browser but not stored in run history.</span>
            </div>
          </form>
          {generationError && <div role="alert" className="mt-4 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-200"><strong>Generation failed</strong><p className="mt-1">{generationError}</p><p className="mt-1 text-xs text-rose-300/80">Check that Ollama is running, the selected model is installed, and the API can reach it.</p></div>}
          {generatedResponse && <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Model response</h3>{lastGeneration && <span className="text-xs text-slate-400">{duration(lastGeneration.durationMs)} · {lastGeneration.inputTokens === null ? "input tokens unknown" : number(lastGeneration.inputTokens)} in · {lastGeneration.outputTokens === null ? "output tokens unknown" : number(lastGeneration.outputTokens)} out</span>}</div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{generatedResponse}</p>
            {lastGeneration && <p className="mt-3 break-all text-xs text-slate-500">Run ID: {lastGeneration.id}</p>}
          </div>}
        </section>

        <section className="metrics-grid" aria-label="Run summary">
          <Metric title="AI runs" value={loading ? "—" : number(metrics.total)} icon="↗" tone="violet" caption="RECORDED REQUESTS" note="Latest 50 loaded" progress={Math.min(100, metrics.total * 2)}/>
          <Metric title="Success rate" value={loading ? "—" : `${metrics.rate}%`} icon="✓" tone="green" caption="SUCCESSFUL" note={`${number(metrics.successful)} runs`} progress={metrics.rate}/>
          <Metric title="Average latency" value={loading ? "—" : duration(metrics.latency)} icon="◷" tone="blue" caption="RESPONSE TIME" note="Latest 50 loaded" progress={Math.min(100, metrics.latency / 30)}/>
          <Metric title="Token volume" value={loading || metrics.totalTokens === null ? "—" : number(metrics.totalTokens)} icon="⌘" tone="orange" caption="INPUT + OUTPUT" note={metrics.totalTokens === null ? "No usage reported" : "Known token counts"} progress={Math.min(100, (metrics.totalTokens ?? 0) / 100)}/>
        </section>

        <section className="insights-grid">
          <article className="panel"><div className="panel-heading"><div><h2>Run activity</h2><p>Latest recorded AI requests</p></div><span className="database-pill"><i />DATABASE</span></div>
            <div className="activity-summary"><div><strong>{loading ? "—" : metrics.total}</strong><small>RUNS LOADED</small></div><i/><div><strong className="success-text">{loading ? "—" : metrics.successful}</strong><small>SUCCEEDED</small></div><i/><div><strong className="failure-text">{loading ? "—" : metrics.failed}</strong><small>FAILED</small></div></div>
            <div className="activity-note"><i/>Metrics use the latest 50 records, not the entire database.</div>
          </article>
          <article className="panel"><div className="panel-heading"><div><h2>Reliability snapshot</h2><p>Recent run outcomes</p></div><span className="snapshot-icon">⌁</span></div>
            <div className="reliability"><div className="donut" style={{ "--angle": `${metrics.rate * 3.6}deg` } as CSSProperties}><div><strong>{loading ? "—" : `${metrics.rate}%`}</strong><small>SUCCESS</small></div></div>
              <div className="legend"><div><i className="good-dot"/><span>Successful</span><b>{loading ? "—" : metrics.successful}</b></div><div><i className="bad-dot"/><span>Failed</span><b>{loading ? "—" : metrics.failed}</b></div></div></div>
            <div className="health-footer"><span className={metrics.failed ? "failure-text" : "success-text"}>● {metrics.failed ? "Failures detected" : "No recent failures"}</span><span>{loading ? "Loading…" : `${metrics.total} total`}</span></div>
          </article>
        </section>

        <section className="panel runs-panel" id="runs">
          <div className="runs-heading"><div><h2>Recent AI runs</h2><p>Inspect individual requests and their outcomes.</p></div><button className="secondary-button" onClick={() => void loadRuns(true)} disabled={refreshing}><span className={refreshing ? "spin" : ""}>↻</span>Refresh</button></div>
          <div className="table-toolbar"><label className="search"><span>⌕</span><input aria-label="Search runs" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search provider, model, ID…"/></label>
            <div className="filters">{(["all", "success", "failure"] as const).map(s => <button key={s} className={filter === s ? "filter active-filter" : "filter"} onClick={() => setFilter(s)}>{s === "all" ? "All runs" : s === "success" ? "Successful" : "Failed"}</button>)}</div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>STATUS</th><th>MODEL / PROVIDER</th><th>DURATION</th><th>TOKENS</th><th>STARTED</th><th>RUN ID</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6}><div className="table-state"><i className="loader" />Loading run history…</div></td></tr>
                ) : visibleRuns.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        <span>≋</span><strong>{runs.length ? "No matching runs" : "No AI runs yet"}</strong>
                        <p>{runs.length ? "Try another search term or status filter." : "Create a demo run to send your first synthetic record through the API."}</p>
                        {!runs.length && <button className="primary-button" onClick={createDemoRun} disabled={creating}>+ Create demo run</button>}
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleRuns.map((r) => (
                    <tr key={r.id}>
                      <td><span className={r.status === "success" ? "badge succeeded" : "badge failed"}><i />{r.status === "success" ? "Success" : "Failed"}</span></td>
                      <td><div className="model-cell"><span className="model-avatar">{r.provider.slice(0, 1).toUpperCase()}</span><span><strong>{r.model}</strong><small>{r.provider}</small></span></div></td>
                      <td>{duration(r.durationMs)}</td>
                      <td><span className="token-cell">{r.inputTokens === null && r.outputTokens === null ? "—" : number((r.inputTokens ?? 0) + (r.outputTokens ?? 0))}</span><small className="sub-cell">{r.inputTokens === null ? "—" : number(r.inputTokens)} in · {r.outputTokens === null ? "—" : number(r.outputTokens)} out</small></td>
                      <td>{date(r.startedAt)}</td>
                      <td><span className="run-id" title={r.id}>{r.id.slice(0, 8)}…</span>{r.errorCode && <small className="error-code">{r.errorCode}</small>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer"><span>{loading ? "Fetching records…" : `Showing ${visibleRuns.length} of ${runs.length} loaded runs`}</span><span>Newest first <i>·</i> Auto-refresh is off</span></div>
        </section>
        <footer className="page-footer"><span>© 2026 FaultLens <i>·</i> Built for dependable AI systems</span><span><i/> API-driven dashboard <i>·</i> Phase 2</span></footer>
      </div>
    </section>
  </main>;
}

function Metric({ title, value, icon, tone, caption, note, progress }: { title: string; value: string; icon: string; tone: string; caption: string; note: string; progress: number }) {
  return <article className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value">{value}</div><div className="metric-foot"><span className={tone === "green" ? "metric-good" : "metric-caption"}>{caption}</span><span>{note}</span></div><div className={`metric-bar ${tone}-bar`}><span style={{ width: `${progress}%` }}/></div></article>;
}
