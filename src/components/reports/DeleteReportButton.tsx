import { Trash2, TriangleAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
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

interface Props {
  reportId: string;
  // sent so the server can redirect back to the project after delete
  slug: string;
}

function ConfirmSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Deleting..." : "Delete report"}
    </Button>
  );
}

export default function DeleteReportButton({ reportId, slug }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="size-4" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">
            <TriangleAlert className="size-5" />
            Delete report
          </DialogTitle>
          <DialogDescription>This permanently deletes this report. This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <form method="POST" action={`/api/reports/${reportId}/delete`}>
            <input type="hidden" name="slug" value={slug} />
            <ConfirmSubmit />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
