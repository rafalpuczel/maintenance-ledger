import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Package, FileText, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { pluginCatalogSchema } from "@/lib/plugins-catalog/schema";

interface Entry {
  id: string;
  name: string;
  notes: string | null;
}

interface Props {
  entries: Entry[];
  serverError?: string | null;
}

type FieldErrors = Partial<Record<"name" | "notes", string>>;

// Submit button sized for an inline row action; reads the pending state of its
// nearest ancestor <form>.
function RowSubmit({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}

export default function PluginCatalog({ entries, serverError }: Props) {
  return (
    <div className="space-y-6">
      <AddForm serverError={serverError} />
      <CatalogList entries={entries} />
    </div>
  );
}

function AddForm({ serverError }: { serverError?: string | null }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = pluginCatalogSchema.safeParse({ name, notes });
    if (!result.success) {
      e.preventDefault();
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        next[key] ??= issue.message;
      }
      setErrors(next);
    }
  }

  return (
    <form
      method="POST"
      action="/api/plugins-catalog"
      className="border-border bg-card space-y-4 rounded-xl border p-6 shadow-sm"
      onSubmit={handleSubmit}
      noValidate
    >
      <FormField
        id="name"
        label="Plugin name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
        }}
        placeholder="Akismet Anti-Spam"
        error={errors.name}
        icon={<Package className="size-4" />}
      />
      <FormField
        id="notes"
        label="Notes (optional)"
        value={notes}
        onChange={(v) => {
          setNotes(v);
        }}
        placeholder="e.g. licensed, auto-updates off"
        error={errors.notes}
        icon={<FileText className="size-4" />}
      />
      <ServerError message={serverError} />
      <SubmitButton pendingText="Adding..." icon={<Plus className="size-4" />}>
        Add plugin
      </SubmitButton>
    </form>
  );
}

function CatalogList({ entries }: { entries: Entry[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="border-border bg-card text-muted-foreground rounded-xl border border-dashed p-10 text-center">
        <p>No plugins in the catalog yet.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) =>
        editingId === entry.id ? (
          <li key={entry.id}>
            <EditRow
              entry={entry}
              onCancel={() => {
                setEditingId(null);
              }}
            />
          </li>
        ) : (
          <li key={entry.id}>
            <ReadRow
              entry={entry}
              onEdit={() => {
                setEditingId(entry.id);
              }}
            />
          </li>
        ),
      )}
    </ul>
  );
}

function ReadRow({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{entry.name}</p>
        {entry.notes && <p className="text-muted-foreground truncate text-sm">{entry.notes}</p>}
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-destructive text-sm">Delete?</span>
          <form method="POST" action={`/api/plugins-catalog/${entry.id}/delete`}>
            <Button type="submit" size="sm" variant="destructive">
              Confirm
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setConfirming(false);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
            <Pencil className="size-3" />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Trash2 className="size-3" />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function EditRow({ entry, onCancel }: { entry: Entry; onCancel: () => void }) {
  const [name, setName] = useState(entry.name);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = pluginCatalogSchema.safeParse({ name, notes });
    if (!result.success) {
      e.preventDefault();
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        next[key] ??= issue.message;
      }
      setErrors(next);
    }
  }

  return (
    <form
      method="POST"
      action={`/api/plugins-catalog/${entry.id}`}
      className="border-primary/40 bg-card space-y-3 rounded-lg border p-4 shadow-sm"
      onSubmit={handleSubmit}
      noValidate
    >
      <FormField
        id={`name-${entry.id}`}
        name="name"
        label="Plugin name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
        }}
        error={errors.name}
        icon={<Package className="size-4" />}
      />
      <FormField
        id={`notes-${entry.id}`}
        name="notes"
        label="Notes (optional)"
        value={notes}
        onChange={(v) => {
          setNotes(v);
        }}
        error={errors.notes}
        icon={<FileText className="size-4" />}
      />
      <div className="flex items-center gap-2">
        <RowSubmit pendingText="Saving...">
          <Save className="size-3" />
          Save
        </RowSubmit>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          <X className="size-3" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
