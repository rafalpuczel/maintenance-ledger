import { useState } from "react";
import { Send, TriangleAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

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
    <Button type="submit" disabled={pending} className="bg-blue-600 text-white hover:bg-blue-500">
      <Send className="size-4" />
      {pending ? "Sending..." : label}
    </Button>
  );
}

export default function SendToClientButton({ reportId, slug, clientEmail, lastSend }: Props) {
  const [open, setOpen] = useState(false);
  const action = `/api/reports/${reportId}/send`;
  const sentLine = lastSend ? `Sent to ${lastSend.email} on ${new Date(lastSend.sentAt).toLocaleDateString()}` : null;

  // No client email on the project: the send can't work, so fail loud at the UI
  // and point at the fix rather than offering a dead button.
  if (!clientEmail) {
    return (
      <div className="flex flex-col items-end">
        <Button type="button" disabled className="border border-white/20 bg-white/10 text-blue-100/60">
          <Send className="size-4" />
          Send to client
        </Button>
        <a href={`/projects/${slug}`} className="mt-1 text-xs text-amber-200/80 underline-offset-4 hover:underline">
          No client email — add one on the project
        </a>
      </div>
    );
  }

  const hiddenFields = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="recipient_type" value="client" />
    </>
  );

  return (
    <div className="flex flex-col items-end">
      {lastSend ? (
        <Button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          className="border border-blue-400/40 bg-blue-900/30 text-blue-100 hover:bg-blue-900/50"
        >
          <Send className="size-4" />
          Re-send to client
        </Button>
      ) : (
        <form method="POST" action={action}>
          {hiddenFields}
          <SubmitSend label="Send to client" />
        </form>
      )}

      {sentLine && <p className="mt-1 text-xs text-blue-100/50">{sentLine}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1529] p-6 text-white shadow-xl">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-blue-200">
              <TriangleAlert className="size-5" />
              Re-send to client?
            </h2>
            <p className="mb-4 text-sm text-blue-100/80">
              This emails the current PDF to {clientEmail} again. {sentLine}.
            </p>
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
                {hiddenFields}
                <SubmitSend label="Re-send" />
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
