import { useState } from "react";
import { useFormStatus } from "react-dom";
import { User, Mail, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { pmContactSchema } from "@/lib/pm-contacts/schema";

interface Entry {
  id: string;
  name: string;
  email: string;
}

interface Props {
  entries: Entry[];
  serverError?: string | null;
}

type FieldErrors = Partial<Record<"name" | "email", string>>;

// Submit button sized for an inline row action; reads the pending state of its
// nearest ancestor <form>.
function RowSubmit({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} className="bg-purple-600 text-white hover:bg-purple-500">
      {pending ? pendingText : children}
    </Button>
  );
}

export default function PmContacts({ entries, serverError }: Props) {
  return (
    <div className="space-y-6">
      <AddForm serverError={serverError} />
      <ContactList entries={entries} />
    </div>
  );
}

function AddForm({ serverError }: { serverError?: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = pmContactSchema.safeParse({ name, email });
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
      action="/api/pm-contacts"
      className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl"
      onSubmit={handleSubmit}
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
      <ServerError message={serverError} />
      <SubmitButton pendingText="Adding..." icon={<Plus className="size-4" />}>
        Add contact
      </SubmitButton>
    </form>
  );
}

function ContactList({ entries }: { entries: Entry[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-blue-100/70">
        <p>No PM contacts yet.</p>
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{entry.name}</p>
        <p className="truncate text-sm text-blue-100/50">{entry.email}</p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-red-200">Delete?</span>
          <form method="POST" action={`/api/pm-contacts/${entry.id}/delete`}>
            <Button type="submit" size="sm" className="bg-red-600 text-white hover:bg-red-500">
              Confirm
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setConfirming(false);
            }}
            className="border border-white/20 bg-white/10 hover:bg-white/20"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onEdit}
            className="border border-white/20 bg-white/10 hover:bg-white/20"
          >
            <Pencil className="size-3" />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setConfirming(true);
            }}
            className="border border-red-500/40 bg-red-900/20 text-red-200 hover:bg-red-900/40"
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
  const [email, setEmail] = useState(entry.email);
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = pmContactSchema.safeParse({ name, email });
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
      action={`/api/pm-contacts/${entry.id}`}
      className="space-y-3 rounded-lg border border-purple-400/30 bg-white/10 p-4"
      onSubmit={handleSubmit}
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
        <RowSubmit pendingText="Saving...">
          <Save className="size-3" />
          Save
        </RowSubmit>
        <Button
          type="button"
          size="sm"
          onClick={onCancel}
          className="border border-white/20 bg-white/10 hover:bg-white/20"
        >
          <X className="size-3" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
