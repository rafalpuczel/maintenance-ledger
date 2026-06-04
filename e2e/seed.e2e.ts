import { test, expect, type APIResponse } from "@playwright/test";

const BASE_URL = "http://localhost:4321";

// Astro's security.checkOrigin rejects form POSTs whose Origin doesn't match the
// host (403 "Cross-site POST form submissions are forbidden"). The request
// fixture sends none by default, so set it explicitly on form POSTs.
const formHeaders = { Origin: BASE_URL };

// The API envelope (src/lib/ui/response.ts) wraps payloads as { ok, data }.
async function actionData<T>(res: APIResponse): Promise<T> {
  const body = (await res.json()) as { data: T };
  return body.data;
}

// R1 (context/foundation/test-plan.md): a report Save must persist AND keep a
// valid PDF link — not a UI "saved" sitting over a stale/missing PDF.
//
// This is the SEED test: the reference for E2E conventions in this project.
//   - getByRole / getByLabel (never CSS selectors)
//   - wait for STATE (toBeVisible / toHaveAttribute), never page.waitForTimeout
//   - unique test data per run (Date.now() stamp)
//   - cleanup (afterEach deletes everything the test created)
//   - the describe name cites the risk it protects (R1)
//
// Auth: relies on storageState (playwright/.auth/user.json) wired in
// playwright.config.ts — the session cookie authenticates both the browser
// context and the `request` fixture, so API setup/teardown is authenticated too.
test.describe("R1: report save persists and keeps a valid PDF link", () => {
  const stamp = Date.now();
  const projectName = `E2E Seed ${stamp}`;
  const projectSlug = `e2e-seed-${stamp}`;
  let projectId: string;
  let slug: string;
  let reportId: string;

  test.beforeEach(async ({ request }) => {
    const projectRes = await request.post("/api/projects", {
      headers: formHeaders,
      form: { name: projectName, slug: projectSlug, contact_email: `seed-${stamp}@example.com` },
    });
    expect(projectRes.ok()).toBeTruthy();
    const project = await actionData<{ id: string; slug: string }>(projectRes);
    projectId = project.id;
    slug = project.slug;

    const reportRes = await request.post("/api/reports", {
      headers: formHeaders,
      form: { project_id: projectId, slug },
    });
    expect(reportRes.ok()).toBeTruthy();
    reportId = (await actionData<{ id: string }>(reportRes)).id;
  });

  test.afterEach(async ({ request }) => {
    await request.post(`/api/reports/${reportId}/delete`, { headers: formHeaders, form: { slug } });
    await request.post(`/api/projects/${projectId}/delete`, { headers: formHeaders });
  });

  test("saving the report shows success and the PDF link points at this report", async ({ page }) => {
    await page.goto(`/projects/${slug}/reports/${reportId}`);

    await page.getByLabel("WordPress core version").fill(`6.5.${stamp % 100}`);
    await page.getByLabel("Notes to client").fill(`Seed note ${stamp}`);

    await page.getByRole("button", { name: "Save report" }).click();

    // Wait for STATE — the success toast — not a fixed timeout.
    await expect(page.getByText("Changes saved.")).toBeVisible();

    // R1 assertion: the PDF link still targets THIS report after save
    // (would fail if the link went stale/missing).
    await expect(page.getByRole("link", { name: "View PDF" })).toHaveAttribute("href", `/api/reports/${reportId}/pdf`);
  });
});
