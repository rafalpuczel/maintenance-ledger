import { useState } from "react";
import { Building2, Globe, Hash, Mail, StickyNote, Type, User, Save } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { useSubmit } from "@/lib/ui/useSubmit";
import { toastSuccess, toastError } from "@/lib/ui/toast";
import { clientNavigate } from "@/lib/ui/navigate";
import { projectSchema } from "@/lib/projects/schema";
import { slugify } from "@/lib/projects/slug";

export interface ProjectFormValues {
  name: string;
  slug: string;
  url: string;
  contact_company: string;
  contact_name: string;
  contact_email: string;
  internal_notes: string;
}

interface Props {
  action: string;
  mode: "create" | "edit";
  initial?: Partial<ProjectFormValues>;
}

interface ProjectRow {
  slug: string;
}

const EMPTY: ProjectFormValues = {
  name: "",
  slug: "",
  url: "",
  contact_company: "",
  contact_name: "",
  contact_email: "",
  internal_notes: "",
};

type FieldErrors = Partial<Record<keyof ProjectFormValues, string>>;

export default function ProjectForm({ action, mode, initial }: Props) {
  const [values, setValues] = useState<ProjectFormValues>({ ...EMPTY, ...initial });
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [errors, setErrors] = useState<FieldErrors>({});
  const { submit, pending } = useSubmit<ProjectRow>();

  function set(key: keyof ProjectFormValues, value: string) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-suggest the slug from the name until the user edits the slug.
      if (key === "name" && !slugEdited) {
        next.slug = slugify(value);
      }
      return next;
    });
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = projectSchema.safeParse(values);
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ProjectFormValues;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    const fd = new FormData();
    for (const key of Object.keys(values) as (keyof ProjectFormValues)[]) {
      fd.set(key, values[key]);
    }
    const res = await submit(action, fd);
    if (res.ok) {
      toastSuccess(res.message);
      // Create lands on the new project; an edit may have changed the slug —
      // both navigate to the canonical detail URL returned by the route.
      if (res.redirectTo) clientNavigate(res.redirectTo);
    } else if (res.field) {
      setErrors((prev) => ({ ...prev, [res.field as keyof ProjectFormValues]: res.error }));
    } else {
      toastError(res.error);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <FormField
        id="name"
        label="Name"
        value={values.name}
        onChange={(v) => {
          set("name", v);
        }}
        placeholder="Acme Corp"
        error={errors.name}
        icon={<Type className="size-4" />}
      />
      <FormField
        id="slug"
        label="Slug"
        value={values.slug}
        onChange={(v) => {
          setSlugEdited(true);
          set("slug", v);
        }}
        placeholder="acme-corp"
        error={errors.slug}
        icon={<Hash className="size-4" />}
      />
      <FormField
        id="url"
        label="URL"
        value={values.url}
        onChange={(v) => {
          set("url", v);
        }}
        placeholder="https://acme.com"
        error={errors.url}
        icon={<Globe className="size-4" />}
      />
      <FormField
        id="contact_company"
        label="Contact company"
        value={values.contact_company}
        onChange={(v) => {
          set("contact_company", v);
        }}
        placeholder="Acme Inc"
        error={errors.contact_company}
        icon={<Building2 className="size-4" />}
      />
      <FormField
        id="contact_name"
        label="Contact name"
        value={values.contact_name}
        onChange={(v) => {
          set("contact_name", v);
        }}
        placeholder="Jane Doe"
        error={errors.contact_name}
        icon={<User className="size-4" />}
      />
      <FormField
        id="contact_email"
        label="Contact email"
        value={values.contact_email}
        onChange={(v) => {
          set("contact_email", v);
        }}
        placeholder="jane@acme.com"
        error={errors.contact_email}
        icon={<Mail className="size-4" />}
      />
      <FormField
        id="internal_notes"
        label="Internal notes"
        value={values.internal_notes}
        onChange={(v) => {
          set("internal_notes", v);
        }}
        placeholder="Agency-internal — not shown to the client"
        error={errors.internal_notes}
        icon={<StickyNote className="size-4" />}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <span className="flex items-center gap-2">
            <span className="border-primary-foreground/30 border-t-primary-foreground size-4 animate-spin rounded-full border-2" />
            {mode === "create" ? "Creating..." : "Saving..."}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Save className="size-4" />
            {mode === "create" ? "Create project" : "Save changes"}
          </span>
        )}
      </Button>
    </form>
  );
}
