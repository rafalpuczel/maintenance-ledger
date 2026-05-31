import { Send, TriangleAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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

interface LastSend {
  email: string;
  sentAt: string;
}

interface Props {
  reportId: string;
  // posted so the server redirects back to the report after sending
  slug: string;
  clientEmail: string | null;
  // most recent client send, or null if never sent (drives re-send state)
  lastSend: LastSend | null;
}

function SubmitSend({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Send className="size-4" />
      {pending ? "Sending..." : label}
    </Button>
  );
}

export default function SendToClientButton({ reportId, slug, clientEmail, lastSend }: Props) {
  const action = `/api/reports/${reportId}/send`;
  const sentLine = lastSend ? `Sent to ${lastSend.email} on ${new Date(lastSend.sentAt).toLocaleDateString()}` : null;

  // No client email on the project: the send can't work. Show a disabled control
  // whose reason + fix live in a tooltip (US-04). A disabled <button> is not
  // focusable, so the focusable wrapper carries the tooltip for keyboard users.
  if (!clientEmail) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="focus-visible:ring-ring/50 inline-flex rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <Button type="button" variant="outline" disabled className="pointer-events-none">
              <Send className="size-4" />
              Send to client
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          No client email — add one on the{" "}
          <a href={`/projects/${slug}`} className="underline underline-offset-2">
            project
          </a>
          .
        </TooltipContent>
      </Tooltip>
    );
  }

  const hiddenFields = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="recipient_type" value="client" />
    </>
  );

  // First send: plain submit. Re-send: confirm via Dialog first.
  if (!lastSend) {
    return (
      <form method="POST" action={action}>
        {hiddenFields}
        <SubmitSend label="Send to client" />
      </form>
    );
  }

  // Re-send: confirm via Dialog first. The "last sent" history is shown by the
  // page's delivery strip, not inline here — keeps the action row uniform.
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Send className="size-4" />
          Re-send to client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <TriangleAlert className="text-primary size-5" />
            Re-send to client?
          </DialogTitle>
          <DialogDescription>
            This emails the current PDF to {clientEmail} again. {sentLine}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <form method="POST" action={action}>
            {hiddenFields}
            <SubmitSend label="Re-send" />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
