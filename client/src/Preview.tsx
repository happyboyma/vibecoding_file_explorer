import { useEffect, useState } from "react";
import { marked } from "marked";
import { api } from "./api";
import translations from "./i18n";
import type { Lang } from "./i18n";
import "./Preview.css";

interface Props {
  lang: Lang;
  filePath: string;
  fileName: string;
  fileSize: number;
  onClose: () => void;
  onEdit?: () => void;
  onDeleted: () => void;
}

type FileKind = "image" | "video" | "audio" | "pdf" | "markdown" | "html" | "text" | "other";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogv"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "flac", "m4a", "ogg", "aac", "opus"]);
const TEXT_EXTS  = new Set(["txt", "json", "yaml", "yml", "toml", "xml",
                             "css", "js", "ts", "tsx", "jsx", "sh", "py", "go",
                             "rs", "java", "c", "cpp", "h", "csv", "env"]);

function getKind(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  if (TEXT_EXTS.has(ext)) return "text";
  return "other";
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function Preview({ lang, filePath, fileName, fileSize, onClose, onEdit, onDeleted }: Props) {
  const t = translations[lang];
  const kind = getKind(fileName);
  const [mdHtml, setMdHtml] = useState<string>("");
  const [textContent, setTextContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fileUrl = `/api/file?path=${encodeURIComponent(filePath)}`;

  useEffect(() => {
    if (kind === "markdown") {
      setLoading(true);
      api.readFile(filePath)
        .then(async (content) => {
          const html = await marked.parse(content);
          setMdHtml(html);
        })
        .catch(() => setError(t.editorLoadError))
        .finally(() => setLoading(false));
    } else if (kind === "text") {
      setLoading(true);
      api.readFile(filePath)
        .then((content) => setTextContent(content))
        .catch(() => setError(t.editorLoadError))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [filePath, kind, t.editorLoadError]);

  const handleDelete = async () => {
    if (!confirm(t.confirmDelete("file", fileName))) return;
    try {
      await api.delete(filePath);
      onDeleted();
    } catch (e: any) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  const ext = fileName.split(".").pop()?.toUpperCase() ?? "FILE";

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-panel" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="preview-header">
          <div className="preview-header-left">
            <span className="preview-ext-badge">{ext}</span>
            <div className="preview-title-wrap">
              <span className="preview-filename" title={fileName}>{fileName}</span>
              <span className="preview-size">{formatSize(fileSize)}</span>
            </div>
          </div>
          <div className="preview-header-right">
            {kind === "markdown" && onEdit && (
              <button className="preview-btn edit" onClick={onEdit}>{t.edit}</button>
            )}
            <button className="preview-btn download" onClick={() => api.download(filePath)}>
              {t.download}
            </button>
            <button className="preview-btn delete" onClick={handleDelete}>{t.delete}</button>
            <button className="preview-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="preview-body">
          {loading && <div className="preview-loading"><div className="spinner" />{t.loading}</div>}
          {error && <div className="preview-error">{error}</div>}

          {!loading && !error && kind === "image" && (
            <div className="preview-image-wrap">
              <img src={fileUrl} alt={fileName} className="preview-image" />
            </div>
          )}

          {!loading && !error && kind === "video" && (
            <div className="preview-media-wrap">
              <video
                className="preview-video"
                src={fileUrl}
                controls
                controlsList="nodownload"
                playsInline
              />
            </div>
          )}

          {!loading && !error && kind === "audio" && (
            <div className="preview-audio-wrap">
              <div className="preview-audio-icon">🎵</div>
              <p className="preview-audio-name">{fileName}</p>
              <audio
                className="preview-audio"
                src={fileUrl}
                controls
                controlsList="nodownload"
              />
            </div>
          )}

          {!loading && !error && kind === "pdf" && (
            <iframe
              className="preview-pdf"
              src={fileUrl}
              title={fileName}
            />
          )}

          {!loading && !error && kind === "html" && (
            <iframe
              className="preview-html"
              src={fileUrl}
              title={fileName}
              sandbox="allow-same-origin allow-popups"
            />
          )}

          {!loading && !error && kind === "markdown" && (
            <div
              className="preview-md"
              dangerouslySetInnerHTML={{ __html: mdHtml }}
            />
          )}

          {!loading && !error && kind === "text" && (
            <pre className="preview-text">{textContent}</pre>
          )}

          {!loading && !error && kind === "other" && (
            <div className="preview-other">
              <div className="preview-other-icon">📄</div>
              <p className="preview-other-name">{fileName}</p>
              <p className="preview-other-size">{formatSize(fileSize)}</p>
              <button className="preview-btn download lg" onClick={() => api.download(filePath)}>
                ↓ {t.download}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
