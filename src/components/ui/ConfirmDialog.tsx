import { useId, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

interface Props {
  // the control that opens the dialog (rendered via asChild)
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  // when set, the confirm button stays disabled until the user types this word
  // (used by project delete as a deliberate safety guard)
  confirmWord?: string;
  // disables the confirm button + shows the pending label while in flight
  pending?: boolean;
  pendingLabel?: string;
  onConfirm: () => void;
}

// One accessible confirm dialog on top of the Radix Dialog primitive, replacing
// the hand-rolled inline "Delete?" toggles and the ad-hoc delete dialogs. Focus
// trap, Esc-to-close, and roles come from Dialog for free.
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "default",
  confirmWord,
  pending = false,
  pendingLabel = "Working...",
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const locked = confirmWord !== undefined && typed.trim() !== confirmWord;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {variant === "destructive" && <TriangleAlert className="text-destructive size-5" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {confirmWord !== undefined && (
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="text-sm">
              Type <span className="font-semibold">{confirmWord}</span> to confirm.
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
              }}
              className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={locked || pending}
            onClick={onConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
