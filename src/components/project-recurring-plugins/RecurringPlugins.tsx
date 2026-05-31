import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Package, Plus, Trash2 } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";

interface RecurringEntry {
  id: string;
  name: string;
  notes: string | null;
}

interface CatalogEntry {
  id: string;
  name: string;
}

interface Props {
  projectId: string;
  slug: string;
  recurring: RecurringEntry[];
  catalog: CatalogEntry[];
  serverError?: string | null;
}

const ADD_ACTION = "/api/project-recurring-plugins";

export default function RecurringPlugins({ projectId, slug, recurring, catalog, serverError }: Props) {
  // Only offer catalog plugins not already on this project's list. The DB unique
  // constraint is the real guard; this just keeps the dropdown tidy.
  const attached = new Set(recurring.map((r) => r.name.toLowerCase()));
  const addable = catalog.filter((c) => !attached.has(c.name.toLowerCase()));

  return (
    <div className="space-y-6">
      <AddForm projectId={projectId} slug={slug} addable={addable} serverError={serverError} />
      <RecurringList recurring={recurring} slug={slug} />
    </div>
  );
}

function AddSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        "Adding..."
      ) : (
        <>
          <Plus className="size-4" />
          Add plugin
        </>
      )}
    </Button>
  );
}

function AddForm({
  projectId,
  slug,
  addable,
  serverError,
}: {
  projectId: string;
  slug: string;
  addable: CatalogEntry[];
  serverError?: string | null;
}) {
  const [pluginId, setPluginId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (pluginId === "" && name.trim() === "") {
      e.preventDefault();
      setError("Pick a plugin or enter a name");
    }
  }

  return (
    <form
      method="POST"
      action={ADD_ACTION}
      className="border-border bg-card space-y-4 rounded-xl border p-6 shadow-sm"
      onSubmit={handleSubmit}
      noValidate
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="slug" value={slug} />

      <div>
        <label htmlFor="plugin_id" className="text-foreground mb-1 block text-sm font-medium">
          Pick from catalog
        </label>
        <select
          id="plugin_id"
          name="plugin_id"
          value={pluginId}
          onChange={(e) => {
            setPluginId(e.target.value);
            if (error) setError(undefined);
          }}
          className="border-input bg-card text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <option value="">— Select a plugin —</option>
          {addable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-muted-foreground text-center text-xs">or add one not in the catalog</p>

      <FormField
        id="name"
        label="New plugin name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (error) setError(undefined);
        }}
        placeholder="Akismet Anti-Spam"
        error={error}
        icon={<Package className="size-4" />}
        hint={<p className="text-muted-foreground mt-1 text-xs">Adding a new name also saves it to the catalog.</p>}
      />

      <ServerError message={serverError} />
      <AddSubmit />
    </form>
  );
}

function RecurringList({ recurring, slug }: { recurring: RecurringEntry[]; slug: string }) {
  if (recurring.length === 0) {
    return (
      <div className="border-border bg-card text-muted-foreground rounded-xl border border-dashed p-10 text-center">
        <p>No recurring plugins yet.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {recurring.map((entry) => (
        <li key={entry.id}>
          <ReadRow entry={entry} slug={slug} />
        </li>
      ))}
    </ul>
  );
}

function ReadRow({ entry, slug }: { entry: RecurringEntry; slug: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{entry.name}</p>
        {entry.notes && <p className="text-muted-foreground truncate text-sm">{entry.notes}</p>}
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-destructive text-sm">Remove?</span>
          <form method="POST" action={`/api/project-recurring-plugins/${entry.id}/delete`}>
            <input type="hidden" name="slug" value={slug} />
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive shrink-0"
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Trash2 className="size-3" />
          Remove
        </Button>
      )}
    </div>
  );
}
