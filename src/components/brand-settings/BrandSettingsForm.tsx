import { useEffect, useState } from "react";
import { Building2, Image as ImageIcon, Save, Trash2 } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { brandSettingsSchema } from "@/lib/brand-settings/schema";

interface BrandInitial {
  agency_name: string;
  primary_color: string;
  secondary_color: string;
  logo: string | null;
}

interface Props {
  action: string;
  serverError?: string | null;
  initial?: Partial<BrandInitial>;
  updatedAt?: string | null;
}

const DEFAULTS: BrandInitial = {
  agency_name: "",
  primary_color: "#4f46e5",
  secondary_color: "#a855f7",
  logo: null,
};

type FieldErrors = Partial<Record<"agency_name" | "primary_color" | "secondary_color", string>>;

export default function BrandSettingsForm({ action, serverError, initial, updatedAt }: Props) {
  const merged = { ...DEFAULTS, ...initial };
  const [agencyName, setAgencyName] = useState(merged.agency_name);
  const [primaryColor, setPrimaryColor] = useState(merged.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(merged.secondary_color);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Logo preview: the existing stored logo, replaced by an object URL when the
  // user picks a file, cleared when they choose Remove.
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  const existingLogo = merged.logo;
  const previewSrc = filePreview ?? (removed ? null : existingLogo);

  // Revoke the object URL when it changes or on unmount to avoid a memory leak.
  useEffect(() => {
    if (!filePreview) return;
    return () => {
      URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFilePreview(URL.createObjectURL(file));
      setRemoved(false);
    } else {
      setFilePreview(null);
    }
  }

  function handleRemove() {
    setFilePreview(null);
    setRemoved(true);
  }

  function clearError(key: keyof FieldErrors) {
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = brandSettingsSchema.safeParse({
      agency_name: agencyName,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
    });
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
      action={action}
      encType="multipart/form-data"
      className="space-y-5"
      onSubmit={handleSubmit}
      noValidate
    >
      <FormField
        id="agency_name"
        label="Agency name"
        value={agencyName}
        onChange={(v) => {
          setAgencyName(v);
          clearError("agency_name");
        }}
        placeholder="Acme Agency"
        error={errors.agency_name}
        icon={<Building2 className="size-4" />}
      />

      <div className="grid grid-cols-2 gap-4">
        <ColorField
          id="primary_color"
          label="Primary color"
          value={primaryColor}
          onChange={(v) => {
            setPrimaryColor(v);
            clearError("primary_color");
          }}
          error={errors.primary_color}
        />
        <ColorField
          id="secondary_color"
          label="Secondary color"
          value={secondaryColor}
          onChange={(v) => {
            setSecondaryColor(v);
            clearError("secondary_color");
          }}
          error={errors.secondary_color}
        />
      </div>

      <div>
        <span className="text-foreground mb-1 block text-sm font-medium">Logo</span>
        <div className="flex items-center gap-4">
          <div className="border-border bg-muted flex size-20 items-center justify-center overflow-hidden rounded-lg border">
            {previewSrc ? (
              <img src={previewSrc} alt="Logo preview" className="max-h-full max-w-full object-contain" />
            ) : (
              <ImageIcon className="text-muted-foreground size-6" />
            )}
          </div>
          <div className="space-y-2">
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleFileChange}
              className="text-muted-foreground file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 block text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            {previewSrc && (
              <button
                type="button"
                onClick={handleRemove}
                className="text-destructive flex items-center gap-1 text-xs underline-offset-4 hover:underline"
              >
                <Trash2 className="size-3" />
                Remove logo
              </button>
            )}
            <p className="text-muted-foreground text-xs">PNG or JPEG, up to 512 KB.</p>
          </div>
        </div>
        {removed && <input type="hidden" name="remove_logo" value="1" />}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Saving..." icon={<Save className="size-4" />}>
        Save changes
      </SubmitButton>

      {updatedAt && <p className="text-muted-foreground text-center text-xs">Last saved {updatedAt}</p>}
    </form>
  );
}

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function ColorField({ id, label, value, onChange, error }: ColorFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-foreground mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent"
        />
        <input
          id={id}
          name={id}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder="#4f46e5"
          className={`bg-card text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 text-sm shadow-xs transition-colors focus-visible:ring-[3px] focus-visible:outline-none ${
            error
              ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
              : "border-input focus-visible:border-ring focus-visible:ring-ring/50"
          }`}
        />
      </div>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </div>
  );
}
