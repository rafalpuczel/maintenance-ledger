import { useState } from "react";
import { Send, Users } from "lucide-react";
import { useFormStatus } from "react-dom";
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

interface Contact {
  id: string;
  name: string;
  email: string;
}

interface LastSend {
  email: string;
  sentAt: string;
}

interface Props {
  reportId: string;
  // posted so the server redirects back to the report after sending
  slug: string;
  contacts: Contact[];
  // most recent PM send, or null if never sent (drives re-send label + default pick)
  lastSend: LastSend | null;
}

function SubmitSend() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Send className="size-4" />
      {pending ? "Sending..." : "Send"}
    </Button>
  );
}

export default function SendToPmButton({ reportId, slug, contacts, lastSend }: Props) {
  // Default the picker to the last PM sent to (if still in the list), else the
  // first contact, else "" when the list is empty (the empty case returns early
  // below, so the select never renders with a blank value).
  const matchLast = contacts.find((c) => c.email === lastSend?.email);
  const [selectedId, setSelectedId] = useState(matchLast ? matchLast.id : contacts.length > 0 ? contacts[0].id : "");
  const action = `/api/reports/${reportId}/send`;
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const sentLine = lastSend ? `Sent to ${lastSend.email} on ${new Date(lastSend.sentAt).toLocaleDateString()}` : null;

  // No PM contacts saved: nothing to pick. Disabled control with the reason + fix
  // in a tooltip (US-04); the focusable wrapper carries it for keyboard users.
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

  // The "last sent" history is shown by the page's delivery strip, not inline
  // here — keeps the action row uniform.
  return (
    <Dialog>
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
          <form method="POST" action={action}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="recipient_type" value="pm" />
            <input type="hidden" name="pm_email" value={selected?.email ?? ""} />
            <input type="hidden" name="pm_name" value={selected?.name ?? ""} />
            <input type="hidden" name="pm_contact_id" value={selected?.id ?? ""} />
            <SubmitSend />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
