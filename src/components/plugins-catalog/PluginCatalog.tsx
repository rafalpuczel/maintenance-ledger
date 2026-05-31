import { useState } from "react";
import { Package, FileText, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSubmit } from "@/lib/ui/useSubmit";
import { toastSuccess, toastError, toastWarning } from "@/lib/ui/toast";
import { pluginCatalogSchema } from "@/lib/plugins-catalog/schema";

interface Entry {
  id: string;
  name: string;
  notes: string | null;
}

interface Props {
  entries: Entry[];
}

type FieldErrors = Partial<Record<"name" | "notes", string>>;

function routeError(error: string, field?: string): FieldErrors {
  if (field === "name" || field === "notes") {
    return { [field]: error };
  }
  toastError(error);
  return {};
}

export default function PluginCatalog({ entries }: Props) {
  const [list, setList] = useState<Entry[]>(entries);
  const [editingId, setEditingId] = useState<string | null>(null);

  function upsert(entry: Entry) {
    setList((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id);
      if (idx === -1) return [...prev, entry].sort((a, b) => a.name.localeCompare(b.name));
      const next = [...prev];
      next[idx] = entry;
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  function remove(id: string) {
    setList((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-6">
      <AddForm onAdded={upsert} />
      {list.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border border-dashed p-10 text-center">
          <p>No plugins in the catalog yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((entry) =>
            editingId === entry.id ? (
              <li key={entry.id}>
                <EditRow
                  entry={entry}
                  onSaved={(e) => {
                    upsert(e);
                    setEditingId(null);
                  }}
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
                  onDeleted={() => {
                    remove(entry.id);
                  }}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function AddForm({ onAdded }: { onAdded: (entry: Entry) => void }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const { submit, pending } = useSubmit<Entry>();

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = pluginCatalogSchema.safeParse({ name, notes });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    const fd = new FormData();
    fd.set("name", name);
    fd.set("notes", notes);
    const res = await submit("/api/plugins-catalog", fd);
    if (res.ok) {
      if (res.data) onAdded(res.data);
      toastSuccess(res.message);
      setName("");
      setNotes("");
      setErrors({});
    } else {
      setErrors(routeError(res.error, res.field));
    }
  }

  return (
    <form
      className="border-border bg-card space-y-4 rounded-xl border p-6 shadow-sm"
      onSubmit={(e) => void handleSubmit(e)}
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
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <span className="flex items-center gap-2">
            <span className="border-primary-foreground/30 border-t-primary-foreground size-4 animate-spin rounded-full border-2" />
            Adding...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Plus className="size-4" />
            Add plugin
          </span>
        )}
      </Button>
    </form>
  );
}

function ReadRow({ entry, onEdit, onDeleted }: { entry: Entry; onEdit: () => void; onDeleted: () => void }) {
  const { submit, pending } = useSubmit<{ id: string }>();

  async function handleDelete() {
    const res = await submit(`/api/plugins-catalog/${entry.id}/delete`, {});
    if (res.ok) {
      onDeleted();
      if (res.warning) toastWarning(res.message);
      else toastSuccess(res.message);
    } else {
      toastError(res.error);
    }
  }

  return (
    <div className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{entry.name}</p>
        {entry.notes && <p className="text-muted-foreground truncate text-sm">{entry.notes}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
          <Pencil className="size-3" />
          Edit
        </Button>
        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive">
              <Trash2 className="size-3" />
              Delete
            </Button>
          }
          title="Delete plugin?"
          description={`Remove ${entry.name} from the catalog.`}
          confirmLabel="Delete"
          variant="destructive"
          pending={pending}
          pendingLabel="Deleting..."
          onConfirm={() => void handleDelete()}
        />
      </div>
    </div>
  );
}

function EditRow({
  entry,
  onSaved,
  onCancel,
}: {
  entry: Entry;
  onSaved: (entry: Entry) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(entry.name);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const { submit, pending } = useSubmit<Entry>();

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = pluginCatalogSchema.safeParse({ name, notes });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    const fd = new FormData();
    fd.set("name", name);
    fd.set("notes", notes);
    const res = await submit(`/api/plugins-catalog/${entry.id}`, fd);
    if (res.ok) {
      if (res.data) onSaved(res.data);
      toastSuccess(res.message);
    } else {
      setErrors(routeError(res.error, res.field));
    }
  }

  return (
    <form
      className="border-primary/40 bg-card space-y-3 rounded-lg border p-4 shadow-sm"
      onSubmit={(e) => void handleSubmit(e)}
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
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            "Saving..."
          ) : (
            <>
              <Save className="size-3" />
              Save
            </>
          )}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          <X className="size-3" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
