import { useState } from "react";
import { Send, Users, Mail, FileText, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { useSubmit } from "@/lib/ui/useSubmit";
import { toastSuccess, toastError, toastWarning } from "@/lib/ui/toast";

interface Contact {
  id: string;
  name: string;
  email: string;
}

interface LastSend {
  email: string;
  sentAt: string;
}

// What the send route returns on success: which recipient, the address, and the
// dispatch timestamp — enough to patch the delivery strip + flip the button.
interface SendResult {
  recipientType: "pm" | "client";
  email: string;
  sentAt: string;
}

interface Props {
  reportId: string;
  slug: string;
  pdfHref: string;
  contacts: Contact[];
  clientEmail: string | null;
  pmLastSend: LastSend | null;
  clientLastSend: LastSend | null;
}

// Owns the delivery state for both recipients so a successful send updates the
// strip AND the button label in one place (no cross-island coordination). Wraps
// the View-PDF link, both Send controls, and the delivery strip.
export default function ReportDelivery({
  reportId,
  slug,
  pdfHref,
  contacts,
  clientEmail,
  pmLastSend,
  clientLastSend,
}: Props) {
  const [pm, setPm] = useState<LastSend | null>(pmLastSend);
  const [client, setClient] = useState<LastSend | null>(clientLastSend);

  function applySend(res: SendResult) {
    const last = { email: res.email, sentAt: res.sentAt };
    if (res.recipientType === "pm") setPm(last);
    else setClient(last);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Delivery</h1>
          <p className="text-muted-foreground text-sm">View the PDF and send it to the PM and client.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="border-input bg-card hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium shadow-xs transition-colors"
          >
            <FileText className="size-4" />
            View PDF
          </a>
          <SendToPm reportId={reportId} slug={slug} contacts={contacts} lastSend={pm} onSent={applySend} />
          <SendToClient
            reportId={reportId}
            slug={slug}
            clientEmail={clientEmail}
            lastSend={client}
            onSent={applySend}
          />
        </div>
      </div>

      <div className="border-border bg-border mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border sm:grid-cols-2">
        <StripCell icon={<Users className="text-muted-foreground size-4 shrink-0" />} label="PM:" send={pm} />
        <StripCell icon={<Mail className="text-muted-foreground size-4 shrink-0" />} label="Client:" send={client} />
      </div>
    </>
  );
}

function StripCell({ icon, label, send }: { icon: React.ReactNode; label: string; send: LastSend | null }) {
  return (
    <div className="bg-card flex items-center gap-2 px-4 py-2.5 text-sm">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      {send ? (
        <span className="text-foreground truncate">
          {send.email}
          <span className="text-muted-foreground"> · {new Date(send.sentAt).toLocaleDateString()}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">Not sent yet</span>
      )}
    </div>
  );
}

// Apply a send response: success toast (or warning when recorded-failed), then
// patch the strip. A failure toasts the error and changes nothing (US-01: a
// failed send writes no record — enforced server-side).
function handleSendResult(
  res: Awaited<ReturnType<ReturnType<typeof useSubmit<SendResult>>["submit"]>>,
  onSent: (r: SendResult) => void,
): void {
  if (res.ok) {
    if (res.warning) toastWarning(res.message);
    else toastSuccess(res.message);
    if (res.data) onSent(res.data);
  } else {
    toastError(res.error);
  }
}

function SendToPm({
  reportId,
  slug,
  contacts,
  lastSend,
  onSent,
}: {
  reportId: string;
  slug: string;
  contacts: Contact[];
  lastSend: LastSend | null;
  onSent: (r: SendResult) => void;
}) {
  const matchLast = contacts.find((c) => c.email === lastSend?.email);
  const [selectedId, setSelectedId] = useState(matchLast ? matchLast.id : contacts.length > 0 ? contacts[0].id : "");
  const [open, setOpen] = useState(false);
  const { submit, pending } = useSubmit<SendResult>();
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const sentLine = lastSend ? `Sent to ${lastSend.email} on ${new Date(lastSend.sentAt).toLocaleDateString()}` : null;

  // No PM contacts saved: disabled control with the reason + fix in a tooltip
  // (US-04); the focusable wrapper carries it for keyboard users.
  if (contacts.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="focus-visible:ring-ring/50 inline-flex rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <Button type="button" variant="outline" disabled className="pointer-events-none">
              <Send className="size-4" />
              Send to PM
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          No PM contacts — add one in{" "}
          <a href="/pm-contacts" className="underline underline-offset-2">
            Settings
          </a>
          .
        </TooltipContent>
      </Tooltip>
    );
  }

  async function handleSend() {
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("recipient_type", "pm");
    fd.set("pm_email", selected?.email ?? "");
    fd.set("pm_name", selected?.name ?? "");
    fd.set("pm_contact_id", selected?.id ?? "");
    const res = await submit(`/api/reports/${reportId}/send`, fd);
    handleSendResult(res, onSent);
    if (res.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Send className="size-4" />
          {lastSend ? "Re-send to PM" : "Send to PM"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Users className="text-primary size-5" />
            {lastSend ? "Re-send to a PM" : "Send to a PM"}
          </DialogTitle>
          {lastSend && <DialogDescription>{sentLine}.</DialogDescription>}
        </DialogHeader>

        <div>
          <Label htmlFor="pm-select">Recipient</Label>
          <select
            id="pm-select"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
            }}
            className="border-input bg-card text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none"
          >
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" disabled={pending} onClick={() => void handleSend()}>
            <Send className="size-4" />
            {pending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendToClient({
  reportId,
  slug,
  clientEmail,
  lastSend,
  onSent,
}: {
  reportId: string;
  slug: string;
  clientEmail: string | null;
  lastSend: LastSend | null;
  onSent: (r: SendResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const { submit, pending } = useSubmit<SendResult>();
  const sentLine = lastSend ? `Sent to ${lastSend.email} on ${new Date(lastSend.sentAt).toLocaleDateString()}` : null;

  // No client email on the project: the send can't work. Disabled control whose
  // reason + fix live in a tooltip (US-04).
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

  async function handleSend() {
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("recipient_type", "client");
    const res = await submit(`/api/reports/${reportId}/send`, fd);
    handleSendResult(res, onSent);
    if (res.ok) setOpen(false);
  }

  // First send: a plain button. Re-send: confirm via Dialog first.
  if (!lastSend) {
    return (
      <Button type="button" variant="outline" disabled={pending} onClick={() => void handleSend()}>
        <Send className="size-4" />
        {pending ? "Sending..." : "Send to client"}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <Button type="button" disabled={pending} onClick={() => void handleSend()}>
            <Send className="size-4" />
            {pending ? "Sending..." : "Re-send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
