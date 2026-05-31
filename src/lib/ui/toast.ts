import { toast } from "sonner";

// Thin wrapper over sonner so call sites import from one project path and the
// library stays swappable. sonner mounts its own accessible live region via the
// <Toaster/> in AppShell.

export function toastSuccess(message: string): void {
  toast.success(message);
}

export function toastError(message: string): void {
  toast.error(message);
}

export function toastWarning(message: string): void {
  toast.warning(message);
}
