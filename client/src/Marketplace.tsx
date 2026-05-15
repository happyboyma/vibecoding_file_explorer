import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import "./Marketplace.css";

interface AppDef {
  id: string;
  icon: string;
  name: string;
  nameCn: string;
  desc: string;
  descCn: string;
  category: "builtin" | "installed";
  color: string;
  action: () => void;
}

const ACCENT_COLORS = [
  "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

export default function Marketplace() {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [installedApps, setInstalledApps] = useState<AppDef[]>([]);
  const [category, setCategory] = useState<"all" | "builtin" | "installed">("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const builtinApps: AppDef[] = [
    {
      id: "file-explorer",
      icon: "🗂️",
      name: "File Explorer",
      nameCn: "文件管理器",
      desc: "Browse and manage files with sorting, search, drag-to-reorder, and preview.",
      descCn: "浏览和管理文件，支持排序、搜索、拖拽排序和文件预览。",
      category: "builtin",
      color: "#6366f1",
      action: () => navigate("/app/file-explorer"),
    },
    {
      id: "md-editor",
      icon: "✏️",
      name: "Markdown Editor",
      nameCn: "Markdown 编辑器",
      desc: "Create and edit rich Markdown documents with PDF export support.",
      descCn: "创建和编辑 Markdown 富文本文档，支持导出 PDF。",
      category: "builtin",
      color: "#8b5cf6",
      action: () => navigate("/app/file-explorer?edit=new"),
    },
  ];

  useEffect(() => {
    api.ls("/").then(data => {
      const apps: AppDef[] = data.items
        .filter(item => item.isApp)
        .map((item, i) => ({
          id: `installed-${item.name}`,
          icon: "🚀",
          name: item.name,
          nameCn: item.name,
          desc: `Web application`,
          descCn: `Web 应用`,
          category: "installed" as const,
          color: ACCENT_COLORS[i % ACCENT_COLORS.length],
          action: () => window.open(`/apps/${encodeURIComponent(item.name)}/`, "_blank"),
        }));
      setInstalledApps(apps);
    }).catch(() => {});
  }, []);

  const allApps = [...builtinApps, ...installedApps];

  const filtered = allApps.filter(app => {
    if (category === "builtin" && app.category !== "builtin") return false;
    if (category === "installed" && app.category !== "installed") return false;
    if (search) {
      const q = search.toLowerCase();
      if (!app.name.toLowerCase().includes(q) && !app.nameCn.includes(q) &&
          !app.desc.toLowerCase().includes(q) && !app.descCn.includes(q)) return false;
    }
    return true;
  });

  const tabs = [
    { id: "all",       label: lang === "zh" ? "全部" : "All" },
    { id: "builtin",   label: lang === "zh" ? "内置应用" : "Built-in" },
    ...(installedApps.length > 0
      ? [{ id: "installed", label: lang === "zh" ? "已安装" : "Installed" }]
      : []),
  ];

  return (
    <div className="mp">
      {/* ── Header ── */}
      <header className="mp-header">
        <div className="mp-brand">
          <div className="mp-logo-box">⚡</div>
          <div className="mp-brand-text">
            <div className="mp-title">{lang === "zh" ? "应用市场" : "App Marketplace"}</div>
            <div className="mp-subtitle">{lang === "zh" ? "探索并启动您的应用" : "Explore & launch your apps"}</div>
          </div>
        </div>

        <div className="mp-search-wrap">
          <div className="mp-search">
            <svg className="mp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              placeholder={lang === "zh" ? "搜索应用..." : "Search apps..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="mp-search-clear" onClick={() => setSearch("")}>✕</button>
            )}
          </div>
        </div>

        <button className="mp-lang" onClick={() => setLang(l => l === "zh" ? "en" : "zh")}>
          {lang === "zh" ? "EN" : "中"}
        </button>
      </header>

      {/* ── Hero ── */}
      {!search && category === "all" && (
        <div className="mp-hero">
          <div className="mp-hero-pill">{lang === "zh" ? "✨ 精选应用" : "✨ Featured"}</div>
          <div className="mp-hero-icon">🗂️</div>
          <div className="mp-hero-content">
            <h1>{lang === "zh" ? "文件管理器" : "File Explorer"}</h1>
            <p>
              {lang === "zh"
                ? "强大的文件浏览与管理工具，支持预览、编辑、拖拽排序和收藏夹"
                : "Powerful file browser with preview, editing, drag-to-reorder and favorites"}
            </p>
            <div className="mp-hero-actions">
              <button className="mp-hero-btn-primary" onClick={() => navigate("/app/file-explorer")}>
                {lang === "zh" ? "立即打开" : "Open Now"}
              </button>
              <button className="mp-hero-btn-ghost" onClick={() => navigate("/app/file-explorer?edit=new")}>
                {lang === "zh" ? "新建文档" : "New Doc"}
              </button>
            </div>
          </div>
          <div className="mp-hero-bg-circle mp-hero-circle-1" />
          <div className="mp-hero-bg-circle mp-hero-circle-2" />
        </div>
      )}

      {/* ── Category tabs ── */}
      <div className="mp-tabs-wrap">
        <div className="mp-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`mp-tab${category === tab.id ? " active" : ""}`}
              onClick={() => setCategory(tab.id as any)}
            >
              {tab.label}
              {tab.id !== "all" && (
                <span className="mp-tab-count">
                  {tab.id === "builtin" ? builtinApps.length : installedApps.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── App grid ── */}
      <main className="mp-body">
        {filtered.length === 0 ? (
          <div className="mp-empty">
            <div className="mp-empty-icon">🔍</div>
            <p>{lang === "zh" ? "没有找到相关应用" : "No apps found"}</p>
            {search && (
              <button className="mp-empty-clear" onClick={() => setSearch("")}>
                {lang === "zh" ? "清除搜索" : "Clear search"}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mp-section-header">
              <h2>{lang === "zh" ? "应用列表" : "Apps"}</h2>
              <span className="mp-section-count">
                {filtered.length} {lang === "zh" ? "个" : ""}
              </span>
            </div>

            <div className="mp-grid">
              {filtered.map(app => (
                <article
                  key={app.id}
                  className="mp-card"
                  onClick={app.action}
                  style={{ "--app-color": app.color } as React.CSSProperties}
                >
                  <div className="mp-card-icon-wrap">
                    <div className="mp-card-icon">{app.icon}</div>
                  </div>
                  <div className="mp-card-body">
                    <h3 className="mp-card-name">{lang === "zh" ? app.nameCn : app.name}</h3>
                    <p className="mp-card-desc">{lang === "zh" ? app.descCn : app.desc}</p>
                    <div className="mp-card-footer">
                      <span className="mp-card-badge">
                        {app.category === "builtin"
                          ? (lang === "zh" ? "内置" : "Built-in")
                          : (lang === "zh" ? "已安装" : "Installed")}
                      </span>
                      <button
                        className="mp-card-open"
                        onClick={e => { e.stopPropagation(); app.action(); }}
                      >
                        {lang === "zh" ? "打开" : "Open"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="mp-footer">
        {lang === "zh"
          ? `共 ${allApps.length} 个应用`
          : `${allApps.length} app${allApps.length !== 1 ? "s" : ""} total`}
      </footer>
    </div>
  );
}
