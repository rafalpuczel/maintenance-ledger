import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
  // Fetch-based islands drive their own pending state via useSubmit(); pass it
  // here. Native <form action> callers omit it and fall back to useFormStatus.
  pending?: boolean;
}

export function SubmitButton({ pendingText, icon, children, pending: pendingProp }: SubmitButtonProps) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp ?? formPending;

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="border-primary-foreground/30 border-t-primary-foreground size-4 animate-spin rounded-full border-2" />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </Button>
  );
}
