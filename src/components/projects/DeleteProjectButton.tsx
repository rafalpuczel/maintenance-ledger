import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  projectId: string;
  projectName: string;
  // sent so the server can redirect back to this project on a failed delete
  slug: string;
}

function ConfirmSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={disabled || pending}>
      {pending ? "Deleting..." : "Delete project"}
    </Button>
  );
}

export default function DeleteProjectButton({ projectId, projectName, slug }: Props) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === projectName;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) setTyped("");
      }}
    >
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
            Delete project
          </DialogTitle>
          <DialogDescription>
            This permanently deletes <span className="text-foreground font-semibold">{projectName}</span>. This cannot
            be undone. Type the project name to confirm.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="confirm-project-name" className="sr-only">
            Project name
          </Label>
          <Input
            id="confirm-project-name"
            type="text"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
            }}
            placeholder={projectName}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <form method="POST" action={`/api/projects/${projectId}/delete`}>
            <input type="hidden" name="_return_slug" value={slug} />
            <ConfirmSubmit disabled={!matches} />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
