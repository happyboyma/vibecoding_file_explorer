import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "./api";
import type { FSEntry, SearchResult } from "./api";
import translations from "./i18n";
import type { Lang } from "./i18n";
import Editor from "./Editor";
import Preview from "./Preview";
import "./App.css";

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function joinPath(base: string, name: string): string {
  return base === "/" ? `/${name}` : `${base}/${name}`;
}

function FileIcon({ isDir, isApp, name }: { isDir: boolean; isApp: boolean; name: string }) {
  if (isApp) return <span>🚀</span>;
  if (isDir) return <span>📁</span>;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "📕", png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", svg: "🖼️", webp: "🖼️",
    mp4: "🎬", mov: "🎬", avi: "🎬", mkv: "🎬",
    mp3: "🎵", wav: "🎵", flac: "🎵",
    zip: "🗜️", tar: "🗜️", gz: "🗜️", rar: "🗜️",
    js: "📜", ts: "📜", tsx: "📜", jsx: "📜",
    py: "🐍", go: "🐹", rs: "🦀",
    json: "📋", yaml: "📋", yml: "📋", toml: "📋",
    html: "🌐", htm: "🌐",
    md: "📝", txt: "📝", csv: "📊", xls: "📊", xlsx: "📊",
    doc: "📄", docx: "📄",
  };
  return <span>{map[ext] ?? "📄"}</span>;
}

