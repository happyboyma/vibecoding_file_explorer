import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { marked } from "marked";
import puppeteer from "puppeteer";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

// Configurable root directory — override with ROOT_DIR env var
const ROOT_DIR = process.env.ROOT_DIR
  ? path.resolve(process.env.ROOT_DIR)
  : path.resolve(process.env.HOME || "/", "Projects");

app.use(cors());
app.use(express.json());

// Serve React build in production
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// Serve HTML mini-apps at /apps/:appName/* with proper relative URL resolution
app.get("/apps/:appName", (req, res, next) => {
  // Redirect bare name to trailing slash so relative URLs resolve correctly.
  // With Express strict:false, this route also matches /apps/:appName/ — call
  // next() in that case to avoid an infinite redirect loop.
  if (req.path.endsWith("/")) return next();
  res.redirect(301, `/apps/${req.params.appName}/`);
});

app.get("/apps/:appName/*", (req, res) => {
  const appName = req.params.appName;
  const filePath = (req.params as Record<string, string>)["0"] || "index.html";
  const fullPath = path.resolve(ROOT_DIR, appName, filePath);

  if (!fullPath.startsWith(ROOT_DIR + path.sep) && fullPath !== ROOT_DIR) {
    return res.status(403).send("Forbidden");
  }
  // Only serve directories that actually have an index.html (are apps)
  const appIndex = path.resolve(ROOT_DIR, appName, "index.html");
  if (!fs.existsSync(appIndex)) return res.status(404).send("App not found");

  try {
    res.sendFile(fullPath);
  } catch (err: any) {
    res.status(404).send(err.message);
  }
});

