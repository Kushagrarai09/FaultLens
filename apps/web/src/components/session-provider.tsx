"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

export type Session = {
  user: { id: string; email: string };
  workspace: { id: string; name: string; role: string };
};
type Workspace = { id: string; name: string; role: string };
type SessionContextValue = {
  session: Session | null;
  workspaces: Workspace[];
  loading: boolean;
  logout: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
};
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/register") {
      return;
    }
    let active = true;
    void Promise.all([
      fetch("/api/auth/me", { cache: "no-store" }),
      fetch("/api/workspaces", { cache: "no-store" }),
    ]).then(async ([meResponse, workspaceResponse]) => {
      if (!active) return;
      if (meResponse.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const me = await meResponse.json() as Session;
      const workspacePayload = workspaceResponse.ok ? await workspaceResponse.json() as { data?: Workspace[] } : {};
      setSession(me);
      setWorkspaces(workspacePayload.data ?? []);
    }).catch(() => {
      if (active) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [pathname, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    router.replace("/login");
  }

  async function switchWorkspace(workspaceId: string) {
    const response = await fetch("/api/auth/switch-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    if (!response.ok) throw new Error("Could not switch workspace.");
    const next = await response.json() as Session & { accessToken?: string };
    setSession({ user: next.user, workspace: next.workspace });
    router.refresh();
    window.location.reload();
  }

  if (loading && pathname !== "/login" && pathname !== "/register") {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Loading FaultLens…</main>;
  }
  return <SessionContext.Provider value={{ session, workspaces, loading, logout, switchWorkspace }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider.");
  return value;
}
