---
name: create-miniapp
description: This skill should be used when the user asks to "创建一个miniapp", "新建一个应用", "做一个web应用", "create a miniapp", "build a mini app", "做一个待办", "做一个工具应用", "add a new app to the marketplace", "写个小应用", "做个工具", or wants to build any self-contained web application that should appear in the app marketplace.
version: 0.4.0
---

# 创建 MiniApp

MiniApp 是部署在应用市场中的独立 Web 应用：
- 公网地址：`http://47.93.2.83/apps/<app-name>/`
- 本地地址：`http://localhost:3001/apps/<app-name>/`
- 服务器检测到文件夹内有 `index.html` 时，自动在市场中展示该应用

## 两种应用模式

### 模式 A：纯静态应用
不需要持久化数据，逻辑完全在浏览器端运行。
- 使用 `assets/template/`（三个文件：index.html、style.css、app.js）
- 适合：计算器、转换工具、游戏、可视化演示

### 模式 B：数据持久化应用
通过文件服务器 API 将数据存储为 JSON 文件，实现 CRUD。
- 单文件 `index.html`，CSS 和 JS 内联
- 数据存在服务器上，刷新页面不丢失
- 适合：待办清单、书签、日记、任何需要记录数据的应用
- 详细模式和代码模式见 `references/app-patterns.md`

## 工作流程

### 第一步：理解需求

明确以下信息：
- **应用类型**：是否需要持久化？需要哪些数据字段？
- **应用名称**：英文 kebab-case（如 `todo-app`、`color-picker`）
- **功能边界**：核心功能是什么

若用户未指定名称，根据功能推断一个英文 kebab-case 名称。

### 第二步：选择模板并实现

#### 模式 A（纯静态）

读取 `assets/template/` 下三个文件，替换占位符后实现逻辑：

| 占位符 | 替换为 |
|---|---|
| `APP_NAME` | 应用名称（中文或英文） |
| `APP_SUBTITLE` | 一句功能描述 |

在 `app.js` 的 `App.init(root)` 中实现应用逻辑，`style.css` 已内置 `.card`、`.btn-primary`、`.input` 等基础样式。

#### 模式 B（数据持久化，单文件）

从 `references/app-patterns.md` 获取所需代码片段（深色主题、自动保存、ID 生成、API 调用等），构建单文件 `index.html`。核心结构：

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>应用名</title>
  <style>/* 内联 CSS */</style>
</head>
<body>
  <!-- UI -->
  <script>
    const DATA_DIR = '/app-data-dir';
    // CRUD 逻辑
  </script>
</body>
</html>
```

服务器 API 速查（详见 `references/server-api.md`）：

```js
// 确保目录存在
await fetch('/api/mkdir', { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({path: DATA_DIR}) });

// 列出记录
const { items } = await (await fetch('/api/ls?path=' + encodeURIComponent(DATA_DIR))).json();

// 读取
const { content } = await (await fetch('/api/read?path=' + encodeURIComponent(DATA_DIR + '/id.json'))).json();

// 保存
await fetch('/api/save', { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ path: DATA_DIR + '/id.json', content: JSON.stringify(record) }) });

// 删除
await fetch('/api/delete?path=' + encodeURIComponent(DATA_DIR + '/id.json'), { method:'DELETE' });
```

### 第三步：写入本地文件

使用 Write 工具将文件写到临时目录，例如：
- 模式 A：`/tmp/<app-name>/index.html`、`style.css`、`app.js`
- 模式 B：`/tmp/<app-name>/index.html`（单文件）

### 第四步：上传到服务器

```bash
UPLOAD=.claude/skills/create-miniapp/scripts/upload_app.py

# 预览（不实际上传）
python3 $UPLOAD /tmp/<app-name> --dry-run

# 上传
python3 $UPLOAD /tmp/<app-name>

# 自定义应用名
python3 $UPLOAD /tmp/<app-name> <应用名称>

# 切换服务器
MEMO_API=http://localhost:3001 python3 $UPLOAD /tmp/<app-name>
```

### 第五步：验证

```bash
curl -s -o /dev/null -w "%{http_code}" http://47.93.2.83/apps/<app-name>/
# 应返回 200
```

告知用户：
- 应用地址：`http://47.93.2.83/apps/<app-name>/`
- 市场主页：`http://47.93.2.83/`（刷新后可见新应用）

## 设计原则

- **单文件优先**：模式 B 把 CSS/JS 内联，零依赖
- **相对路径**：API 调用用 `/api/...`，不写死域名
- **escHtml 必用**：渲染用户输入必须转义，防 XSS
- **自动保存**：800ms 防抖，停止输入后自动保存

## 额外资源

### 脚本
- **`scripts/upload_app.py`** — 上传本地文件夹到服务器（支持 `--dry-run`）

### 模板文件
- **`assets/template/`** — 简单静态应用模板（index.html、style.css、app.js）

### 参考文档
- **`references/server-api.md`** — 完整 API 端点文档与代码示例
- **`references/app-patterns.md`** — 深色主题、布局、自动保存、截止时间等常用模式
