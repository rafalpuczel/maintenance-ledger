import { useState } from "react";
import { User, Mail, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSubmit } from "@/lib/ui/useSubmit";
import { toastSuccess, toastError, toastWarning } from "@/lib/ui/toast";
import { pmContactSchema } from "@/lib/pm-contacts/schema";

interface Entry {
  id: string;
  name: string;
  email: string;
}

interface Props {
  entries: Entry[];
}

type FieldErrors = Partial<Record<"name" | "email", string>>;

// Map an ActionError back onto the right field when the server tagged one;
// otherwise toast it. Returns the field errors to merge into local state.
function routeError(error: string, field?: string): FieldErrors {
  if (field === "name" || field === "email") {
    return { [field]: error };
  }
  toastError(error);
  return {};
}

export default function PmContacts({ entries }: Props) {
  // The island owns the collection: seeded from SSR props, patched from each
  // mutation's JSON response (no separate read fetch).
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
          <p>No PM contacts yet.</p>
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
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const { submit, pending } = useSubmit<Entry>();

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = pmContactSchema.safeParse({ name, email });
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
    fd.set("email", email);
    const res = await submit("/api/pm-contacts", fd);
    if (res.ok) {
      if (res.data) onAdded(res.data);
      toastSuccess(res.message);
      setName("");
      setEmail("");
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
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
        }}
        placeholder="Anna Kowalska"
        error={errors.name}
        icon={<User className="size-4" />}
      />
      <FormField
        id="email"
        type="email"
        label="Email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
        }}
        placeholder="anna@example.com"
        error={errors.email}
        icon={<Mail className="size-4" />}
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
            Add contact
          </span>
        )}
      </Button>
    </form>
  );
}

function ReadRow({ entry, onEdit, onDeleted }: { entry: Entry; onEdit: () => void; onDeleted: () => void }) {
  const { submit, pending } = useSubmit<{ id: string }>();

  async function handleDelete() {
    const res = await submit(`/api/pm-contacts/${entry.id}/delete`, {});
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
        <p className="text-muted-foreground truncate text-sm">{entry.email}</p>
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
          title="Delete contact?"
          description={`Remove ${entry.name} (${entry.email}) from the contact list.`}
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
  const [email, setEmail] = useState(entry.email);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { submit, pending } = useSubmit<Entry>();

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = pmContactSchema.safeParse({ name, email });
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
    fd.set("email", email);
    const res = await submit(`/api/pm-contacts/${entry.id}`, fd);
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
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
        }}
        error={errors.name}
        icon={<User className="size-4" />}
      />
      <FormField
        id={`email-${entry.id}`}
        name="email"
        type="email"
        label="Email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
        }}
        error={errors.email}
        icon={<Mail className="size-4" />}
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
