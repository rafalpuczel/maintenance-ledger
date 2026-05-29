import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";

interface Props {
  projectId: string;
  projectName: string;
  // sent so the server can redirect back to this project on a failed delete
  slug: string;
}

function ConfirmSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      className="bg-red-600 text-white hover:bg-red-500 disabled:opacity-40"
    >
      {pending ? "Deleting..." : "Delete project"}
    </Button>
  );
}

export default function DeleteProjectButton({ projectId, projectName, slug }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === projectName;

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
              Delete project
            </h2>
            <p className="mb-4 text-sm text-blue-100/80">
              This permanently deletes <span className="font-semibold text-white">{projectName}</span>. This cannot be
              undone. Type the project name to confirm.
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
              }}
              placeholder={projectName}
              className="mb-4 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-red-400 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                }}
                className="border border-white/20 bg-white/10 hover:bg-white/20"
              >
                Cancel
              </Button>
              <form method="POST" action={`/api/projects/${projectId}/delete`}>
                <input type="hidden" name="_return_slug" value={slug} />
                <ConfirmSubmit disabled={!matches} />
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
