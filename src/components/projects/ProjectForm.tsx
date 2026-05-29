import { useState } from "react";
import { Building2, Globe, Hash, Mail, StickyNote, Type, User, Save } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
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
  serverError?: string | null;
  initial?: Partial<ProjectFormValues>;
  // edit mode sends the current slug so the server can redirect back on error
  returnSlug?: string;
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

export default function ProjectForm({ action, mode, serverError, initial, returnSlug }: Props) {
  const [values, setValues] = useState<ProjectFormValues>({ ...EMPTY, ...initial });
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [errors, setErrors] = useState<FieldErrors>({});

  function set<K extends keyof ProjectFormValues>(key: K, value: string) {
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const result = projectSchema.safeParse(values);
    if (!result.success) {
      e.preventDefault();
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ProjectFormValues;
        next[key] ??= issue.message;
      }
      setErrors(next);
    }
  }

  return (
    <form method="POST" action={action} className="space-y-4" onSubmit={handleSubmit} noValidate>
      {mode === "edit" && <input type="hidden" name="_return_slug" value={returnSlug ?? ""} />}

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

      <ServerError message={serverError} />

      <SubmitButton pendingText={mode === "create" ? "Creating..." : "Saving..."} icon={<Save className="size-4" />}>
        {mode === "create" ? "Create project" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
