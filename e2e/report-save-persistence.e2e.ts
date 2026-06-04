import { test, expect, type APIResponse } from "@playwright/test";

// Provenance: protects R1 (context/foundation/test-plan.md) — "a report Save
// succeeds in the UI but the data is partially lost, or the regenerated PDF
// silently goes stale/missing." Modeled on the project seed (e2e/seed.e2e.ts).
//
// Why this exists alongside the seed: the seed asserts the happy toast and the
// View-PDF link's *static* href — both of which look identical when the risk
// materializes (a partial-write or an unrenderable PDF leaves the same href and
// can still flash a toast). This test closes that gap with two checks the seed
// does not make:
//   A) the saved values survive a real SSR reload (the partial-loss facet), and
//   B) the View-PDF link actually resolves to a real PDF (the stale/missing facet).
//
// Everything stays real (auth, routing, DB, FormePDF render) — R1 is the real
// save→render coupling, so mocking the renderer would gut the test.

const BASE_URL = "http://localhost:4321";

// Astro's security.checkOrigin rejects form POSTs whose Origin doesn't match the
// host; the request fixture sends none by default.
const formHeaders = { Origin: BASE_URL };

// The API envelope (src/lib/ui/response.ts) wraps payloads as { ok, data }.
async function actionData<T>(res: APIResponse): Promise<T> {
  const body = (await res.json()) as { data: T };
  return body.data;
}

test.describe("R1: a saved report persists across reload and keeps a renderable PDF", () => {
  const stamp = Date.now();
  const projectName = `E2E Persist ${stamp}`;
  const projectSlug = `e2e-persist-${stamp}`;
  let projectId: string;
  let slug: string;
  let reportId: string;

  test.beforeEach(async ({ request }) => {
    const projectRes = await request.post("/api/projects", {
      headers: formHeaders,
      form: { name: projectName, slug: projectSlug, contact_email: `persist-${stamp}@example.com` },
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

  test("save shows clean success, values survive reload, and the PDF link resolves", async ({ page, request }) => {
    const coreVersion = `6.5.${stamp % 100}`;
    const notes = `Persist check ${stamp}`;

    // Author the report. The form is an Astro client:load island; a fill that
    // lands before React hydrates is wiped when the controlled input commits its
    // (empty) initial prop. Retry the fill until it sticks — a state wait for
    // hydration, not a fixed timeout — so we exercise the real "user typed it"
    // path rather than silently saving empty.
    await page.goto(`/projects/${slug}/reports/${reportId}`);
    const coreInput = page.getByLabel("WordPress core version");
    const notesInput = page.getByLabel("Notes to client");
    await expect(async () => {
      await coreInput.fill(coreVersion);
      await notesInput.fill(notes);
      await expect(coreInput).toHaveValue(coreVersion);
      await expect(notesInput).toHaveValue(notes);
    }).toPass();

    // Save — and require the CLEAN success toast, not the PDF-failed warning
    // ("Saved, but the PDF could not be generated."). R1: the UI must not claim
    // a plain save over an unrenderable PDF.
    await page.getByRole("button", { name: "Save report" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();

    // Facet A — partial-loss guard: a real SSR reload re-fetches from the DB and
    // re-hydrates the form. If any field didn't actually persist, it comes back
    // empty here even though the UI said "saved".
    await page.reload();
    await expect(page.getByLabel("WordPress core version")).toHaveValue(coreVersion);
    await expect(page.getByLabel("Notes to client")).toHaveValue(notes);

    // Facet B — stale/missing guard: follow the link the user actually clicks and
    // confirm it returns a real PDF, not a 404/500. The seed only checks the href
    // string, which is identical whether or not the PDF renders.
    const expectedHref = `/api/reports/${reportId}/pdf`;
    const pdfHref = await page.getByRole("link", { name: "View PDF" }).getAttribute("href");
    expect(pdfHref).toBe(expectedHref);
    const pdfRes = await request.get(expectedHref);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
  });
});
