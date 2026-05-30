import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface Props {
  reportId: string;
  // sent so the server can redirect back to the project after delete
  slug: string;
}

function ConfirmSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="bg-red-600 text-white hover:bg-red-500">
      {pending ? "Deleting..." : "Delete report"}
    </Button>
  );
}

export default function DeleteReportButton({ reportId, slug }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="border border-red-500/40 bg-red-900/20 text-red-200 hover:bg-red-900/40"
      >
        <Trash2 className="size-4" />
        Delete
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1529] p-6 text-white shadow-xl">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-red-200">
              <TriangleAlert className="size-5" />
              Delete report
            </h2>
            <p className="mb-4 text-sm text-blue-100/80">
              This permanently deletes this report. This cannot be undone.
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
              <form method="POST" action={`/api/reports/${reportId}/delete`}>
                <input type="hidden" name="slug" value={slug} />
                <ConfirmSubmit />
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
