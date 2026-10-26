import { expect, test, type Page, type Route } from "@playwright/test";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "browser@example.test" };
const workspaceA = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Alpha workspace", role: "owner" };
const workspaceB = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Beta workspace", role: "member" };
type Run = { id: string; provider: string; model: string; status: "success" | "failure"; durationMs: number; inputTokens: number | null; outputTokens: number | null; errorCode: string | null; startedAt: string; createdAt: string };
const sessionFor = (workspace = workspaceA) => ({ user, workspace });

async function mockApi(page: Page, options: { signedIn?: boolean; loginFailure?: boolean; apiUnavailable?: boolean } = {}) {
  const state = { signedIn: options.signedIn ?? true, workspaceId: workspaceA.id, runs: [] as Run[], loginFailure: options.loginFailure ?? false, apiUnavailable: options.apiUnavailable ?? false };
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request(); const path = new URL(request.url()).pathname; const method = request.method();
    if (path === "/api/auth/login" && method === "POST") {
      if (state.loginFailure) await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Invalid email or password." }) });
      else { state.signedIn = true; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...sessionFor(), accessToken: "test-only-token" }) }); }
      return;
    }
    if (path === "/api/auth/register" && method === "POST") {
      state.signedIn = true; await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...sessionFor(), accessToken: "test-only-token" }) }); return;
    }
    if (path === "/api/auth/me" && method === "GET") {
      if (!state.signedIn) await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Authentication required." }) });
      else await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionFor(state.workspaceId === workspaceB.id ? workspaceB : workspaceA)) });
      return;
    }
    if (path === "/api/workspaces" && method === "GET") {
      await route.fulfill({ status: state.signedIn ? 200 : 401, contentType: "application/json", body: JSON.stringify({ data: state.signedIn ? [workspaceA, workspaceB] : [] }) }); return;
    }
    if (path === "/api/auth/switch-workspace" && method === "POST") {
      const body = request.postDataJSON() as { workspaceId?: string }; state.workspaceId = body.workspaceId === workspaceB.id ? workspaceB.id : workspaceA.id;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionFor(state.workspaceId === workspaceB.id ? workspaceB : workspaceA)) }); return;
    }
    if (path === "/api/auth/logout" && method === "POST") {
      state.signedIn = false; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }); return;
    }
    if (path === "/api/runs" && method === "GET") {
      if (state.apiUnavailable) await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ message: "Cannot reach the FaultLens API. Check that the API and its dependencies are running." }) });
      else await route.fulfill({ status: state.signedIn ? 200 : 401, contentType: "application/json", body: JSON.stringify({ data: state.runs, pagination: { limit: 50, offset: 0 } }) });
      return;
    }
    if (path === "/api/runs" && method === "POST") {
      const body = request.postDataJSON() as Partial<Run>;
      const run: Run = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", provider: body.provider ?? "demo-provider", model: body.model ?? "demo-chat-model", status: body.status ?? "success", durationMs: body.durationMs ?? 420, inputTokens: body.inputTokens ?? 100, outputTokens: body.outputTokens ?? 200, errorCode: body.errorCode ?? null, startedAt: body.startedAt ?? new Date().toISOString(), createdAt: new Date().toISOString() };
      state.runs.unshift(run); await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: run }) }); return;
    }
    if (path === "/api/analytics/summary" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), scope: "current_workspace", totals: { totalRuns: state.runs.length, successfulRuns: state.runs.length, failedRuns: 0, successRatePercent: 100, failureRatePercent: 0, distinctModels: 1 }, latencyMs: { average: 420, p50: 400, p95: 800 }, tokens: { input: 100, output: 200, total: 300, runsWithInputTokenData: 1, runsWithOutputTokenData: 1 }, cost: { estimatedUsd: null, available: false, reason: "No verified pricing configuration is available for this provider/model." }, byModel: [] }) }); return;
    }
    if (["/api/prompts", "/api/datasets", "/api/evaluations", "/api/alerts/rules", "/api/alerts/evaluate"].includes(path)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }); return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });
  return state;
}

test("unauthenticated dashboard access redirects to login", async ({ page }) => {
  await mockApi(page, { signedIn: false }); await page.goto("/");
  await expect(page).toHaveURL(/\/login/); await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("login rejects invalid credentials and shows an accessible error", async ({ page }) => {
  await mockApi(page, { signedIn: false, loginFailure: true }); await page.goto("/login");
  await page.getByLabel("Email").fill("wrong@example.test"); await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid email or password");
});

test("login succeeds and opens the dashboard", async ({ page }) => {
  await mockApi(page, { signedIn: false }); await page.goto("/login");
  await page.getByLabel("Email").fill("browser@example.test"); await page.getByLabel("Password").fill("a-valid-browser-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Run health at a glance/ })).toBeVisible();
});

test("registration creates a session and opens the dashboard", async ({ page }) => {
  await mockApi(page, { signedIn: false }); await page.goto("/register");
  await page.getByLabel("Email").fill("new-browser@example.test"); await page.getByLabel("Password").fill("a-long-browser-test-password");
  await page.getByLabel("Workspace name").fill("Browser test workspace"); await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: /Run health at a glance/ })).toBeVisible();
});

test("dashboard loads and can create a synthetic run", async ({ page }) => {
  await mockApi(page); await page.goto("/");
  await expect(page.getByRole("heading", { name: /Run health at a glance/ })).toBeVisible();
  await expect(page.getByText("No AI runs yet")).toBeVisible(); await page.getByRole("button", { name: /Create demo run/ }).click();
  await expect(page.getByText("demo-chat-model")).toBeVisible();
});

test("analytics page loads and preserves unknown cost", async ({ page }) => {
  await mockApi(page); await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: /Cost & performance|Analytics/i })).toBeVisible();
  await expect(page.getByText(/unknown|unavailable|not available|No verified pricing/i).first()).toBeVisible();
});

test("evaluations page loads", async ({ page }) => {
  await mockApi(page); await page.goto("/evaluations");
  await expect(page.getByText("1. Create a prompt")).toBeVisible(); await expect(page.getByText("2. Create a dataset")).toBeVisible();
});

test("alerts page loads", async ({ page }) => {
  await mockApi(page); await page.goto("/alerts");
  await expect(page.getByRole("heading", { name: "Reliability alerts" })).toBeVisible(); await expect(page.getByText("On-demand evaluation only.")).toBeVisible();
});

test("API unavailable state shows a helpful message", async ({ page }) => {
  await mockApi(page, { apiUnavailable: true }); await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Cannot reach the FaultLens API");
});

test("workspace switcher posts the selected workspace and updates the session", async ({ page }) => {
  const state = await mockApi(page); await page.goto("/");
  const workspaceSelector = page.getByLabel("Workspace"); await expect(workspaceSelector).toBeVisible();
  await workspaceSelector.selectOption(workspaceB.id); await expect.poll(() => state.workspaceId).toBe(workspaceB.id);
  await expect(workspaceSelector).toHaveValue(workspaceB.id);
});


test("logout clears the session and returns to login", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Run health at a glance/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
