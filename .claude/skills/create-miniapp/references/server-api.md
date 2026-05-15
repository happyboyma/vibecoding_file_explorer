# 文件服务器 API 参考

应用运行在 `http://localhost:3001`（生产环境 `http://47.93.2.83`）。
MiniApp 内部使用相对路径调用 API，即 `/api/...`，无需写域名。

## 数据读写

### 列出目录
```
GET /api/ls?path=<目录路径>
```
响应：
```json
{
  "path": "/notes",
  "items": [
    { "name": "abc123.json", "isDirectory": false, "isApp": false, "size": 284, "mtime": "2024-01-15T10:30:00.000Z" }
  ]
}
```

### 读取文件内容
```
GET /api/read?path=<文件路径>
```
响应：
```json
{ "content": "文件的文本内容" }
```

### 保存文件
```
POST /api/save
Content-Type: application/json
{ "path": "/notes/abc123.json", "content": "要写入的文本内容" }
```
响应：`{ "ok": true }`

### 创建目录
```
POST /api/mkdir
Content-Type: application/json
{ "path": "/notes" }
```
幂等操作，目录已存在时不报错。

### 删除文件或目录
```
DELETE /api/delete?path=<路径>
```
目录会递归删除。

## 文件服务

### 内联预览文件（适合 img src / iframe src）
```
GET /api/file?path=<文件路径>
```

### 强制下载文件
```
GET /api/download?path=<文件路径>
```

## 上传

### 上传多个文件
```
POST /api/upload
Content-Type: multipart/form-data
字段: path（目标目录），files（多个文件）
```

### 上传整个文件夹
```
POST /api/upload-folder
Content-Type: multipart/form-data
字段: destPath（目标目录），files（文件列表），relativePaths（相对路径列表）
```

## 路径规则

- 所有路径均相对于 `ROOT_DIR`（默认 `~/Projects`）
- 路径以 `/` 开头，例如 `/notes/abc.json` 对应磁盘上的 `~/Projects/notes/abc.json`
- 服务器有路径穿透保护，不能访问 ROOT_DIR 之外的路径

## 典型数据存储模式

每条记录存储为一个独立的 JSON 文件，文件名 = 记录 ID：

```
/app-data-dir/
  abc123.json   → { id, title, content, updatedAt, ... }
  def456.json   → { id, title, content, updatedAt, ... }
```

读取所有记录：
```js
async function loadAll() {
  await fetch('/api/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path: DATA_DIR}) });
  const res  = await fetch('/api/ls?path=' + encodeURIComponent(DATA_DIR));
  const data = await res.json();
  const files = (data.items || []).filter(f => !f.isDirectory && f.name.endsWith('.json'));
  const records = await Promise.all(files.map(async f => {
    const r = await fetch('/api/read?path=' + encodeURIComponent(DATA_DIR + '/' + f.name));
    const d = await r.json();
    return JSON.parse(d.content);
  }));
  return records.filter(Boolean);
}
```

保存单条记录：
```js
async function saveRecord(record) {
  await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: DATA_DIR + '/' + record.id + '.json',
      content: JSON.stringify(record)
    })
  });
}
```

删除单条记录：
```js
async function deleteRecord(id) {
  await fetch('/api/delete?path=' + encodeURIComponent(DATA_DIR + '/' + id + '.json'), { method: 'DELETE' });
}
```
