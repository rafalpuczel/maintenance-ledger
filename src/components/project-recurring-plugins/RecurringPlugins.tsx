import { useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSubmit } from "@/lib/ui/useSubmit";
import { toastSuccess, toastError, toastWarning } from "@/lib/ui/toast";

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
}

const ADD_ACTION = "/api/project-recurring-plugins";

export default function RecurringPlugins({ projectId, slug, recurring, catalog }: Props) {
  // The island owns the recurring list; the add route returns the full refreshed
  // list, a delete returns the removed id.
  const [list, setList] = useState<RecurringEntry[]>(recurring);

  // Only offer catalog plugins not already on this project's list. The DB unique
  // constraint is the real guard; this just keeps the dropdown tidy.
  const attached = new Set(list.map((r) => r.name.toLowerCase()));
  const addable = catalog.filter((c) => !attached.has(c.name.toLowerCase()));

  return (
    <div className="space-y-6">
      <AddForm
        projectId={projectId}
        slug={slug}
        addable={addable}
        onListChanged={(next) => {
          setList(next);
        }}
      />
      {list.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border border-dashed p-10 text-center">
          <p>No recurring plugins yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((entry) => (
            <li key={entry.id}>
              <ReadRow
                entry={entry}
                onRemoved={() => {
                  setList((prev) => prev.filter((e) => e.id !== entry.id));
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddForm({
  projectId,
  slug,
  addable,
  onListChanged,
}: {
  projectId: string;
  slug: string;
  addable: CatalogEntry[];
  onListChanged: (list: RecurringEntry[]) => void;
}) {
  const [pluginId, setPluginId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { submit, pending } = useSubmit<RecurringEntry[]>();

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pluginId === "" && name.trim() === "") {
      setError("Pick a plugin or enter a name");
      return;
    }

    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("slug", slug);
    fd.set("plugin_id", pluginId);
    fd.set("name", name);
    const res = await submit(ADD_ACTION, fd);
    if (res.ok) {
      if (res.data) onListChanged(res.data);
      toastSuccess(res.message);
      setPluginId("");
      setName("");
      setError(undefined);
    } else {
      // The add form's only typeable field is the name; surface inline there.
      setError(res.error);
    }
  }

  return (
    <form
      className="border-border bg-card space-y-4 rounded-xl border p-6 shadow-sm"
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
    >
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
    </form>
  );
}

function ReadRow({ entry, onRemoved }: { entry: RecurringEntry; onRemoved: () => void }) {
  const { submit, pending } = useSubmit<{ id: string }>();

  async function handleRemove() {
    const res = await submit(`/api/project-recurring-plugins/${entry.id}/delete`, {});
    if (res.ok) {
      onRemoved();
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
      <ConfirmDialog
        trigger={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive shrink-0"
          >
            <Trash2 className="size-3" />
            Remove
          </Button>
        }
        title="Remove plugin?"
        description={`Remove ${entry.name} from this project's recurring list.`}
        confirmLabel="Remove"
        variant="destructive"
        pending={pending}
        pendingLabel="Removing..."
        onConfirm={() => void handleRemove()}
      />
    </div>
  );
}
