"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountMenu } from "@/components/account-menu";

type RunStatus = "success" | "failure";
type AiRun = {
  id: string; provider: string; model: string; status: RunStatus; durationMs: number;
  inputTokens: number | null; outputTokens: number | null; errorCode: string | null;
  startedAt: string; createdAt: string;
};
type RunsResponse = { data: AiRun[]; pagination: { limit: number; offset: number } };

const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
const duration = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${number(value)} ms`;
const date = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export default function RunsPage() {
  const [runs, setRuns] = useState<AiRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | RunStatus>("all");
  const [search, setSearch] = useState("");

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
    const query = search.trim().toLowerCase();
    return runs.filter(run => (filter === "all" || run.status === filter) &&
      (!query || [run.provider, run.model, run.id, run.errorCode ?? ""].join(" ").toLowerCase().includes(query)));
  }, [runs, filter, search]);

  const summary = useMemo(() => ({
    successful: runs.filter(run => run.status === "success").length,
    failed: runs.filter(run => run.status === "failure").length,
    tokens: runs.reduce((total, run) => total + (run.inputTokens ?? 0) + (run.outputTokens ?? 0), 0),
  }), [runs]);

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

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark">F</span><span>fault<span className="brand-light">lens</span></span></Link>
      <div className="section-label">WORKSPACE</div>
      <div className="section-label nav-label">OBSERVABILITY</div>
      <nav className="navigation" aria-label="Main navigation">
        <Link className="nav-item" href="/"><span className="nav-icon">◫</span>Overview</Link>
        <Link className="nav-item active" href="/runs"><span className="nav-icon">≋</span>AI runs<span className="nav-count">{runs.length}</span></Link>
        <Link className="nav-item" href="/evaluations"><span className="nav-icon">⌁</span>Prompt evaluations<span className="nav-count">NEW</span></Link>
        <Link className="nav-item" href="/analytics"><span className="nav-icon">◷</span>Cost &amp; performance</Link>
        <Link className="nav-item" href="/alerts"><span className="nav-icon">⚑</span>Reliability alerts<span className="nav-count">NEW</span></Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-card"><span className="privacy-icon">⌑</span><strong>Privacy by default</strong><p>Run metadata only. Prompts and responses are not stored in AI run history.</p></div>
        <AccountMenu />
      </div>
    </aside>

    <main className="main-panel min-w-0">
      <div className="content max-w-none">
        <header className="page-heading items-start">
          <div><Link href="/" className="text-xs text-slate-500 hover:text-violet-300">← Back to overview</Link><div className="eyebrow mt-4"><i />OBSERVABILITY / AI RUNS</div><h1>AI runs<span>.</span></h1><p>Inspect every recorded request, model outcome, latency, and token count.</p></div>
          <div className="heading-actions"><span className="database-pill"><i />DATABASE</span><button className="secondary-button" onClick={() => void loadRuns(true)} disabled={refreshing}>{refreshing ? "Refreshing…" : "↻ Refresh"}</button></div>
        </header>
        {error && <div role="alert" className="error-banner"><strong>Could not load or create run</strong><p>{error}</p></div>}

        <section className="metrics-grid" aria-label="Run summary">
          <RunMetric label="Total runs" value={runs.length} tone="purple" note="Latest 50 loaded" />
          <RunMetric label="Successful" value={summary.successful} tone="green" note="Completed requests" />
          <RunMetric label="Failed" value={summary.failed} tone="orange" note="Needs investigation" />
          <RunMetric label="Known tokens" value={summary.tokens} tone="blue" note="Input + output" />
        </section>

        <section className="panel runs-panel mt-4">
          <div className="runs-heading"><div><h2>Run history</h2><p>Newest first · search by provider, model, ID, or error code.</p></div><button className="primary-button" onClick={createDemoRun} disabled={creating}>+ {creating ? "Creating…" : "Create demo run"}</button></div>
          <div className="table-toolbar"><label className="search"><span>⌕</span><input aria-label="Search runs" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search provider, model, ID…" /></label><div className="filters">{(["all", "success", "failure"] as const).map(status => <button key={status} className={filter === status ? "filter active-filter" : "filter"} onClick={() => setFilter(status)}>{status === "all" ? "All runs" : status === "success" ? "Successful" : "Failed"}</button>)}</div></div>
          <div className="table-scroll"><table><thead><tr><th>STATUS</th><th>MODEL / PROVIDER</th><th>DURATION</th><th>TOKENS</th><th>STARTED</th><th>RUN ID</th></tr></thead><tbody>
            {loading ? <tr><td colSpan={6}><div className="table-state"><i className="loader" />Loading run history…</div></td></tr> : visibleRuns.length === 0 ? <tr><td colSpan={6}><div className="empty-state"><span>≋</span><strong>{runs.length ? "No matching runs" : "No AI runs yet"}</strong><p>{runs.length ? "Try another search term or status filter." : "Create a demo run to send your first synthetic record through the API."}</p>{!runs.length && <button className="primary-button" onClick={createDemoRun} disabled={creating}>+ Create demo run</button>}</div></td></tr> : visibleRuns.map(run => <tr key={run.id}><td><span className={run.status === "success" ? "badge succeeded" : "badge failed"}><i />{run.status === "success" ? "Success" : "Failed"}</span></td><td><div className="model-cell"><span className="model-avatar">{run.provider.slice(0, 1).toUpperCase()}</span><span><strong>{run.model}</strong><small>{run.provider}</small></span></div></td><td>{duration(run.durationMs)}</td><td><span className="token-cell">{run.inputTokens === null && run.outputTokens === null ? "—" : number((run.inputTokens ?? 0) + (run.outputTokens ?? 0))}</span><small className="sub-cell">{run.inputTokens === null ? "—" : number(run.inputTokens)} in · {run.outputTokens === null ? "—" : number(run.outputTokens)} out</small></td><td>{date(run.startedAt)}</td><td><span className="run-id" title={run.id}>{run.id.slice(0, 8)}…</span>{run.errorCode && <small className="error-code">{run.errorCode}</small>}</td></tr>)}
          </tbody></table></div>
          <div className="table-footer"><span>{loading ? "Fetching records…" : `Showing ${visibleRuns.length} of ${runs.length} loaded runs`}</span><span>Auto-refresh is off</span></div>
        </section>
        <footer className="page-footer"><span>© 2026 FaultLens <i>·</i> Built for dependable AI systems</span><span><i /> API-driven dashboard <i>·</i> Phase 2</span></footer>
      </div>
    </main>
  </div>;
}

function RunMetric({ label, value, tone, note }: { label: string; value: number; tone: string; note: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}>↗</span></div><div className="metric-value">{number(value)}</div><div className="metric-foot"><span className="metric-caption">{note}</span><span>Current view</span></div><div className={`metric-bar ${tone}-bar`}><span style={{ width: `${Math.min(100, value ? 100 : 0)}%` }} /></div></article>;
}
