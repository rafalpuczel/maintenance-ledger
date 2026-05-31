import { Toaster as SonnerToaster } from "sonner";

// Single global toast container, mounted once in AppShell. sonner provides the
// accessible live region; we align it to the light theme and give it the app's
// rounded/border look via tokens.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "rounded-lg border shadow-md",
        },
      }}
    />
  );
}
