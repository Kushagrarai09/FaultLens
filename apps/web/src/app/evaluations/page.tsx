"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type PromptVersion = { id: string; version: number; template: string; created_at: string };
type Prompt = { id: string; name: string; model: string; versions: PromptVersion[] };
type Dataset = { id: string; name: string; description: string; caseCount: number; cases: EvalCase[] };
type ResultSummary = {
  promptVersionId: string; promptName: string; version: number; model: string;
  totalCases: number; successfulCases: number; failedCases: number;
  averageScore: number | null; averageLatencyMs: number | null;
  totalInputTokens: number | null; totalOutputTokens: number | null;
};
type Evaluation = {
  id: string; status: string; completedCases: number; failedCases: number;
  scoreMethod: string; summary: ResultSummary[];
  results: Array<{ promptVersionId: string; promptName: string; version: number; model: string; caseId: string; status: string; score: number | null; durationMs: number; errorCode: string | null }>;
};

const inputClass = "mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400";
const buttonClass = "rounded-lg bg-violet-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-violet-300 disabled:opacity-50";
const cardClass = "rounded-2xl border border-slate-800 bg-slate-900/70 p-5";
const format = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const ms = (value: number | null | undefined) => value == null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;

export default function EvaluationsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [promptName, setPromptName] = useState("Support assistant");
  const [model, setModel] = useState("qwen2.5:3b");
  const [template, setTemplate] = useState("You are a helpful support assistant. Answer clearly and accurately.\n\nUser question: {{input}}");
  const [versionTemplates, setVersionTemplates] = useState<Record<string, string>>({});
  const [datasetName, setDatasetName] = useState("Starter evaluation set");
  const [datasetDescription, setDatasetDescription] = useState("Small repeatable prompt smoke test.");
  const [caseText, setCaseText] = useState("What is an API? || An API lets software systems communicate.\nExplain caching briefly. || Caching stores data temporarily so it can be reused faster.");
  const [datasetId, setDatasetId] = useState("");
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [promptResponse, datasetResponse] = await Promise.all([
        fetch("/api/prompts", { cache: "no-store" }),
        fetch("/api/datasets", { cache: "no-store" }),
      ]);
      const [promptPayload, datasetPayload] = await Promise.all([promptResponse.json(), datasetResponse.json()]);
      if (!promptResponse.ok) throw new Error(promptPayload.message ?? "Could not load prompts.");
      if (!datasetResponse.ok) throw new Error(datasetPayload.message ?? "Could not load datasets.");
      const nextPrompts = (promptPayload.data ?? []) as Prompt[];
      const nextDatasets = (datasetPayload.data ?? []) as Dataset[];
      setPrompts(nextPrompts); setDatasets(nextDatasets);
      setDatasetId(current => current || nextDatasets[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to FaultLens.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function postJson(path: string, body: unknown) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? "Request failed.");
    return payload;
  }

  async function createPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const saved = await postJson("/api/prompts", { name: promptName, model, template });
      setSelectedVersions(current => [...current, saved.versions[0].id]);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create prompt."); }
    finally { setBusy(false); }
  }

  async function createVersion(prompt: Prompt) {
    const nextTemplate = versionTemplates[prompt.id]?.trim();
    if (!nextTemplate) { setError("Enter a prompt template before creating a version."); return; }
    setBusy(true); setError("");
    try {
      const saved = await postJson(`/api/prompts/${prompt.id}/versions`, { template: nextTemplate });
      setSelectedVersions(current => current.includes(saved.id) ? current : [...current, saved.id]);
      setVersionTemplates(current => ({ ...current, [prompt.id]: "" }));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create version."); }
    finally { setBusy(false); }
  }

  async function createDataset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const cases = caseText.split("\n").map(line => line.trim()).filter(Boolean).map((line, index) => {
        const separator = line.indexOf("||");
        if (separator < 1 || !line.slice(separator + 2).trim()) throw new Error(`Line ${index + 1} must use: input || expected output`);
        return { input: line.slice(0, separator).trim(), expectedOutput: line.slice(separator + 2).trim() };
      });
      const saved = await postJson("/api/datasets", { name: datasetName, description: datasetDescription, cases });
      setDatasetId(saved.id); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create dataset."); }
    finally { setBusy(false); }
  }

  async function runComparison() {
    if (!datasetId || selectedVersions.length < 2) { setError("Select a dataset and at least two prompt versions."); return; }
    setBusy(true); setError(""); setEvaluation(null);
    try {
      const result = await postJson("/api/evaluations", { datasetId, promptVersionIds: selectedVersions.slice(0, 4) });
      setEvaluation(result as Evaluation);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Evaluation failed."); }
    finally { setBusy(false); }
  }

  function toggleVersion(id: string) {
    setSelectedVersions(current => current.includes(id) ? current.filter(value => value !== id) : current.length >= 4 ? current : [...current, id]);
  }

  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-6">
        <div><Link href="/" className="text-sm text-violet-300 hover:text-violet-200">← Back to overview</Link><p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-violet-300">FaultLens · Phase 5</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Prompt evaluation</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Create immutable prompt versions, test them against the same examples, and compare a transparent baseline score with latency and token usage.</p></div>
        <button className={buttonClass} onClick={() => void load()} disabled={loading || busy}>↻ Refresh</button>
      </header>

      <div className="mb-6 rounded-xl border border-amber-900/70 bg-amber-950/30 p-4 text-sm leading-6 text-amber-100/90"><strong>Evaluation score is a heuristic.</strong> It measures case-insensitive word overlap with your expected output. It is not semantic correctness or factuality. Review outputs yourself. Prompt templates and dataset examples are stored; generated response text is not.</div>
      {error && <div role="alert" className="mb-6 rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200"><strong>Something needs attention</strong><p className="mt-1">{error}</p></div>}
      {loading ? <div className={cardClass}>Loading prompts and datasets…</div> : <div className="grid gap-6 xl:grid-cols-2">
        <section className={cardClass}>
          <h2 className="text-xl font-semibold">1. Create a prompt</h2><p className="mt-2 text-sm text-slate-400">A prompt is created as version 1. Use <code className="text-violet-300">{"{{input}}"}</code> where each test input should be inserted.</p>
          <form className="mt-5 space-y-4" onSubmit={createPrompt}>
            <label className="block text-sm text-slate-300">Prompt name<input className={inputClass} value={promptName} onChange={e => setPromptName(e.target.value)} maxLength={120} required /></label>
            <label className="block text-sm text-slate-300">Ollama model<input className={inputClass} value={model} onChange={e => setModel(e.target.value)} maxLength={160} required /></label>
            <label className="block text-sm text-slate-300">Prompt template<textarea className={inputClass} rows={4} value={template} onChange={e => setTemplate(e.target.value)} maxLength={12000} required /></label>
            <button className={buttonClass} disabled={busy}>Save prompt v1</button>
          </form>
        </section>

        <section className={cardClass}>
          <h2 className="text-xl font-semibold">2. Create a dataset</h2><p className="mt-2 text-sm text-slate-400">One test case per line. Use <code className="text-violet-300">input || expected output</code>. Start with 2–5 short cases.</p>
          <form className="mt-5 space-y-4" onSubmit={createDataset}>
            <label className="block text-sm text-slate-300">Dataset name<input className={inputClass} value={datasetName} onChange={e => setDatasetName(e.target.value)} maxLength={120} required /></label>
            <label className="block text-sm text-slate-300">Description<input className={inputClass} value={datasetDescription} onChange={e => setDatasetDescription(e.target.value)} maxLength={500} /></label>
            <label className="block text-sm text-slate-300">Test cases<textarea className={inputClass} rows={5} value={caseText} onChange={e => setCaseText(e.target.value)} required /></label>
            <button className={buttonClass} disabled={busy}>Save dataset</button>
          </form>
        </section>

        <section className={`${cardClass} xl:col-span-2`}>
          <h2 className="text-xl font-semibold">3. Version history</h2><p className="mt-2 text-sm text-slate-400">Versions are immutable. Add a new version rather than overwriting an existing prompt.</p>
          {prompts.length === 0 ? <p className="mt-4 text-sm text-slate-500">No prompts yet. Create one above.</p> : <div className="mt-5 grid gap-4 lg:grid-cols-2">{prompts.map(prompt => <article key={prompt.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{prompt.name}</h3><p className="mt-1 text-xs text-slate-500">{prompt.model}</p></div><span className="text-xs text-slate-500">{prompt.versions.length} version(s)</span></div>
            <div className="mt-4 space-y-3">{prompt.versions.map(version => <label key={version.id} className="flex cursor-pointer gap-3 rounded-lg border border-slate-800 p-3 hover:border-violet-700"><input type="checkbox" className="mt-1 accent-violet-400" checked={selectedVersions.includes(version.id)} onChange={() => toggleVersion(version.id)} disabled={!selectedVersions.includes(version.id) && selectedVersions.length >= 4} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-sm font-medium">Version {version.version}<span className="text-xs text-slate-500">Compare</span></span><span className="mt-2 block whitespace-pre-wrap break-words text-xs leading-5 text-slate-400">{version.template}</span><span className="mt-2 block break-all text-[10px] text-slate-600">{version.id}</span></span></label>)}</div>
            <div className="mt-4 border-t border-slate-800 pt-4"><label className="block text-xs text-slate-400">New version template<textarea className={inputClass} rows={3} value={versionTemplates[prompt.id] ?? ""} onChange={e => setVersionTemplates(current => ({ ...current, [prompt.id]: e.target.value }))} placeholder="Write an improved version using {{input}}…" /></label><button className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-violet-400 disabled:opacity-50" onClick={() => void createVersion(prompt)} disabled={busy || !(versionTemplates[prompt.id] ?? "").trim()}>+ Add version</button></div>
          </article>)}</div>}
        </section>

        <section className={`${cardClass} xl:col-span-2`}>
          <h2 className="text-xl font-semibold">4. Run a fair comparison</h2><p className="mt-2 text-sm text-slate-400">The same dataset is sent to each selected version&apos;s configured Ollama model, one case at a time. Choose 2–4 versions.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="block text-sm text-slate-300">Evaluation dataset<select className={inputClass} value={datasetId} onChange={e => setDatasetId(e.target.value)}><option value="">Select dataset…</option>{datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.name} ({dataset.caseCount} cases)</option>)}</select></label><button className={buttonClass} onClick={() => void runComparison()} disabled={busy || !datasetId || selectedVersions.length < 2}>{busy ? "Running evaluation…" : `Run comparison (${selectedVersions.length}/4)`}</button></div>
          {datasets.length === 0 && <p className="mt-3 text-sm text-amber-300">Create a dataset above before running an evaluation.</p>}
          {selectedVersions.length < 2 && <p className="mt-3 text-xs text-slate-500">Select at least two prompt versions from the version history.</p>}
          {evaluation && <div className="mt-7">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">Comparison results</h3><p className="mt-1 text-xs text-slate-500">Run ID: {evaluation.id}</p></div><span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide">{evaluation.status}</span></div>
            <p className="mb-4 text-sm text-slate-400">{evaluation.completedCases} successful calls · {evaluation.failedCases} failed calls. {evaluation.scoreMethod}</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{evaluation.summary.map(item => <article key={item.promptVersionId} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><p className="text-xs text-violet-300">{item.promptName} · v{item.version}</p><p className="mt-3 text-3xl font-semibold">{item.averageScore === null ? "—" : `${format(item.averageScore)}%`}</p><p className="mt-1 text-xs text-slate-500">Average overlap score</p><div className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs text-slate-400"><div className="flex justify-between gap-2"><span>Successful / failed</span><strong>{item.successfulCases} / {item.failedCases}</strong></div><div className="flex justify-between gap-2"><span>Average latency</span><strong>{ms(item.averageLatencyMs)}</strong></div><div className="flex justify-between gap-2"><span>Input tokens</span><strong>{format(item.totalInputTokens)}</strong></div><div className="flex justify-between gap-2"><span>Output tokens</span><strong>{format(item.totalOutputTokens)}</strong></div></div></article>)}</div>
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Prompt version</th><th className="px-4 py-3">Case</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Latency</th><th className="px-4 py-3">Error</th></tr></thead><tbody>{evaluation.results.map((result, index) => <tr key={`${result.promptVersionId}:${result.caseId}:${index}`} className="border-t border-slate-800 text-slate-300"><td className="px-4 py-3">{result.promptName} v{result.version}</td><td className="px-4 py-3 font-mono text-xs">{result.caseId.slice(0, 8)}</td><td className="px-4 py-3">{result.status}</td><td className="px-4 py-3">{result.score === null ? "—" : `${format(result.score)}%`}</td><td className="px-4 py-3">{ms(result.durationMs)}</td><td className="px-4 py-3 text-xs text-rose-300">{result.errorCode ?? "—"}</td></tr>)}</tbody></table></div>
          </div>}
        </section>
      </div>}
      <footer className="mt-8 border-t border-slate-800 pt-4 text-xs text-slate-600">FaultLens · Prompt templates and evaluation datasets are stored intentionally. Generated responses are scored in memory and not persisted.</footer>
    </div>
  </main>;
}
