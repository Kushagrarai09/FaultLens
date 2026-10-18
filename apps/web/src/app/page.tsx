"use client";

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
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/runs?limit=50&offset=0", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not load AI runs.");
      setRuns((payload as RunsResponse).data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to FaultLens API.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  const visibleRuns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter(r => (filter === "all" || r.status === filter) &&
      (!q || [r.provider, r.model, r.id, r.errorCode ?? ""].join(" ").toLowerCase().includes(q)));
  }, [runs, filter, search]);

  const metrics = useMemo(() => {
    const successful = runs.filter(r => r.status === "success").length;
    const totalTokens = runs.reduce((sum, r) => sum + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0);
    return { total: runs.length, successful, failed: runs.length - successful,
      rate: runs.length ? Math.round(successful / runs.length * 100) : 0,
      latency: runs.length ? runs.reduce((sum, r) => sum + r.durationMs, 0) / runs.length : 0, totalTokens };
  }, [runs]);

  async function generateWithOllama(event: FormEvent<HTMLFormElement>) {\n    event.preventDefault();\n    setGenerating(true); setGenerationError(""); setGeneratedResponse(""); setLastGeneration(null);\n    try {\n      const response = await fetch("/api/ai/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt }) });\n      const payload = await response.json();\n      if (!response.ok) throw new Error(payload.message ?? "Generation failed.");\n      setGeneratedResponse(payload.response);\n      setLastGeneration({ durationMs: payload.run.durationMs, inputTokens: payload.run.inputTokens, outputTokens: payload.run.outputTokens, id: payload.run.id });\n      setPrompt("");\n      await loadRuns(true);\n    } catch (e) { setGenerationError(e instanceof Error ? e.message : "Could not generate a response."); await loadRuns(true); }\n    finally { setGenerating(false); }\n  }\n\n  async function createDemoRun() {
    setCreating(true); setError("");
    const failed = Math.random() < 0.18;
    try {
      const response = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "demo-provider", model: "demo-chat-model", status: failed ? "failure" : "success",
          durationMs: Math.floor(180 + Math.random() * 1800), inputTokens: Math.floor(80 + Math.random() * 500),
          outputTokens: Math.floor(30 + Math.random() * 700), errorCode: failed ? "DEMO_UPSTREAM_TIMEOUT" : null,
          startedAt: new Date().toISOString() }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not create demo run.");
      await loadRuns(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create demo run."); }
    finally { setCreating(false); }
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark">F</span><span>fault<span className="brand-light">lens</span></span></a>
      <div className="section-label">WORKSPACE</div>
      <div className="workspace"><span className="workspace-avatar">D</span><span><strong>Demo workspace</strong><small>Personal project</small></span><span className="chevron">⌄</span></div>
      <div className="section-label nav-label">OBSERVABILITY</div>
      <nav className="navigation" aria-label="Main navigation">
        <a className="nav-item active" href="#overview"><span className="nav-icon">◫</span>Overview</a>
        <a className="nav-item" href="#runs"><span className="nav-icon">≋</span>AI runs<span className="nav-count">{runs.length}</span></a>
        <a className="nav-item" href="/evaluations"><span className="nav-icon">⌁</span>Prompt evaluations<span className="nav-count">NEW</span></a>
        <span className="nav-item disabled"><span className="nav-icon">◷</span>Cost analytics<span className="soon">SOON</span></span>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-card"><span className="privacy-icon">⌑</span><strong>Privacy by default</strong><p>Run metadata only. Prompts and responses are not stored.</p></div>
        <div className="profile"><span className="user-avatar">K</span><span><strong>Developer</strong><small>Free workspace</small></span><span className="profile-menu">···</span></div>
      </div>
    </aside>
    <section className="main-panel" id="overview">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="slash">/</span><strong>Overview</strong></div>
        <div className="top-actions"><span className="environment"><i />LOCAL ENVIRONMENT</span><button className="icon-button" onClick={() => void loadRuns(true)} disabled={refreshing} aria-label="Refresh">↻</button><span className="top-avatar">K</span></div>
      </header>
      <div className="content">
        <section className="page-heading"><div><div className="eyebrow"><i />AI OBSERVABILITY</div><h1>Overview<span>.</span></h1><p>A clear view of your AI application&apos;s reliability and performance.</p></div>
          <div className="heading-actions"><span className="muted-note">Showing latest 50 runs</span><button className="primary-button" onClick={createDemoRun} disabled={creating}><b>{creating ? "…" : "+"}</b>{creating ? "Creating run…" : "Create demo run"}</button></div>
        </section>
        {error && <div className="alert" role="alert"><span className="alert-mark">!</span><div><strong>Data connection issue</strong><p>{error}</p><small>Check PostgreSQL, the Phase 1 migration, and that the API is running on port 3001.</small></div><button onClick={() => void loadRuns(true)}>Try again</button></div>}
        <section className="panel playground-panel" id="playground">
          <div className="panel-heading"><div><div className="eyebrow"><i />LOCAL MODEL PLAYGROUND</div><h2>Run a real AI request</h2><p>Generate with Ollama and capture timing and token metadata.</p></div><span className="database-pill"><i />METADATA ONLY</span></div>
          <form className="playground-form" onSubmit={generateWithOllama}>
            <label className="field-label">Ollama model<input value={model} onChange={e => setModel(e.target.value)} maxLength={160} required placeholder="qwen2.5:3b" /></label>
            <label className="field-label">Prompt<textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={12000} required rows={3} placeholder="Ask your local model something… (up to 12,000 characters)" /></label>
            <div className="playground-actions"><span>Prompt and response are not stored by FaultLens.</span><button className="primary-button" type="submit" disabled={generating || !prompt.trim() || !model.trim()}><b>{generating ? "…" : "▶"}</b>{generating ? "Generating (up to 60s)…" : "Generate response"}</button></div>
          </form>
          {generationError && <div className="generation-error" role="alert"><strong>Generation failed</strong><p>{generationError}</p><small>Confirm Ollama is running and the model is installed with <code>ollama list</code>.</small></div>}
          {generatedResponse && <div className="generation-result"><div className="result-heading"><strong>Model response</strong><span className="badge succeeded"><i/>Recorded</span></div><p>{generatedResponse}</p>{lastGeneration && <div className="result-meta"><span>{duration(lastGeneration.durationMs)}</span><span>{number(lastGeneration.inputTokens ?? 0)} input tokens</span><span>{number(lastGeneration.outputTokens ?? 0)} output tokens</span><span title={lastGeneration.id}>Run {lastGeneration.id.slice(0,8)}…</span></div>}</div>}
        </section>
        <section className="metrics-grid" aria-label="Recent run metrics">
          <Metric title="Total runs" value={loading ? "—" : number(metrics.total)} icon="↗" tone="purple" caption="RECENT ACTIVITY" note="Last 50 records" progress={runs.length ? 100 : 0}/>
          <Metric title="Success rate" value={loading ? "—" : `${metrics.rate}%`} icon="✓" tone="green" caption="● SUCCESSFUL" note={`${number(metrics.successful)} runs`} progress={metrics.rate}/>
          <Metric title="Avg. latency" value={loading ? "—" : duration(metrics.latency)} icon="◷" tone="blue" caption="RESPONSE TIME" note="Mean duration" progress={Math.min(100, metrics.latency / 30)}/>
          <Metric title="Token volume" value={loading ? "—" : number(metrics.totalTokens)} icon="⌘" tone="orange" caption="INPUT + OUTPUT" note="Known token counts" progress={Math.min(100, metrics.totalTokens / 100)}/>
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
          <div className="table-scroll"><table><thead><tr><th>STATUS</th><th>MODEL / PROVIDER</th><th>DURATION</th><th>TOKENS</th><th>STARTED</th><th>RUN ID</th></tr></thead><tbody>
            {loading ? <tr><td colSpan={6}><div className="table-state"><i className="loader"/>Loading run history…</div></td> : visibleRuns.length === 0 ?
              <tr><td colSpan={6}><div className="empty-state"><span>≋</span><strong>{runs.length ? "No matching runs" : "No AI runs yet"}</strong><p>{runs.length ? "Try another search term or status filter." : "Create a demo run to send your first synthetic record through the API."}</p>{!runs.length && <button className="primary-button" onClick={createDemoRun} disabled={creating}>+ Create demo run</button>}</div></td></tr> :
              visibleRuns.map(r => <tr key={r.id}><td><span className={r.status === "success" ? "badge succeeded" : "badge failed"}><i/>{r.status === "success" ? "Success" : "Failed"}</span></td>
                <td><div className="model-cell"><span className="model-avatar">{r.provider.slice(0,1).toUpperCase()}</span><span><strong>{r.model}</strong><small>{r.provider}</small></span></div></td>
                <td>{duration(r.durationMs)}</td><td><span className="token-cell">{number((r.inputTokens ?? 0) + (r.outputTokens ?? 0))}</span><small className="sub-cell">{number(r.inputTokens ?? 0)} in · {number(r.outputTokens ?? 0)} out</small></td>
                <td>{date(r.startedAt)}</td><td><span className="run-id" title={r.id}>{r.id.slice(0,8)}…</span>{r.errorCode && <small className="error-code">{r.errorCode}</small>}</td></tr>)}
          </tbody></table></div>
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