function resolveSafe(requestPath: string): string | null {
  const target = path.resolve(ROOT_DIR, requestPath.replace(/^\//, ""));
  if (!target.startsWith(ROOT_DIR)) return null; // path traversal guard
  return target;
}

// List directory contents
app.get("/api/ls", (req, res) => {
  const dir = resolveSafe((req.query.path as string) || "/");
  if (!dir) return res.status(403).json({ error: "Forbidden" });

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries.map((e) => {
      const fullPath = path.join(dir, e.name);
      let size = 0;
      let mtime = "";
      try {
        const stat = fs.statSync(fullPath);
        size = stat.size;
        mtime = stat.mtime.toISOString();
      } catch {}
      const isDirectory = e.isDirectory();
      const isApp = isDirectory &&
        fs.existsSync(path.join(fullPath, "index.html"));
      return {
        name: e.name,
        isDirectory,
        isApp,
        size,
        mtime,
      };
    });
    res.json({ path: dir.replace(ROOT_DIR, "") || "/", items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Search files recursively
app.get("/api/search", (req, res) => {
  const query = ((req.query.q as string) || "").toLowerCase();
  const startPath = resolveSafe((req.query.path as string) || "/");
  if (!startPath || !query) return res.status(400).json({ error: "Missing q or path" });

  const results: { name: string; path: string; isDirectory: boolean }[] = [];

  function walk(dir: string, depth = 0) {
    if (depth > 6) return; // limit depth
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.toLowerCase().includes(query)) {
        const fullPath = path.join(dir, e.name);
        results.push({
          name: e.name,
          path: fullPath.replace(ROOT_DIR, "") || "/",
          isDirectory: e.isDirectory(),
        });
      }
      if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
    }
  }

  walk(startPath);
  res.json({ results });
});

// Download a file
app.get("/api/download", (req, res) => {
  const filePath = resolveSafe((req.query.path as string) || "");
  if (!filePath) return res.status(403).json({ error: "Forbidden" });

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return res.status(400).json({ error: "Cannot download a directory" });
    res.download(filePath);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Upload files
const upload = multer({ dest: "/tmp/uploads/" });
app.post("/api/upload", upload.array("files"), (req, res) => {
  const destDir = resolveSafe((req.body.path as string) || "/");
  if (!destDir) return res.status(403).json({ error: "Forbidden" });

  const files = req.files as Express.Multer.File[];
  if (!files?.length) return res.status(400).json({ error: "No files" });

  try {
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of files) {
      const dest = path.join(destDir, file.originalname);
      fs.renameSync(file.path, dest);
    }
    res.json({ uploaded: files.map((f) => f.originalname) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Upload an entire folder preserving directory structure
const folderUpload = multer({ dest: "/tmp/folder-uploads/" });
app.post("/api/upload-folder", folderUpload.array("files"), (req, res) => {
  const destDir = resolveSafe((req.body.destPath as string) || "/");
  if (!destDir) return res.status(403).json({ error: "Forbidden" });

  const files = req.files as Express.Multer.File[];
  const relativePaths: string[] = Array.isArray(req.body.relativePaths)
    ? req.body.relativePaths
    : [req.body.relativePaths];

  if (!files?.length) return res.status(400).json({ error: "No files" });

  try {
    for (let i = 0; i < files.length; i++) {
      const relPath = relativePaths[i] ?? files[i].originalname;
      const target = path.resolve(destDir, relPath);
      if (!target.startsWith(ROOT_DIR)) continue; // skip traversal attempts
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(files[i].path, target);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Rename a file or folder
app.post("/api/rename", (req, res) => {
  const { path: oldRel, newName } = req.body;
  const oldPath = resolveSafe(oldRel);
  if (!oldPath || !newName || newName.includes("/")) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const newPath = path.join(path.dirname(oldPath), newName);
  if (!newPath.startsWith(ROOT_DIR)) return res.status(403).json({ error: "Forbidden" });

  try {
    fs.renameSync(oldPath, newPath);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a file or folder
app.delete("/api/delete", (req, res) => {
  const target = resolveSafe((req.query.path as string) || "");
  if (!target) return res.status(403).json({ error: "Forbidden" });

  try {
    fs.rmSync(target, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve file inline (for preview — no forced download)
app.get("/api/file", (req, res) => {
  const filePath = resolveSafe((req.query.path as string) || "");
  if (!filePath) return res.status(403).json({ error: "Forbidden" });
  try {
    fs.statSync(filePath);
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Read file content as text
app.get("/api/read", (req, res) => {
  const filePath = resolveSafe((req.query.path as string) || "");
  if (!filePath) return res.status(403).json({ error: "Forbidden" });
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save file content
app.post("/api/save", (req, res) => {
  const { path: relPath, content } = req.body;
  const filePath = resolveSafe(relPath);
  if (!filePath) return res.status(403).json({ error: "Forbidden" });
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Convert Markdown to PDF
app.post("/api/convert/md-to-pdf", async (req, res) => {
  const { path: relPath } = req.body;
  const mdPath = resolveSafe(relPath);
  if (!mdPath) return res.status(403).json({ error: "Forbidden" });

  if (!mdPath.endsWith(".md") && !mdPath.endsWith(".markdown")) {
    return res.status(400).json({ error: "Not a markdown file" });
  }

  const pdfPath = mdPath.replace(/\.(md|markdown)$/, ".pdf");

  try {
    const mdContent = fs.readFileSync(mdPath, "utf-8");
    const bodyHtml = await marked.parse(mdContent);

    const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 56px;
      line-height: 1.75;
      color: #1e293b;
      font-size: 15px;
    }
    h1 { font-size: 2em; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 32px; }
    h3 { font-size: 1.2em; margin-top: 24px; }
    h4, h5, h6 { margin-top: 16px; }
    p { margin: 12px 0; }
    a { color: #6366f1; text-decoration: none; }
    code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.88em;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    }
    pre {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      overflow-x: auto;
      margin: 16px 0;
    }
    pre code { background: none; padding: 0; font-size: 0.85em; }
    blockquote {
      border-left: 4px solid #6366f1;
      margin: 16px 0;
      padding: 8px 16px;
      color: #64748b;
      background: #f5f3ff;
      border-radius: 0 6px 6px 0;
    }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 14px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
    ul, ol { padding-left: 24px; margin: 12px 0; }
    li { margin: 4px 0; }
    img { max-width: 100%; border-radius: 6px; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;

    // Prefer a system-installed Chromium (self-manages its own shared libs).
    // Falls back to Puppeteer's bundled Chrome when none is found.
    const systemChrome = [
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
    ].find((p) => { try { return fs.existsSync(p); } catch { return false; } });

    const browser = await puppeteer.launch({
      ...(systemChrome ? { executablePath: systemChrome } : {}),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      printBackground: true,
    });
    await browser.close();

    const relPdfPath = pdfPath.replace(ROOT_DIR, "") || "/";
    res.json({ pdfPath: relPdfPath, name: path.basename(pdfPath) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new folder
app.post("/api/mkdir", (req, res) => {
  const { path: dirRel } = req.body;
  const dirPath = resolveSafe(dirRel);
  if (!dirPath) return res.status(403).json({ error: "Forbidden" });

  try {
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve React app for all non-API routes (SPA fallback)
if (fs.existsSync(clientDist)) {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Root directory: ${ROOT_DIR}`);
});
