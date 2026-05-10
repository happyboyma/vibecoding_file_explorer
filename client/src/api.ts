import axios from "axios";

export interface FSEntry {
  name: string;
  isDirectory: boolean;
  isApp: boolean;
  size: number;
  mtime: string;
}

export interface DirListing {
  path: string;
  items: FSEntry[];
}

export interface SearchResult {
  name: string;
  path: string;
  isDirectory: boolean;
}

export const api = {
  ls: (path: string) =>
    axios.get<DirListing>("/api/ls", { params: { path } }).then((r) => r.data),

  search: (q: string, path: string) =>
    axios
      .get<{ results: SearchResult[] }>("/api/search", { params: { q, path } })
      .then((r) => r.data.results),

  download: (path: string) => {
    const a = document.createElement("a");
    a.href = `/api/download?path=${encodeURIComponent(path)}`;
    a.click();
  },

  upload: (path: string, files: FileList) => {
    const form = new FormData();
    form.append("path", path);
    for (const f of Array.from(files)) form.append("files", f);
    return axios.post("/api/upload", form);
  },

  rename: (path: string, newName: string) =>
    axios.post("/api/rename", { path, newName }),

  delete: (path: string) =>
    axios.delete("/api/delete", { params: { path } }),

  mkdir: (path: string) => axios.post("/api/mkdir", { path }),

  convertMdToPdf: (path: string) =>
    axios
      .post<{ pdfPath: string; name: string }>("/api/convert/md-to-pdf", { path })
      .then((r) => r.data),

  readFile: (path: string) =>
    axios.get<{ content: string }>("/api/read", { params: { path } }).then((r) => r.data.content),

  saveFile: (path: string, content: string) =>
    axios.post("/api/save", { path, content }),

  uploadFolder: (destPath: string, files: File[]) => {
    const form = new FormData();
    form.append("destPath", destPath);
    for (const f of files) {
      form.append("files", f);
      form.append("relativePaths", f.webkitRelativePath || f.name);
    }
    return axios.post("/api/upload-folder", form);
  },
};
