"use client";

import { useState } from "react";
import { useSession } from "./session-provider";

export function AccountMenu() {
  const { session, workspaces, logout, switchWorkspace } = useSession();
  const [busy, setBusy] = useState(false);
  if (!session) return null;
  async function changeWorkspace(id: string) {
    setBusy(true);
    try { await switchWorkspace(id); } finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500">Workspace
      <select className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-200" value={session.workspace.id} disabled={busy} onChange={event => void changeWorkspace(event.target.value)}>
        {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.role}</option>)}
      </select>
    </label>
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-400 font-bold text-slate-950">{session.user.email[0]?.toUpperCase()}</span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-200">{session.user.email}</strong><small className="text-xs text-slate-500">{session.workspace.role}</small></span>
      <button className="text-xs text-slate-400 hover:text-slate-100" onClick={() => void logout()}>Sign out</button>
    </div>
  </div>;
}
