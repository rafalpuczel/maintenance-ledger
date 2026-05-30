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
    <Button type="submit" disabled={pending} className="bg-purple-600 text-white hover:bg-purple-500">
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
      className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl"
      onSubmit={handleSubmit}
      noValidate
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="slug" value={slug} />

      <div>
        <label htmlFor="plugin_id" className="mb-1 block text-sm text-blue-100/80">
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
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
        >
          <option value="">— Select a plugin —</option>
          {addable.map((c) => (
            <option key={c.id} value={c.id} className="bg-slate-800">
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-center text-xs text-blue-100/40">or add one not in the catalog</p>

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
        hint={<p className="mt-1 text-xs text-blue-100/40">Adding a new name also saves it to the catalog.</p>}
      />

      <ServerError message={serverError} />
      <AddSubmit />
    </form>
  );
}

function RecurringList({ recurring, slug }: { recurring: RecurringEntry[]; slug: string }) {
  if (recurring.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-blue-100/70">
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{entry.name}</p>
        {entry.notes && <p className="truncate text-sm text-blue-100/50">{entry.notes}</p>}
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-red-200">Remove?</span>
          <form method="POST" action={`/api/project-recurring-plugins/${entry.id}/delete`}>
            <input type="hidden" name="slug" value={slug} />
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
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setConfirming(true);
          }}
          className="shrink-0 border border-red-500/40 bg-red-900/20 text-red-200 hover:bg-red-900/40"
        >
          <Trash2 className="size-3" />
          Remove
        </Button>
      )}
    </div>
  );
}
