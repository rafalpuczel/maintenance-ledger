import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Link as LinkIcon } from "lucide-react";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (html: string) => void;
}

// A small WYSIWYG editor for an email body. Restricted to the formatting the
// sanitizer allows (bold/italic, bulleted/numbered lists, h2/h3, links). Output
// is plain HTML via editor.getHTML(); the parent mirrors it into a hidden input
// so the FormData submit path carries it, and the server re-sanitizes on save.
export function RichTextEditor({ id, label, value, onChange }: Props) {
  const editor = useEditor({
    // immediatelyRender: false is required under Astro SSR (the island hydrates
    // on the client; rendering eagerly on the server throws).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // Drop nodes/marks the email allowlist does not support so the toolbar
        // and output stay in lockstep with sanitizeBody.
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        code: false,
        strike: false,
      }),
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class:
          "min-h-32 w-full rounded-b-lg border border-t-0 border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 prose-email",
      },
    },
  });

  if (!editor) {
    return <div className="border-input bg-card min-h-32 w-full rounded-lg border" aria-hidden="true" />;
  }

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const promptLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (http, https, or mailto)", previous ?? "https://");
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="border-input bg-muted/40 flex flex-wrap gap-1 rounded-t-lg border p-1"
    >
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive("link")} onClick={promptLink}>
        <LinkIcon className="size-4" />
      </ToolbarButton>
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({ label, active, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`hover:bg-accent flex size-8 items-center justify-center rounded-md transition-colors ${
        active ? "bg-accent text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
