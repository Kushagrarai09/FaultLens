"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ModelAnalytics = {
  provider: string;
  model: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRatePercent: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

type Analytics = {
  generatedAt: string;
  scope: string;
  totals: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRatePercent: number | null;
    failureRatePercent: number | null;
    distinctModels: number;
  };
  latencyMs: { average: number | null; p50: number | null; p95: number | null };
  tokens: {
    input: number | null;
    output: number | null;
    total: number | null;
    runsWithInputTokenData: number;
    runsWithOutputTokenData: number;
  };
  cost: { estimatedUsd: number | null; available: boolean; reason: string };
  byModel: ModelAnalytics[];
};

const integer = (value: number | null) =>
  value === null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(2)}%`;
const ms = (value: number | null) => value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${integer(value)} ms`;

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <article className="rounded-xl border border-slate-700 bg-slate-900/80 p-5 shadow-lg">
    <p className="text-sm text-slate-400">{label}</p>
    <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-100">{value}</p>
    <p className="mt-2 text-xs text-slate-500">{hint}</p>
  </article>;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analytics/summary", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Unable to load analytics.");
      setData(payload as Analytics);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">← Back to overview</Link>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-violet-300">FaultLens · Phase 4</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Usage & performance analytics</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">All-time aggregates from stored run metadata, including latency percentiles and known token usage.</p>
        </div>
        <button onClick={() => void load(true)} disabled={refreshing} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:border-violet-400 disabled:opacity-50">
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </header>

      {error && <section role="alert" className="mb-6 rounded-xl border border-rose-900 bg-rose-950/40 p-4">
        <h2 className="font-semibold text-rose-200">Analytics could not load</h2>
        <p className="mt-2 text-sm text-rose-200/80">{error}</p>
        <p className="mt-2 text-xs text-rose-300/70">Check the API, PostgreSQL connection, and the Phase 1 migration.</p>
        <button onClick={() => void load()} className="mt-3 rounded-md border border-rose-800 px-3 py-1.5 text-sm">Try again</button>
      </section>}

      {loading && !data ? <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center text-slate-400">Loading analytics…</div> : data && <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Scope: all stored runs · not limited to the 50-row dashboard preview</span>
          <span>Updated {new Date(data.generatedAt).toLocaleString()}</span>
        </div>

        <section aria-label="Run totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total runs" value={integer(data.totals.totalRuns)} hint={`${integer(data.totals.distinctModels)} distinct models`} />
          <StatCard label="Success rate" value={percent(data.totals.successRatePercent)} hint={`${integer(data.totals.successfulRuns)} successful runs`} />
          <StatCard label="Failure rate" value={percent(data.totals.failureRatePercent)} hint={`${integer(data.totals.failedRuns)} failed runs`} />
          <StatCard label="P95 latency" value={ms(data.latencyMs.p95)} hint={`P50: ${ms(data.latencyMs.p50)} · Average: ${ms(data.latencyMs.average)}`} />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-semibold">Token usage</h2>
            <p className="mt-1 text-sm text-slate-400">Totals include known values only; missing counts are not assumed to be zero.</p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div><p className="text-xs text-slate-500">Input</p><p className="mt-2 text-2xl font-semibold">{integer(data.tokens.input)}</p><p className="mt-1 text-xs text-slate-500">{integer(data.tokens.runsWithInputTokenData)} runs with data</p></div>
              <div><p className="text-xs text-slate-500">Output</p><p className="mt-2 text-2xl font-semibold">{integer(data.tokens.output)}</p><p className="mt-1 text-xs text-slate-500">{integer(data.tokens.runsWithOutputTokenData)} runs with data</p></div>
              <div><p className="text-xs text-slate-500">Combined</p><p className="mt-2 text-2xl font-semibold">{integer(data.tokens.total)}</p><p className="mt-1 text-xs text-slate-500">Known tokens</p></div>
            </div>
          </article>
          <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-semibold">Estimated cost</h2>
            <p className="mt-1 text-sm text-slate-400">FaultLens does not guess prices.</p>
            <p className="mt-5 text-3xl font-semibold">{data.cost.available && data.cost.estimatedUsd !== null ? `$${data.cost.estimatedUsd.toFixed(4)}` : "Unavailable"}</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">{data.cost.reason}</p>
            <p className="mt-3 text-xs text-amber-300">A missing cost estimate does not mean the request was free.</p>
          </article>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <div className="border-b border-slate-800 p-5"><h2 className="text-lg font-semibold">Performance by model</h2><p className="mt-1 text-sm text-slate-400">Top 20 provider/model groups by request volume.</p></div>
          {data.byModel.length === 0 ? <div className="p-10 text-center"><p className="font-medium">No runs recorded yet</p><p className="mt-2 text-sm text-slate-400">Create a demo run or send a request from the Ollama playground, then refresh this page.</p><a className="mt-4 inline-block text-sm text-violet-300 hover:text-violet-200" href="/">Go to overview →</a></div> :
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-950/60 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Provider / model</th><th className="px-5 py-3">Runs</th><th className="px-5 py-3">Success</th><th className="px-5 py-3">Avg latency</th><th className="px-5 py-3">P95 latency</th><th className="px-5 py-3">Known tokens</th></tr></thead>
              <tbody>{data.byModel.map(item => <tr key={`${item.provider}:${item.model}`} className="border-t border-slate-800 text-slate-300">
                <td className="px-5 py-4"><p className="font-medium text-slate-100">{item.model}</p><p className="mt-1 text-xs text-slate-500">{item.provider}</p></td>
                <td className="px-5 py-4">{integer(item.totalRuns)} <span className="text-xs text-slate-500">({integer(item.failedRuns)} failed)</span></td>
                <td className="px-5 py-4">{percent(item.successRatePercent)}</td>
                <td className="px-5 py-4">{ms(item.averageLatencyMs)}</td>
                <td className="px-5 py-4">{ms(item.p95LatencyMs)}</td>
                <td className="px-5 py-4">{integer(item.inputTokens === null && item.outputTokens === null ? null : (item.inputTokens ?? 0) + (item.outputTokens ?? 0))}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
      </>}

      <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-4 text-xs text-slate-600">
        <span>FaultLens · Metadata only · No raw prompts or responses stored</span><span>Analytics are descriptive, not a guarantee of model quality.</span>
      </footer>
    </div>
  </main>;
}
