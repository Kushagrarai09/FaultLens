"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Metric = "failure_rate_percent" | "p95_latency_ms" | "failed_runs";
type Rule = { id: string; name: string; metric: Metric; threshold: number; windowMinutes: number; enabled: boolean; createdAt: string };
type AlertResult = { rule: Rule; status: "triggered" | "normal" | "insufficient_data"; observedValue: number | null; sampleCount: number; failedRuns: number; evaluatedAt: string; message: string };
const input = "mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400";
const button = "rounded-lg bg-violet-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-violet-300 disabled:opacity-50";
const panel = "rounded-2xl border border-slate-800 bg-slate-900/70 p-5";
const metricName: Record<Metric, string> = { failure_rate_percent: "Failure rate (%)", p95_latency_ms: "P95 latency (ms)", failed_runs: "Failed runs" };
const showValue = (metric: Metric, value: number | null) => value === null ? "—" : metric === "failure_rate_percent" ? `${value.toFixed(2)}%` : metric === "p95_latency_ms" ? `${Math.round(value)} ms` : String(value);

export default function AlertsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [results, setResults] = useState<AlertResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("Elevated failure rate");
  const [metric, setMetric] = useState<Metric>("failure_rate_percent");
  const [threshold, setThreshold] = useState("10");
  const [windowMinutes, setWindowMinutes] = useState("15");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/alerts/rules", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not load alert rules.");
      setRules(payload.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect to FaultLens."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResults(null);
    try {
      const response = await fetch("/api/alerts/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, metric, threshold: Number(threshold), windowMinutes: Number(windowMinutes) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not create alert rule.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create rule."); }
    finally { setBusy(false); }
  }

  async function evaluate() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/alerts/evaluate", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not evaluate rules.");
      setResults(payload.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not evaluate rules."); }
    finally { setBusy(false); }
  }

  async function toggle(rule: Rule) {
    setBusy(true); setError(""); setResults(null);
    try {
      const response = await fetch(`/api/alerts/rules/${rule.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !rule.enabled }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not update rule.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update rule."); }
    finally { setBusy(false); }
  }

  const resultById = new Map((results ?? []).map(item => [item.rule.id, item]));
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-6">
        <div><a href="/" className="text-sm text-violet-300 hover:text-violet-200">← Back to overview</a><p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-violet-300">FaultLens · Phase 6</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Reliability alerts</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Define reliability thresholds and evaluate recent AI-run metadata to identify failure spikes and slow responses.</p></div>
        <div className="flex gap-2"><button className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm hover:border-violet-400" onClick={() => void load()} disabled={loading || busy}>↻ Refresh rules</button><button className={button} onClick={() => void evaluate()} disabled={busy || rules.every(rule => !rule.enabled)}>{busy ? "Working…" : "Evaluate enabled rules"}</button></div>
      </header>
      <div className="mb-6 rounded-xl border border-amber-900/70 bg-amber-950/30 p-4 text-sm leading-6 text-amber-100/90"><strong>On-demand evaluation only.</strong> These rules do not run continuously and do not send email, Slack, or other notifications. No runs in a time window is shown as insufficient data, not as healthy.</div>
      {error && <div role="alert" className="mb-6 rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
        <section className={panel}>
          <h2 className="text-xl font-semibold">Create an alert rule</h2><p className="mt-2 text-sm leading-6 text-slate-400">The rule triggers when the observed metric is greater than or equal to the threshold.</p>
          <form className="mt-5 space-y-4" onSubmit={createRule}>
            <label className="block text-sm text-slate-300">Rule name<input className={input} value={name} onChange={e => setName(e.target.value)} maxLength={120} required /></label>
            <label className="block text-sm text-slate-300">Metric<select className={input} value={metric} onChange={e => setMetric(e.target.value as Metric)}><option value="failure_rate_percent">Failure rate (%)</option><option value="p95_latency_ms">P95 latency (ms)</option><option value="failed_runs">Failed runs</option></select></label>
            <label className="block text-sm text-slate-300">Threshold<input className={input} type="number" min="0.01" max={metric === "failure_rate_percent" ? 100 : metric === "p95_latency_ms" ? 86400000 : 1000000000} step={metric === "failed_runs" ? 1 : "any"} value={threshold} onChange={e => setThreshold(e.target.value)} required /></label>
            <label className="block text-sm text-slate-300">Time window<select className={input} value={windowMinutes} onChange={e => setWindowMinutes(e.target.value)}>{[5,10,15,30,60,120,360,720,1440].map(n => <option key={n} value={n}>{n < 60 ? `${n} minutes` : n === 60 ? "1 hour" : n === 1440 ? "24 hours" : `${n / 60} hours`}</option>)}</select></label>
            <button className={button} disabled={busy}>Create rule</button>
          </form>
          <div className="mt-6 border-t border-slate-800 pt-4"><h3 className="text-sm font-semibold">Suggested starting points</h3><ul className="mt-2 space-y-2 text-xs leading-5 text-slate-400"><li>• Failure rate ≥ 10% over 15 minutes</li><li>• P95 latency ≥ 2,500 ms over 30 minutes</li><li>• At least 3 failed runs over 10 minutes</li></ul></div>
        </section>
        <section className={panel}>
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Configured rules</h2><p className="mt-2 text-sm text-slate-400">{rules.length} rule(s) · up to 100 displayed</p></div><span className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400">{rules.filter(r => r.enabled).length} enabled</span></div>
          {loading ? <p className="mt-6 text-sm text-slate-400">Loading rules…</p> : rules.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-500">No rules yet. Create your first reliability rule.</p> : <div className="mt-5 space-y-3">{rules.map(rule => { const result = resultById.get(rule.id); return <article key={rule.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{rule.name}</h3><p className="mt-1 text-xs text-slate-500">{metricName[rule.metric]} ≥ {rule.threshold} · last {rule.windowMinutes} min</p></div><button className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-violet-400" onClick={() => void toggle(rule)} disabled={busy}>{rule.enabled ? "Disable" : "Enable"}</button></div><div className="mt-3 flex flex-wrap items-center gap-2">{result ? <><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${result.status === "triggered" ? "border-rose-800 bg-rose-950/50 text-rose-300" : result.status === "normal" ? "border-emerald-800 bg-emerald-950/40 text-emerald-300" : "border-amber-800 bg-amber-950/40 text-amber-300"}`}>{result.status.replace("_", " ")}</span><span className="text-xs text-slate-400">Observed: {showValue(rule.metric, result.observedValue)} · {result.sampleCount} run(s)</span></> : <span className="text-xs text-slate-600">Run evaluation to check current status.</span>}</div>{result && <p className="mt-2 text-xs leading-5 text-slate-400">{result.message}</p>}</article>; })}</div>}
          {results?.[0]?.evaluatedAt && <p className="mt-4 text-[11px] text-slate-600">Evaluated at {new Date(results[0].evaluatedAt).toLocaleString()}. Results are a snapshot and are not saved as alert history.</p>}
        </section>
      </div>
      <footer className="mt-8 border-t border-slate-800 pt-4 text-xs leading-5 text-slate-600">FaultLens · Metadata-only alerts. This MVP has no authentication or external notification delivery; do not expose it publicly without adding access controls.</footer>
    </div>
  </main>;
}
