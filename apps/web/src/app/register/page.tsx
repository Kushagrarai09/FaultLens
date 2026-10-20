"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("My FaultLens Workspace");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, workspaceName }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Unable to create account.");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create account.");
    } finally { setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-slate-100">
    <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-7 shadow-2xl">
      <Link href="/" className="text-sm font-semibold text-violet-300">fault<span className="text-slate-400">lens</span></Link>
      <h1 className="mt-8 text-3xl font-semibold">Create your workspace</h1>
      <p className="mt-2 text-sm text-slate-400">Start a private FaultLens workspace for your AI runs.</p>
      {error && <p role="alert" className="mt-5 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm text-slate-300">Email<input className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
        <label className="block text-sm text-slate-300">Password<input className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" type="password" minLength={12} value={password} onChange={event => setPassword(event.target.value)} required /><span className="mt-1 block text-xs text-slate-500">Use at least 12 characters.</span></label>
        <label className="block text-sm text-slate-300">Workspace name<input className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} maxLength={120} required /></label>
        <button className="w-full rounded-lg bg-violet-400 px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-50" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">Already registered? <Link href="/login" className="text-violet-300 hover:text-violet-200">Sign in</Link></p>
    </section>
  </main>;
}
