import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSubmit } from "@/lib/ui/useSubmit";
import { toastSuccess, toastError } from "@/lib/ui/toast";
import { clientNavigate } from "@/lib/ui/navigate";

interface Props {
  projectId: string;
  projectName: string;
  slug: string;
}

export default function DeleteProjectButton({ projectId, projectName }: Props) {
  const { submit, pending } = useSubmit<{ id: string }>();

  async function handleDelete() {
    const res = await submit(`/api/projects/${projectId}/delete`, {});
    if (res.ok) {
      toastSuccess(res.message);
      if (res.redirectTo) clientNavigate(res.redirectTo);
    } else {
      toastError(res.error);
    }
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="size-4" />
          Delete
        </Button>
      }
      title="Delete project"
      description={
        <>
          This permanently deletes <span className="text-foreground font-semibold">{projectName}</span>. This cannot be
          undone.
        </>
      }
      confirmLabel="Delete project"
      variant="destructive"
      confirmWord={projectName}
      pending={pending}
      pendingLabel="Deleting..."
      onConfirm={() => void handleDelete()}
    />
  );
}
