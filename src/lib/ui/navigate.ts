import { navigate } from "astro:transitions/client";

// Client-side route navigation via Astro's ClientRouter — a partial swap, no
// full-page reload / blank-flash. The <Toaster/> in AppShell is
// `transition:persist`, so a toast fired just before this call survives the
// transition and stays visible on the destination page.
export function clientNavigate(to: string): void {
  void navigate(to);
}
