"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AccountMenu } from "@/components/account-menu";

type PromptVersion = { id: string; version: number; template: string; created_at: string };
type EvalCase = { id: string; input: string; expected_output: string };
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

const workflow = [
  ["1", "Create prompts", "Add prompt templates and versions", "purple"],
  ["2", "Create dataset", "Add test cases with expected outputs", "blue"],
  ["3", "Select & compare", "Choose dataset and prompt versions", "green"],
  ["4", "View results", "Compare score, latency and tokens", "orange"],
] as const;

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

  async function createDataset(event: FormEvent<HTMLFormElement>) {
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

  function promptForVersion(id: string) {
    return prompts.find(prompt => prompt.versions.some(version => version.id === id));
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark">F</span><span>fault<span className="brand-light">lens</span></span></Link>
      <div className="section-label">WORKSPACE</div>
      <div className="section-label nav-label">OBSERVABILITY</div>
      <nav className="navigation" aria-label="Main navigation">
        <Link className="nav-item" href="/"><span className="nav-icon">◫</span>Overview</Link>
        <Link className="nav-item" href="/runs"><span className="nav-icon">≋</span>AI runs</Link>
        <Link className="nav-item active" href="/evaluations"><span className="nav-icon">⌁</span>Prompt evaluations<span className="nav-count">NEW</span></Link>
        <Link className="nav-item" href="/analytics"><span className="nav-icon">◷</span>Cost &amp; performance</Link>
        <Link className="nav-item" href="/alerts"><span className="nav-icon">⚑</span>Reliability alerts<span className="nav-count">NEW</span></Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-card"><span className="privacy-icon">⌑</span><strong>Privacy by default</strong><p>Prompt templates and datasets are stored for comparison.</p><p>Generated responses are scored in memory.</p></div>
        <AccountMenu />
      </div>
    </aside>

    <main className="main-panel min-w-0">
      <div className="content max-w-none">
        <header className="page-heading items-start">
          <div>
            <Link href="/" className="text-xs text-slate-500 hover:text-violet-300">← Back to overview</Link>
            <div className="eyebrow mt-4"><i />PROMPT QUALITY WORKSPACE</div>
            <h1>Prompt evaluation<span>.</span></h1>
            <p>Create prompt versions, test them on the same dataset, and compare results.</p>
          </div>
          <div className="heading-actions"><span className="database-pill border-violet-900/60 bg-violet-950/40 text-violet-300">PHASE 5</span><button className="icon-button" aria-label="Refresh evaluations" onClick={() => void load()} disabled={loading || busy}>↻</button></div>
        </header>

        <div className="mb-6 grid gap-3 rounded-lg border border-indigo-900/70 bg-indigo-950/35 p-3 text-xs text-indigo-100 sm:grid-cols-[auto_1fr] sm:items-start">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-400 font-bold text-indigo-950">i</span>
          <p><strong>Evaluation score is a heuristic.</strong><br /><span className="text-indigo-200/75">It measures case-insensitive word overlap with your expected output. It is not semantic correctness or factuality.</span></p>
        </div>
        {error && <div role="alert" className="mb-6 rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200"><strong>Something needs attention</strong><p className="mt-1">{error}</p></div>}

        <div className="mb-5 grid gap-3 md:grid-cols-4" aria-label="Evaluation workflow">
          {workflow.map(([number, title, description, tone], index) => <div key={number} className="relative flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            <span className={`metric-icon ${tone}`}>{number}</span><span><strong className="block text-xs text-slate-200">{title}</strong><small className="mt-1 block text-[10px] leading-4 text-slate-500">{description}</small></span>{index < 3 && <span className="absolute -right-2 top-5 hidden text-slate-600 md:block">›</span>}
          </div>)}
        </div>

        {loading ? <div className={cardClass}>Loading prompts and datasets…</div> : <>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="panel" id="create-prompt">
              <div className="panel-heading"><div><h2><span className="metric-icon purple mr-2 inline-grid align-middle">1</span>Create a prompt</h2><p>Define a prompt template. Use <code className="text-violet-300">{"{{input}}"}</code> where each test input should be inserted.</p></div></div>
              <form className="mt-5 space-y-4" onSubmit={createPrompt}>
                <label className="block text-xs text-slate-300">Prompt name<input className={inputClass} placeholder="e.g. Support Assistant — Basic" value={promptName} onChange={e => setPromptName(e.target.value)} maxLength={120} required /></label>
                <label className="block text-xs text-slate-300">Ollama model<input className={inputClass} value={model} onChange={e => setModel(e.target.value)} maxLength={160} required /></label>
                <label className="block text-xs text-slate-300">Prompt template<textarea className={`${inputClass} font-mono text-xs leading-5`} rows={4} value={template} onChange={e => setTemplate(e.target.value)} maxLength={12000} required /></label>
                <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-slate-500">Use {"{{input}}"} for the dataset question.</span><button className={buttonClass} disabled={busy}>▣ Save prompt v1</button></div>
              </form>
            </section>

            <section className="panel" id="create-dataset">
              <div className="panel-heading"><div><h2><span className="metric-icon blue mr-2 inline-grid align-middle">2</span>Create a dataset</h2><p>One test case per line. Use <code className="text-blue-300">input || expected output</code>.</p></div></div>
              <form className="mt-5 space-y-4" onSubmit={createDataset}>
                <label className="block text-xs text-slate-300">Dataset name<input className={inputClass} placeholder="e.g. Backend Fundamentals" value={datasetName} onChange={e => setDatasetName(e.target.value)} maxLength={120} required /></label>
                <label className="block text-xs text-slate-300">Description<input className={inputClass} placeholder="Brief description of this dataset…" value={datasetDescription} onChange={e => setDatasetDescription(e.target.value)} maxLength={500} /></label>
                <label className="block text-xs text-slate-300">Test cases<textarea className={`${inputClass} font-mono text-xs leading-5`} rows={4} value={caseText} onChange={e => setCaseText(e.target.value)} required /></label>
                <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-slate-500">One input and expected output per line.</span><button className="rounded-lg bg-blue-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-blue-300 disabled:opacity-50" disabled={busy}>▣ Save dataset</button></div>
              </form>
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <section className="panel">
              <div className="panel-heading"><div><h2><span className="metric-icon green mr-2 inline-grid align-middle">3</span>Prompt version history</h2><p>Versions are immutable. Select 2–4 versions to compare.</p></div><button className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-violet-400" onClick={() => document.getElementById("create-prompt")?.scrollIntoView({ behavior: "smooth" })}>＋ New prompt</button></div>
              {prompts.length === 0 ? <p className="mt-5 rounded-lg border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">No prompts yet. Create one above.</p> : <div className="mt-5 space-y-3">{prompts.map(prompt => <article key={prompt.id} className="rounded-lg border border-slate-800 bg-slate-950/55">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3"><div><h3 className="text-sm font-semibold text-slate-200">{prompt.name}</h3><p className="mt-1 text-[10px] text-slate-500">{prompt.model} · {prompt.versions.length} version(s)</p></div><span className="text-slate-500">⌄</span></div>
                <div className="divide-y divide-slate-800">{prompt.versions.map(version => <label key={version.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-900/70"><input type="checkbox" className="mt-1 accent-violet-400" checked={selectedVersions.includes(version.id)} onChange={() => toggleVersion(version.id)} disabled={!selectedVersions.includes(version.id) && selectedVersions.length >= 4} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-xs font-medium text-slate-200"><span><b className="mr-2 rounded bg-slate-800 px-1.5 py-1 text-[10px] text-slate-300">v{version.version}</b>{version.template.replace(/\s+/g, " ").slice(0, 75)}{version.template.length > 75 ? "…" : ""}</span><span className="text-[10px] text-slate-500">Compare</span></span></span></label>)}</div>
                <div className="border-t border-slate-800 px-4 py-3"><label className="block text-[10px] text-slate-500">New version template<textarea className={`${inputClass} mt-2 text-xs`} rows={2} value={versionTemplates[prompt.id] ?? ""} onChange={e => setVersionTemplates(current => ({ ...current, [prompt.id]: e.target.value }))} placeholder="Write an improved version using {{input}}…" /></label><button className="mt-2 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-violet-400 disabled:opacity-50" onClick={() => void createVersion(prompt)} disabled={busy || !(versionTemplates[prompt.id] ?? "").trim()}>＋ Add version</button></div>
              </article>)}</div>}
            </section>

            <section className="panel">
              <div className="panel-heading"><div><h2><span className="metric-icon orange mr-2 inline-grid align-middle">4</span>Run a comparison</h2><p>Send the same cases to each selected model, one at a time.</p></div></div>
              <label className="mt-5 block text-xs text-slate-300">Evaluation dataset<select className={inputClass} value={datasetId} onChange={e => setDatasetId(e.target.value)}><option value="">Select dataset…</option>{datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.name} ({dataset.caseCount} cases)</option>)}</select></label>
              <div className="mt-4 space-y-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Selected prompt versions ({selectedVersions.length}/4)</p>{selectedVersions.map(id => { const version = prompts.flatMap(prompt => prompt.versions).find(item => item.id === id); const prompt = promptForVersion(id); return version && prompt ? <div key={id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-2 text-xs"><span>v{version.version} · {prompt.name}</span><span className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400">{prompt.model}</span></div> : null; })}</div>
              <button className="mt-5 w-full rounded-lg bg-violet-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-violet-300 disabled:opacity-50" onClick={() => void runComparison()} disabled={busy || !datasetId || selectedVersions.length < 2}>{busy ? "Running evaluation…" : `▶ Run comparison (${selectedVersions.length}/4)`}</button>
              {datasets.length === 0 && <p className="mt-3 text-xs text-amber-300">Create a dataset above before running an evaluation.</p>}
              {selectedVersions.length < 2 && <p className="mt-3 text-xs text-slate-500">Select at least two prompt versions from the history.</p>}
            </section>
          </div>

          {evaluation && <section className="panel mt-4">
            <div className="panel-heading"><div><h2>Comparison results</h2><p>{evaluation.completedCases} successful calls · {evaluation.failedCases} failed calls · {evaluation.scoreMethod}</p></div><span className="database-pill">{evaluation.status}</span></div>
            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-800"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Prompt version</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Test cases</th><th className="px-4 py-3">Average score</th><th className="px-4 py-3">Success rate</th><th className="px-4 py-3">Avg latency</th><th className="px-4 py-3">Avg tokens</th></tr></thead><tbody>{evaluation.summary.map(item => <tr key={item.promptVersionId} className="border-t border-slate-800 text-slate-300"><td className="px-4 py-3 font-medium">{item.promptName} <span className="text-slate-500">(v{item.version})</span></td><td className="px-4 py-3"><span className="rounded bg-slate-800 px-2 py-1 text-[10px]">{item.model}</span></td><td className="px-4 py-3">{item.totalCases}</td><td className="px-4 py-3 text-emerald-300">{item.averageScore === null ? "—" : `${format(item.averageScore)}%`}</td><td className="px-4 py-3">{item.totalCases ? `${Math.round(item.successfulCases / item.totalCases * 100)}%` : "—"}</td><td className="px-4 py-3">{ms(item.averageLatencyMs)}</td><td className="px-4 py-3">{format(item.totalInputTokens == null && item.totalOutputTokens == null ? null : (item.totalInputTokens ?? 0) + (item.totalOutputTokens ?? 0))}</td></tr>)}</tbody></table></div>
            <details className="mt-5"><summary className="cursor-pointer text-xs text-slate-400">View individual case results</summary><div className="mt-3 overflow-x-auto rounded-lg border border-slate-800"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Prompt version</th><th className="px-4 py-3">Case</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Latency</th><th className="px-4 py-3">Error</th></tr></thead><tbody>{evaluation.results.map((result, index) => <tr key={`${result.promptVersionId}:${result.caseId}:${index}`} className="border-t border-slate-800 text-slate-300"><td className="px-4 py-3">{result.promptName} v{result.version}</td><td className="px-4 py-3 font-mono text-[10px]">{result.caseId.slice(0, 8)}</td><td className="px-4 py-3">{result.status}</td><td className="px-4 py-3">{result.score === null ? "—" : `${format(result.score)}%`}</td><td className="px-4 py-3">{ms(result.durationMs)}</td><td className="px-4 py-3 text-rose-300">{result.errorCode ?? "—"}</td></tr>)}</tbody></table></div></details>
          </section>}
        </>}
        <footer className="mt-8 border-t border-slate-800 pt-4 text-xs text-slate-600">FaultLens · Prompt templates and evaluation datasets are stored intentionally. Generated responses are scored in memory and not persisted.</footer>
      </div>
    </main>
  </div>;
}
