import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubmit } from "@/lib/ui/useSubmit";
import { toastSuccess, toastError } from "@/lib/ui/toast";
import { clientNavigate } from "@/lib/ui/navigate";

interface Props {
  projectId: string;
  slug: string;
}

interface ReportRow {
  id: string;
}

// Create a report and navigate into its edit page (ClientRouter, no reload).
export default function NewReportButton({ projectId, slug }: Props) {
  const { submit, pending } = useSubmit<ReportRow>();

  async function handleClick() {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("slug", slug);
    const res = await submit("/api/reports", fd);
    if (res.ok) {
      toastSuccess(res.message);
      if (res.redirectTo) clientNavigate(res.redirectTo);
    } else {
      toastError(res.error);
    }
  }

  return (
    <Button type="button" disabled={pending} onClick={() => void handleClick()}>
      {pending ? (
        "Creating..."
      ) : (
        <>
          <FilePlus2 className="size-4" />
          New report
        </>
      )}
    </Button>
  );
}
