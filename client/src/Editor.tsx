import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import translations from "./i18n";
import type { Lang } from "./i18n";
import "./Editor.css";

interface Props {
  lang: Lang;
  /** Existing file path to open, or null for a new document */
  filePath: string | null;
  /** Directory to save new files into */
  currentDir: string;
  onClose: () => void;
  onSaved: () => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";
type ExportState = "idle" | "exporting" | "error";

function ToolbarBtn({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`tb-btn ${active ? "active" : ""}`}
      disabled={disabled}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="tb-divider" />;
}

function extractBasename(fp: string): string {
  // Strip trailing slashes, split, take last segment, remove .md/.markdown extension
  const parts = fp.replace(/\/+$/, "").split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  return last.replace(/\.(md|markdown)$/i, "");
}

export default function Editor({ lang, filePath, currentDir, onClose, onSaved }: Props) {
  const t = translations[lang];
  const isNew = filePath === null;

  const [filename, setFilename] = useState(() =>
    isNew ? "" : extractBasename(filePath!)
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const filenameRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { languageClassPrefix: "language-" } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder: t.editorPlaceholder }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    onUpdate: () => setIsDirty(true),
  });

  // Load existing file content into editor
  useEffect(() => {
    if (!editor || isNew) return;
    api
      .readFile(filePath!)
      .then((content) => {
        editor.commands.setContent(content);
        setIsDirty(false);
      })
      .catch(() => setLoadError(t.editorLoadError));
  }, [editor, filePath, isNew, t.editorLoadError]);

  const getFilePath = useCallback(() => {
    const name = filename.trim();
    if (!name) return null;
    const base = isNew ? currentDir : filePath!.substring(0, filePath!.lastIndexOf("/")) || "/";
    return `${base === "/" ? "" : base}/${name}.md`;
  }, [filename, isNew, currentDir, filePath]);

  const save = useCallback(async (): Promise<string | null> => {
    if (!editor) return null;
    const path = getFilePath();
    if (!path) {
      showToast(t.editorFilenameRequired, false);
      filenameRef.current?.focus();
      return null;
    }
    setSaveState("saving");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md: string = (editor.storage as any).markdown.getMarkdown();
      await api.saveFile(path, md);
      setSaveState("saved");
      setIsDirty(false);
      onSaved();
      setTimeout(() => setSaveState("idle"), 2000);
      return path;
    } catch {
      setSaveState("error");
      showToast(t.editorSaveError, false);
      return null;
    }
  }, [editor, getFilePath, onSaved, t]);

  const exportMd = useCallback(() => {
    if (!editor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md: string = (editor.storage as any).markdown.getMarkdown();
    const name = (filename.trim() || "document") + ".md";
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, [editor, filename]);

  const exportPdf = useCallback(async () => {
    const savedPath = await save();
    if (!savedPath) return;
    setExportState("exporting");
    try {
      const { name } = await api.convertMdToPdf(savedPath);
      showToast(t.convertSuccess(name), true);
    } catch {
      showToast(t.editorPdfError, false);
    } finally {
      setExportState("idle");
    }
  }, [save, t]);

  const handleClose = useCallback(() => {
    if (isDirty && !confirm(t.editorConfirmClose)) return;
    onClose();
  }, [isDirty, onClose, t.editorConfirmClose]);

  // Keyboard shortcut: Ctrl/Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  const saveLabel =
    saveState === "saving"
      ? t.editorSaving
      : saveState === "saved"
      ? `✓ ${t.editorSaved}`
      : t.editorSave;

  if (!editor) return null;

  return (
    <div className="editor-overlay">
      {/* ── Header ── */}
      <div className="editor-header">
        <div className="editor-header-left">
          <span className="editor-logo">✏️</span>
          <input
            ref={filenameRef}
            className="editor-filename"
            value={filename}
            onChange={(e) => { setFilename(e.target.value); setIsDirty(true); }}
            placeholder={t.editorFilenamePlaceholder}
            spellCheck={false}
          />
          <span className="editor-ext">.md</span>
          {isDirty && <span className="editor-dirty-dot" title={t.editorUnsaved} />}
        </div>
        <div className="editor-header-right">
          <button
            className={`editor-action-btn save ${saveState === "saved" ? "saved" : ""}`}
            onClick={save}
            disabled={saveState === "saving"}
          >
            {saveLabel}
          </button>
          <button className="editor-action-btn md" onClick={exportMd}>
            {t.editorExportMd}
          </button>
          <button
            className="editor-action-btn pdf"
            onClick={exportPdf}
            disabled={exportState === "exporting"}
          >
            {exportState === "exporting" ? t.editorExportingPdf : t.editorExportPdf}
          </button>
          <button className="editor-close-btn" onClick={handleClose} title={t.editorClose}>
            ✕
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="editor-toolbar">
        {/* History */}
        <ToolbarBtn title={t.tbUndo} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↩</ToolbarBtn>
        <ToolbarBtn title={t.tbRedo} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↪</ToolbarBtn>
        <Divider />

        {/* Headings */}
        <ToolbarBtn title={t.tbH1} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarBtn>
        <ToolbarBtn title={t.tbH2} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarBtn>
        <ToolbarBtn title={t.tbH3} active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarBtn>
        <Divider />

        {/* Inline formatting */}
        <ToolbarBtn title={t.tbBold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><b>{t.tbLabelBold}</b></ToolbarBtn>
        <ToolbarBtn title={t.tbItalic} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><i>{t.tbLabelItalic}</i></ToolbarBtn>
        <ToolbarBtn title={t.tbUnderline} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>{t.tbLabelUnderline}</u></ToolbarBtn>
        <ToolbarBtn title={t.tbStrike} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>{t.tbLabelStrike}</s></ToolbarBtn>
        <ToolbarBtn title={t.tbHighlight} active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>▌</ToolbarBtn>
        <ToolbarBtn title={t.tbCode} active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>{t.tbLabelCode}</ToolbarBtn>
        <Divider />

        {/* Alignment */}
        <ToolbarBtn title={t.tbAlignLeft} active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>{t.tbAlignLeft}</ToolbarBtn>
        <ToolbarBtn title={t.tbAlignCenter} active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>{t.tbAlignCenter}</ToolbarBtn>
        <ToolbarBtn title={t.tbAlignRight} active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>{t.tbAlignRight}</ToolbarBtn>
        <Divider />

        {/* Lists */}
        <ToolbarBtn title={t.tbBulletList} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</ToolbarBtn>
        <ToolbarBtn title={t.tbOrderedList} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1≡</ToolbarBtn>
        <Divider />

        {/* Block */}
        <ToolbarBtn title={t.tbBlockquote} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>{t.tbLabelBlockquote}</ToolbarBtn>
        <ToolbarBtn title={t.tbCodeBlock} active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>⌨</ToolbarBtn>
        <ToolbarBtn title={t.tbHr} onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</ToolbarBtn>
      </div>

      {/* ── Editor area ── */}
      <div className="editor-body">
        {loadError ? (
          <div className="editor-load-error">{loadError}</div>
        ) : (
          <EditorContent editor={editor} className="editor-content" />
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`editor-toast ${toast.ok ? "ok" : "err"}`}>
          {toast.ok ? "✅" : "❌"} {toast.msg}
        </div>
      )}
    </div>
  );
}
