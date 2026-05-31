import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSubmit } from "@/lib/ui/useSubmit";
import { toastSuccess, toastError } from "@/lib/ui/toast";
import { clientNavigate } from "@/lib/ui/navigate";

interface Props {
  reportId: string;
  slug: string;
}

export default function DeleteReportButton({ reportId, slug }: Props) {
  const { submit, pending } = useSubmit<{ id: string }>();

  async function handleDelete() {
    const fd = new FormData();
    fd.set("slug", slug);
    const res = await submit(`/api/reports/${reportId}/delete`, fd);
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
      title="Delete report"
      description="This permanently deletes this report. This cannot be undone."
      confirmLabel="Delete report"
      variant="destructive"
      pending={pending}
      pendingLabel="Deleting..."
      onConfirm={() => void handleDelete()}
    />
  );
}
