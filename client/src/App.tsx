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

interface FavoriteItem {
  path: string;
  name: string;
  isDirectory: boolean;
  isApp: boolean;
}

export default function App() {
  const [lang, setLang] = useState<Lang>("zh");
  const t = translations[lang];

  // ── URL-driven state ──────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const routerNavigate = useNavigate();

  const currentPath = searchParams.get("dir")     || "/";
  const previewPath = searchParams.get("preview")  || null;
  const editPath    = searchParams.get("edit")     || null;
  const viewMode    = searchParams.get("view")     || null;

  const isInFavoritesView = viewMode === "favorites";

  // Track overlays opened during this session so we can use navigate(-1) safely
  const overlayDepth = useRef(0);

  const navigateTo = useCallback((path: string) => {
    overlayDepth.current = 0;
    setSearchParams({ dir: path });
  }, [setSearchParams]);

  const openFavorites = useCallback(() => {
    setSearchParams({ dir: currentPath, view: "favorites" });
  }, [currentPath, setSearchParams]);

  const closeFavorites = useCallback(() => {
    setSearchParams({ dir: currentPath });
  }, [currentPath, setSearchParams]);

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
  const [items, setItems]     = useState<FSEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  type SortField = "name" | "size" | "mtime";
  type SortDir   = "asc"  | "desc";
  const [sortBy,  setSortBy]  = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── Favorites (localStorage) ──────────────────────────────────────
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("fe_favorites") || "[]"); }
    catch { return []; }
  });

  // Per-directory custom order: { [dirPath]: itemName[] }
  const [orders, setOrders] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem("fe_orders") || "{}"); }
    catch { return {}; }
  });

  // ── Drag state ────────────────────────────────────────────────────
  const [dragSrc,    setDragSrc]    = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────
  function isFav(path: string) { return favorites.some(f => f.path === path); }

  function toggleFav(item: FavoriteItem) {
    setFavorites(prev => {
      const next = isFav(item.path)
        ? prev.filter(f => f.path !== item.path)
        : [...prev, item];
      localStorage.setItem("fe_favorites", JSON.stringify(next));
      return next;
    });
  }

  function cycleSort(field: SortField) {
    // Clear custom order when explicitly choosing a sort column
    if (orders[currentPath]) {
      setOrders(prev => {
        const next = { ...prev };
        delete next[currentPath];
        localStorage.setItem("fe_orders", JSON.stringify(next));
        return next;
      });
    }
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
  }

  function resetOrder() {
    setOrders(prev => {
      const next = { ...prev };
      delete next[currentPath];
      localStorage.setItem("fe_orders", JSON.stringify(next));
      return next;
    });
  }

  function sortIndicator(field: SortField) {
    if (orders[currentPath]) return null;
    if (sortBy !== field) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const fetchDir = useCallback(async (path: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.ls(path);
      setItems(data.items);
      if (data.path !== path) {
        setSearchParams({ dir: data.path }, { replace: true });
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [setSearchParams]);

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

  useEffect(() => { setSearchResults(null); setSearchQuery(""); }, [currentPath]);

  // ── Rename ────────────────────────────────────────────────────────
  const [renamingItem, setRenamingItem] = useState<string | null>(null);
  const [renameValue,  setRenameValue]  = useState("");

  const startRename = (name: string) => { setRenamingItem(name); setRenameValue(name); };

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
  const crumbs = (() => {
    const parts = currentPath.split("/").filter(Boolean);
    return [
      { label: t.root, path: "/" },
      ...parts.map((p, i) => ({
        label: p,
        path: "/" + parts.slice(0, i + 1).join("/"),
      })),
    ];
  })();

  // ── Display items (sort or custom order) ──────────────────────────
  const rawDisplay = searchResults ?? items;
  const customOrder = !searchResults ? orders[currentPath] : undefined;

  const displayItems: (FSEntry | SearchResult)[] = customOrder
    ? (() => {
        const byName = new Map(rawDisplay.map(i => [i.name, i]));
        const ordered: (FSEntry | SearchResult)[] = [];
        for (const name of customOrder) {
          const it = byName.get(name);
          if (it) { ordered.push(it); byName.delete(name); }
        }
        for (const it of byName.values()) ordered.push(it);
        return ordered;
      })()
    : [...rawDisplay].sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        let cmp = 0;
        if (sortBy === "name") {
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        } else if (sortBy === "size") {
          cmp = (("size" in a ? (a as FSEntry).size : 0)) - (("size" in b ? (b as FSEntry).size : 0));
        } else {
          const at = "mtime" in a ? new Date((a as FSEntry).mtime).getTime() : 0;
          const bt = "mtime" in b ? new Date((b as FSEntry).mtime).getTime() : 0;
          cmp = at - bt;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });

  // ── Drag handlers (need displayItems in scope) ────────────────────
  const canDrag = !searchResults && !isInFavoritesView;

  function handleDragStart(e: React.DragEvent, name: string) {
    e.dataTransfer.effectAllowed = "move";
    setDragSrc(name);
  }

  function handleDragOver(e: React.DragEvent, name: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragTarget(dragSrc !== name ? name : null);
  }

  function handleDrop(e: React.DragEvent, targetName: string) {
    e.preventDefault();
    if (!dragSrc || dragSrc === targetName) { setDragSrc(null); setDragTarget(null); return; }

    const currentList = displayItems.map(i => i.name);
    const fromIdx = currentList.indexOf(dragSrc);
    const toIdx   = currentList.indexOf(targetName);
    if (fromIdx === -1 || toIdx === -1) { setDragSrc(null); setDragTarget(null); return; }

    const newOrder = [...currentList];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragSrc);

    setOrders(prev => {
      const next = { ...prev, [currentPath]: newOrder };
      localStorage.setItem("fe_orders", JSON.stringify(next));
      return next;
    });
    setDragSrc(null);
    setDragTarget(null);
  }

  function handleDragEnd() { setDragSrc(null); setDragTarget(null); }

  // ── Counts ────────────────────────────────────────────────────────
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
          <button
            className={`btn btn-ghost${isInFavoritesView ? " btn-fav-active" : ""}`}
            onClick={() => isInFavoritesView ? closeFavorites() : openFavorites()}
          >
            ⭐ {lang === "zh" ? "收藏夹" : "Favorites"}
            {favorites.length > 0 && <span className="fav-count">{favorites.length}</span>}
          </button>
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
        {isInFavoritesView ? (
          <>
            <button className="crumb" onClick={closeFavorites}>🏠 {t.root}</button>
            <span className="sep">›</span>
            <button className="crumb current">⭐ {lang === "zh" ? "收藏夹" : "Favorites"}</button>
          </>
        ) : (
          <>
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
            {customOrder && (
              <button className="btn-reset-order" onClick={resetOrder}>
                {lang === "zh" ? "↺ 重置排序" : "↺ Reset Order"}
              </button>
            )}
          </>
        )}
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

        {/* ── Favorites view ── */}
        {isInFavoritesView ? (
          <div className="file-table">
            {favorites.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">⭐</span>
                <p>{lang === "zh"
                  ? "还没有收藏，悬停文件行后点击 ☆ 添加"
                  : "No favorites yet — hover a row and click ☆ to add."}</p>
              </div>
            ) : (
              <>
                <div className="file-table-header">
                  <div />
                  <div>{lang === "zh" ? "名称" : "Name"}</div>
                  <div />
                  <div style={{ textAlign: "right" }}>{lang === "zh" ? "路径" : "Path"}</div>
                  <div />
                </div>
                {favorites.map(fav => {
                  const appUrl = fav.isApp ? `/apps/${encodeURIComponent(fav.name)}/` : null;
                  return (
                    <div key={fav.path} className={`file-row ${fav.isApp ? "app-dir" : fav.isDirectory ? "dir" : "file"}`}>
                      <div className="cell-icon">
                        <FileIcon isDir={fav.isDirectory} isApp={fav.isApp} name={fav.name} />
                      </div>
                      <div className="cell-name">
                        <span
                          className={`name-text ${fav.isApp ? "app-clickable" : fav.isDirectory ? "" : "file-clickable"}`}
                          onClick={() => fav.isApp
                            ? window.open(appUrl!, "_blank")
                            : fav.isDirectory ? navigateTo(fav.path) : openPreview(fav.path)}
                        >
                          {fav.name}
                          {fav.isApp && <span className="app-badge">{lang === "zh" ? "应用" : "APP"}</span>}
                        </span>
                      </div>
                      <div className="cell-size" />
                      <div className="cell-date fav-path-cell">{fav.path}</div>
                      <div className="cell-actions">
                        <button
                          className="action-btn fav-btn fav-active"
                          onClick={() => toggleFav(fav)}
                          title={lang === "zh" ? "取消收藏" : "Remove from favorites"}
                        >★</button>
                        {!fav.isDirectory && (
                          <button className="action-btn" onClick={() => api.download(fav.path)}>{t.download}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        ) : (

          /* ── Regular file listing ── */
          <>
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
                  <div className="sortable-col" onClick={() => cycleSort("name")}>
                    {lang === "zh" ? "名称" : "Name"}{sortIndicator("name")}
                  </div>
                  <div className="sortable-col" style={{ justifyContent: "flex-end" }} onClick={() => cycleSort("size")}>
                    {lang === "zh" ? "大小" : "Size"}{sortIndicator("size")}
                  </div>
                  <div className="sortable-col" style={{ justifyContent: "flex-end" }} onClick={() => cycleSort("mtime")}>
                    {lang === "zh" ? "修改时间" : "Modified"}{sortIndicator("mtime")}
                  </div>
                  <div />
                </div>

                {displayItems.map((item) => {
                  const name     = item.name;
                  const isDir    = item.isDirectory;
                  const isApp    = (item as FSEntry).isApp ?? false;
                  const itemPath = searchResults
                    ? (item as SearchResult).path
                    : joinPath(currentPath, name);
                  const appUrl   = isApp ? `/apps/${encodeURIComponent(name)}/` : null;
                  const favItem: FavoriteItem = { path: itemPath, name, isDirectory: isDir, isApp };
                  const starred  = isFav(itemPath);
                  const isDragOver = canDrag && dragTarget === name;
                  const isDragging = canDrag && dragSrc === name;

                  return (
                    <div
                      key={itemPath}
                      className={`file-row ${isApp ? "app-dir" : isDir ? "dir" : "file"}${canDrag ? " draggable" : ""}${isDragging ? " dragging" : ""}${isDragOver ? " drag-over" : ""}`}
                      draggable={canDrag}
                      onDragStart={canDrag ? (e) => handleDragStart(e, name) : undefined}
                      onDragOver={canDrag ? (e) => handleDragOver(e, name) : undefined}
                      onDrop={canDrag ? (e) => handleDrop(e, name) : undefined}
                      onDragEnd={canDrag ? handleDragEnd : undefined}
                    >
                      <div
                        className="cell-icon"
                        title={canDrag ? (lang === "zh" ? "拖拽重新排序" : "Drag to reorder") : undefined}
                      >
                        <FileIcon isDir={isDir} isApp={isApp} name={name} />
                      </div>

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
                        <button
                          className={`action-btn fav-btn${starred ? " fav-active" : ""}`}
                          onClick={() => toggleFav(favItem)}
                          title={starred
                            ? (lang === "zh" ? "取消收藏" : "Remove from favorites")
                            : (lang === "zh" ? "添加到收藏" : "Add to favorites")}
                        >{starred ? "★" : "☆"}</button>
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
          </>
        )}
      </main>

      {/* ── Status bar ── */}
      {!loading && !isInFavoritesView && searchResults === null && (
        <footer className="status-bar">
          {lang === "zh"
            ? `${folderCount} 个文件夹，${fileCount} 个文件`
            : `${folderCount} folder${folderCount !== 1 ? "s" : ""}, ${fileCount} file${fileCount !== 1 ? "s" : ""}`}
        </footer>
      )}
      {isInFavoritesView && (
        <footer className="status-bar">
          {lang === "zh"
            ? `${favorites.length} 个收藏`
            : `${favorites.length} favorite${favorites.length !== 1 ? "s" : ""}`}
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
