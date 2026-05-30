import { useState } from "react";
import { Send, Users } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

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
    <Button type="submit" disabled={pending} className="bg-blue-600 text-white hover:bg-blue-500">
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
  const [open, setOpen] = useState(false);
  const action = `/api/reports/${reportId}/send`;
  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const sentLine = lastSend ? `Sent to ${lastSend.email} on ${new Date(lastSend.sentAt).toLocaleDateString()}` : null;

  // No PM contacts saved: nothing to pick, so fail loud and point at Settings.
  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-end">
        <Button type="button" disabled className="border border-white/20 bg-white/10 text-blue-100/60">
          <Send className="size-4" />
          Send to PM
        </Button>
        <a href="/pm-contacts" className="mt-1 text-xs text-amber-200/80 underline-offset-4 hover:underline">
          No PM contacts — add one in Settings
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <Button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="border border-blue-400/40 bg-blue-900/30 text-blue-100 hover:bg-blue-900/50"
      >
        <Send className="size-4" />
        {lastSend ? "Re-send to PM" : "Send to PM"}
      </Button>

      {sentLine && <p className="mt-1 text-xs text-blue-100/50">{sentLine}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1529] p-6 text-white shadow-xl">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-blue-200">
              <Users className="size-5" />
              {lastSend ? "Re-send to a PM" : "Send to a PM"}
            </h2>
            {lastSend && <p className="mb-3 text-sm text-blue-100/70">{sentLine}.</p>}

            <label className="mb-1 block text-sm text-blue-100/80" htmlFor="pm-select">
              Recipient
            </label>
            <select
              id="pm-select"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
              }}
              className="mb-4 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0f1529]">
                  {c.name} ({c.email})
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                }}
                className="border border-white/20 bg-white/10 hover:bg-white/20"
              >
                Cancel
              </Button>
              <form method="POST" action={action}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="recipient_type" value="pm" />
                <input type="hidden" name="pm_email" value={selected?.email ?? ""} />
                <input type="hidden" name="pm_name" value={selected?.name ?? ""} />
                <input type="hidden" name="pm_contact_id" value={selected?.id ?? ""} />
                <SubmitSend />
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