export default function App() {
  const [lang, setLang] = useState<Lang>("zh");
  const t = translations[lang];

  // ── URL-driven state ──────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const routerNavigate = useNavigate();

  const currentPath  = searchParams.get("dir")     || "/";
  const previewPath  = searchParams.get("preview")  || null;
  const editPath     = searchParams.get("edit")     || null;

  // Track overlays opened during this session so we can use navigate(-1) safely
  const overlayDepth = useRef(0);

  const navigateTo = useCallback((path: string) => {
    overlayDepth.current = 0;
    setSearchParams({ dir: path });
  }, [setSearchParams]);

  const openPreview = useCallback((filePath: string) => {
    overlayDepth.current += 1;
    setSearchParams({ dir: currentPath, preview: filePath });
  }, [currentPath, setSearchParams]);

  const closeOverlay = useCallback(() => {
    if (overlayDepth.current > 0) {
      overlayDepth.current -= 1;
      routerNavigate(-1);
    } else {
      setSearchParams({ dir: currentPath }, { replace: true });
    }
  }, [currentPath, routerNavigate, setSearchParams]);

  const openEditor = useCallback((target: string) => {
    overlayDepth.current += 1;
    setSearchParams({ dir: currentPath, edit: target });
  }, [currentPath, setSearchParams]);

  // ── Directory data ────────────────────────────────────────────────
  const [items, setItems]   = useState<FSEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const fetchDir = useCallback(async (path: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.ls(path);
      setItems(
        data.items.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
      );
      // Sync URL if server normalised the path
      if (data.path !== path) {
        setSearchParams({ dir: data.path }, { replace: true });
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [setSearchParams]);

  // Reload whenever the directory URL param changes (including back/forward)
  useEffect(() => { fetchDir(currentPath); }, [currentPath]);   // eslint-disable-line

  // ── Search ────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching,     setSearching]     = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const results = await api.search(searchQuery, currentPath);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  };

  // Clear search results when directory changes
  useEffect(() => { setSearchResults(null); setSearchQuery(""); }, [currentPath]);

  // ── Rename ────────────────────────────────────────────────────────
  const [renamingItem, setRenamingItem] = useState<string | null>(null);
  const [renameValue,  setRenameValue]  = useState("");

  const startRename  = (name: string) => { setRenamingItem(name); setRenameValue(name); };

  const commitRename = async () => {
    if (!renamingItem || !renameValue.trim() || renameValue === renamingItem) {
      setRenamingItem(null); return;
    }
    try {
      await api.rename(joinPath(currentPath, renamingItem), renameValue.trim());
      setRenamingItem(null);
      fetchDir(currentPath);
    } catch (e: any) { alert(e?.response?.data?.error || e.message); }
  };

  // ── Delete ────────────────────────────────────────────────────────
  const handleDelete = async (name: string, itemPath: string, isDir: boolean) => {
    if (!confirm(t.confirmDelete(isDir ? "folder" : "file", name))) return;
    try {
      await api.delete(itemPath);
      if (!searchResults) fetchDir(currentPath);
      else setSearchResults((prev) => prev?.filter((r) => r.path !== itemPath) ?? null);
    } catch (e: any) { alert(e?.response?.data?.error || e.message); }
  };

  // ── New folder ────────────────────────────────────────────────────
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const handleMkdir = async () => {
    const name = newFolderName.trim();
    if (!name) { setNewFolderMode(false); return; }
    try {
      await api.mkdir(joinPath(currentPath, name));
      setNewFolderMode(false); setNewFolderName("");
      fetchDir(currentPath);
    } catch (e: any) { alert(e?.response?.data?.error || e.message); }
  };

  // ── Upload ────────────────────────────────────────────────────────
  const [mdConvertQueue, setMdConvertQueue] = useState<string[]>([]);
  const [converting,     setConverting]     = useState(false);
  const [convertToast,   setConvertToast]   = useState<{ msg: string; ok: boolean } | null>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    try {
      await api.upload(currentPath, e.target.files);
      fetchDir(currentPath);
      const mdFiles = files
        .filter((f) => f.name.endsWith(".md") || f.name.endsWith(".markdown"))
        .map((f) => joinPath(currentPath, f.name));
      if (mdFiles.length) setMdConvertQueue(mdFiles);
    } catch (err: any) { alert(err?.response?.data?.error || err.message); }
    finally { e.target.value = ""; }
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    try {
      await api.uploadFolder(currentPath, files);
      fetchDir(currentPath);
    } catch (err: any) { alert(err?.response?.data?.error || err.message); }
    finally { e.target.value = ""; }
  };

  const handleConvert = async (filePath: string) => {
    setConverting(true);
    try {
      const { name } = await api.convertMdToPdf(filePath);
      setConvertToast({ msg: t.convertSuccess(name), ok: true });
      fetchDir(currentPath);
    } catch (err: any) {
      setConvertToast({ msg: `${t.convertError}: ${err?.response?.data?.error || err.message}`, ok: false });
    } finally {
      setConverting(false);
      setMdConvertQueue((q) => q.slice(1));
    }
    setTimeout(() => setConvertToast(null), 4000);
  };

  const skipConvert = () => setMdConvertQueue((q) => q.slice(1));

  // ── Derived preview info ──────────────────────────────────────────
  const previewItem = previewPath
    ? items.find((item) => joinPath(currentPath, item.name) === previewPath) ?? null
    : null;
  const previewTarget = previewPath
    ? {
        path: previewPath,
        name: previewPath.split("/").filter(Boolean).pop() ?? "",
        size: previewItem?.size ?? 0,
      }
    : null;

  // ── Breadcrumbs ───────────────────────────────────────────────────
  const breadcrumbs = () => {
    const parts = currentPath.split("/").filter(Boolean);
    return [
      { label: t.root, path: "/" },
      ...parts.map((p, i) => ({
        label: p,
        path: "/" + parts.slice(0, i + 1).join("/"),
      })),
    ];
  };

  const crumbs      = breadcrumbs();
  const displayItems = searchResults ?? items;
  const fileCount   = items.filter((i) => !i.isDirectory).length;
  const folderCount = items.filter((i) => i.isDirectory).length;

  return (
    <div className="app">
      {/* ── Top header ── */}
      <header className="header">
        <div className="header-title">
          <span className="logo">🗂️</span>
          <span>{lang === "zh" ? "文件浏览器" : "Folder Explorer"}</span>
        </div>

        <div className="header-search">
          <input
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button className="search-btn" onClick={handleSearch} disabled={searching}>
            {searching ? "…" : "🔍"}
          </button>
          {searchResults && (
            <button className="clear-btn" onClick={() => { setSearchResults(null); setSearchQuery(""); }}>✕</button>
          )}
        </div>

        <div className="header-spacer" />

        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>↑ {t.upload}</button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
          <button className="btn btn-ghost" onClick={() => folderInputRef.current?.click()}>🚀 {lang === "zh" ? "上传应用" : "Upload App"}</button>
          <input ref={folderInputRef} type="file" hidden onChange={handleFolderUpload}
            // @ts-expect-error webkitdirectory is not in React types
            webkitdirectory="" mozdirectory="" />
          <button className="btn btn-primary" onClick={() => openEditor("new")}>✏️ {t.newDoc}</button>
          <button className="btn btn-ghost" onClick={() => { setNewFolderMode(true); setNewFolderName(""); }}>+ {t.newFolder}</button>
          <button className="btn btn-ghost" onClick={() => fetchDir(currentPath)}>↺</button>
          <button className="btn btn-lang" onClick={() => setLang((l) => l === "zh" ? "en" : "zh")}>{t.langToggle}</button>
        </div>
      </header>

      {/* ── Breadcrumb ── */}
      <nav className="breadcrumb-bar">
        {crumbs.map((b, i) => (
          <span key={b.path} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {i > 0 && <span className="sep">›</span>}
            <button
              className={`crumb ${i === crumbs.length - 1 ? "current" : ""}`}
              onClick={() => i < crumbs.length - 1 && navigateTo(b.path)}
            >
              {i === 0 && "🏠 "}{b.label}
            </button>
          </span>
        ))}
      </nav>

      {/* ── New folder bar ── */}
      {newFolderMode && (
        <div className="new-folder-bar">
          <span>📁</span>
          <input
            autoFocus placeholder={t.folderNamePlaceholder}
            value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleMkdir(); if (e.key === "Escape") setNewFolderMode(false); }}
          />
          <button className="btn-sm confirm" onClick={handleMkdir}>{t.create}</button>
          <button className="btn-sm" onClick={() => setNewFolderMode(false)}>{t.cancel}</button>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {/* ── Content ── */}
      <main className="content">
        {searchResults !== null && (
          <div className="search-banner">
            🔍 <strong>{searchResults.length}</strong>&nbsp;
            {t.searchResults(searchResults.length, searchQuery).replace(/^\d+ /, "")}
            &nbsp;—&nbsp;<em>{searchQuery}</em>
          </div>
        )}

        {loading ? (
          <div className="loading-wrap"><div className="spinner" />{t.loading}</div>
        ) : displayItems.length === 0 ? (
          <div className="file-table">
            <div className="empty-state">
              <span className="empty-icon">{searchResults !== null ? "🔍" : "📂"}</span>
              <p>{searchResults !== null ? t.noResults : t.empty}</p>
            </div>
          </div>
        ) : (
          <div className="file-table">
            <div className="file-table-header">
              <div />
              <div>{lang === "zh" ? "名称" : "Name"}</div>
              <div style={{ textAlign: "right" }}>{lang === "zh" ? "大小" : "Size"}</div>
              <div style={{ textAlign: "right" }}>{lang === "zh" ? "修改时间" : "Modified"}</div>
              <div />
            </div>

            {displayItems.map((item) => {
              const name     = item.name;
              const isDir    = item.isDirectory;
              const isApp    = (item as FSEntry).isApp ?? false;
              const itemPath = searchResults
                ? (item as SearchResult).path
                : joinPath(currentPath, name);
              // App URL rooted at /apps/:name/ for correct relative asset resolution
              const appUrl   = isApp ? `/apps/${encodeURIComponent(name)}/` : null;

              return (
                <div key={itemPath} className={`file-row ${isApp ? "app-dir" : isDir ? "dir" : "file"}`}>
                  <div className="cell-icon"><FileIcon isDir={isDir} isApp={isApp} name={name} /></div>

                  <div className="cell-name">
                    {renamingItem === name && !searchResults ? (
                      <input
                        autoFocus className="name-text"
                        value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingItem(null); }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className={`name-text ${isApp ? "app-clickable" : isDir ? "" : "file-clickable"}`}
                        onClick={() => isApp
                          ? window.open(appUrl!, "_blank")
                          : isDir ? navigateTo(itemPath) : openPreview(itemPath)}
                        title={isApp ? (lang === "zh" ? "点击启动应用" : "Click to launch app") : name}
                      >
                        {name}
                        {isApp && <span className="app-badge">{lang === "zh" ? "应用" : "APP"}</span>}
                      </span>
                    )}
                  </div>

                  <div className="cell-size">
                    {"size" in item ? (isDir ? "—" : formatSize((item as FSEntry).size)) : ""}
                  </div>
                  <div className="cell-date">
                    {"mtime" in item ? formatDate((item as FSEntry).mtime) : ""}
                  </div>

                  <div className="cell-actions">
                    {isApp && (
                      <button className="action-btn launch" onClick={() => window.open(appUrl!, "_blank")}>
                        {lang === "zh" ? "启动" : "Launch"}
                      </button>
                    )}
                    {isApp && (
                      <button className="action-btn" onClick={() => navigateTo(itemPath)}>
                        {lang === "zh" ? "浏览" : "Browse"}
                      </button>
                    )}
                    {!isDir && /\.(md|markdown)$/i.test(name) && (
                      <button className="action-btn edit" onClick={() => openEditor(itemPath)}>{t.edit}</button>
                    )}
                    {!isDir && (
                      <button className="action-btn" onClick={() => api.download(itemPath)}>{t.download}</button>
                    )}
                    {!searchResults && (
                      <button className="action-btn" onClick={() => startRename(name)}>{t.rename}</button>
                    )}
                    <button className="action-btn danger" onClick={() => handleDelete(name, itemPath, isDir)}>{t.delete}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Status bar ── */}
      {!loading && searchResults === null && (
        <footer className="status-bar">
          {lang === "zh"
            ? `${folderCount} 个文件夹，${fileCount} 个文件`
            : `${folderCount} folder${folderCount !== 1 ? "s" : ""}, ${fileCount} file${fileCount !== 1 ? "s" : ""}`}
        </footer>
      )}

      {/* ── File preview panel ── */}
      {previewTarget && (
        <Preview
          lang={lang}
          filePath={previewTarget.path}
          fileName={previewTarget.name}
          fileSize={previewTarget.size}
          onClose={closeOverlay}
          onEdit={/\.(md|markdown)$/i.test(previewTarget.name)
            ? () => {
                // Replace the preview history entry with the editor entry directly.
                // Calling closeOverlay() + openEditor() races because navigate(-1)
                // is async and fires after setSearchParams, wiping the editor URL.
                setSearchParams({ dir: currentPath, edit: previewTarget.path }, { replace: true });
              }
            : undefined}
          onDeleted={() => { closeOverlay(); fetchDir(currentPath); }}
        />
      )}

      {/* ── Rich text editor overlay ── */}
      {editPath !== null && (
        <Editor
          lang={lang}
          filePath={editPath === "new" ? null : editPath}
          currentDir={currentPath}
          onClose={closeOverlay}
          onSaved={() => fetchDir(currentPath)}
        />
      )}

      {/* ── MD→PDF conversion modal ── */}
      {mdConvertQueue.length > 0 && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-icon">📄 → 📕</div>
            <h3 className="modal-title">{t.convertTitle}</h3>
            <p className="modal-desc">{t.convertDesc(mdConvertQueue[0].split("/").pop()!)}</p>
            <div className="modal-actions">
              <button className="btn-modal primary" onClick={() => handleConvert(mdConvertQueue[0])} disabled={converting}>
                {converting ? t.converting : t.convertBtn}
              </button>
              <button className="btn-modal" onClick={skipConvert} disabled={converting}>{t.skipBtn}</button>
            </div>
            {mdConvertQueue.length > 1 && (
              <p className="modal-queue">
                {lang === "zh" ? `还有 ${mdConvertQueue.length - 1} 个文件待处理` : `${mdConvertQueue.length - 1} more file(s) pending`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {convertToast && (
        <div className={`toast ${convertToast.ok ? "toast-ok" : "toast-err"}`}>
          {convertToast.ok ? "✅" : "❌"} {convertToast.msg}
        </div>
      )}
    </div>
  );
}
