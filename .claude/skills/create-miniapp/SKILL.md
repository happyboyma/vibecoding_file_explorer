---
name: create-miniapp
description: This skill should be used when the user asks to "创建一个miniapp", "新建一个应用", "做一个web应用", "生成备忘录", "创建备忘录", "做一个笔记应用", "create a miniapp", "build a mini app", "做一个待办", "做一个工具应用", "add a new app to the marketplace", "写个小应用", "做个记录工具", or wants to build any self-contained web application that should appear in the app marketplace.
version: 0.2.0
---

# 创建 MiniApp

MiniApp 是部署在应用市场中的独立 Web 应用：
- 存放路径：`/home/happym/Projects/<app-name>/index.html`
- 访问地址：`http://47.93.2.83/apps/<app-name>/`（或 `http://localhost:3001/apps/<app-name>/`）
- 服务器检测到文件夹内有 `index.html` 时，自动在市场中展示该应用

## 两种应用模式

### 模式 A：纯静态应用
不需要持久化数据，逻辑完全在浏览器端运行。
- 使用 `assets/template/`（三个文件：index.html、style.css、app.js）
- 适合：计算器、转换工具、游戏、可视化演示

### 模式 B：数据持久化应用（推荐，功能更强）
通过文件服务器 API 将数据存储为 JSON 文件，实现 CRUD。
- 单文件 `index.html`，CSS 和 JS 内联
- 数据存在服务器上，刷新页面不丢失
- 适合：备忘录、待办清单、书签、日记、任何需要记录数据的应用
- 参考模板：`assets/memo-example/index.html`（完整可运行的备忘录应用）

## 工作流程

### 第一步：理解需求

明确以下信息：
- **应用类型**：是否需要持久化？需要哪些字段？
- **应用名称**：英文 kebab-case（如 `todo-app`、`my-notes`）
- **功能边界**：核心功能是什么，不需要什么

若用户未指定名称，根据功能推断一个英文 kebab-case 名称。

### 第二步：创建目录

```bash
mkdir -p /home/happym/Projects/<app-name>
```

### 第三步：选择模板并实现

#### 使用备忘录模板（模式 B，数据持久化）

读取 `assets/memo-example/index.html`，该文件是完整的备忘录应用模板，包含：
- macOS 风格深色主题
- 侧栏列表 + 编辑区布局
- 完整的 CRUD 实现（创建/读取/更新/删除）
- 自动保存（800ms 防抖）
- 搜索过滤
- 截止时间支持（可选）
- 移动端响应式

**替换以下占位符**（全局替换）：

| 占位符 | 替换为 | 示例 |
|---|---|---|
| `APP_TITLE` | 应用标题 | `待办清单` |
| `APP_ICON` | 表情图标 | `✅` |
| `APP_ITEM_NAME` | 单条记录的称呼 | `待办事项` |
| `APP_DATA_DIR` | 数据存储目录（无斜杠前缀） | `todo-data` |

**然后根据需求定制**：
- 修改 `--accent` CSS 变量换主题色
- 在编辑区添加应用特有的字段（状态、标签、优先级等）
- 调整列表项渲染逻辑

#### 使用简单模板（模式 A，纯静态）

将 `assets/template/` 三个文件复制到目标目录，将 `APP_NAME`、`APP_SUBTITLE` 替换为实际值，在 `app.js` 中实现逻辑。

### 第四步：写入文件

```bash
# 将完整 HTML 内容写入
cat > /home/happym/Projects/<app-name>/index.html << 'HTMLEOF'
...完整 HTML 内容...
HTMLEOF
```

或使用 Write 工具直接写文件。

### 第五步：验证

```bash
# 确认文件存在
ls -la /home/happym/Projects/<app-name>/

# 如果服务在运行，检查可访问性
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/apps/<app-name>/
```

告知用户：
- 本地地址：`http://localhost:3001/apps/<app-name>/`
- 公网地址：`http://47.93.2.83/apps/<app-name>/`
- 刷新应用市场主页可见到新应用

## 服务器 API 速查

详细文档见 `references/server-api.md`。核心接口：

```js
const DATA_DIR = '/my-app-data';  // 数据目录（相对 ROOT_DIR）

// 确保目录存在（幂等）
await fetch('/api/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path: DATA_DIR}) });

// 列出所有记录文件
const res = await fetch('/api/ls?path=' + encodeURIComponent(DATA_DIR));
const { items } = await res.json();

// 读取单个记录
const r = await fetch('/api/read?path=' + encodeURIComponent(DATA_DIR + '/abc.json'));
const { content } = await r.json();
const record = JSON.parse(content);

// 保存记录
await fetch('/api/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: DATA_DIR + '/abc.json', content: JSON.stringify(record) })
});

// 删除记录
await fetch('/api/delete?path=' + encodeURIComponent(DATA_DIR + '/abc.json'), { method: 'DELETE' });
```

## 设计原则

- **单文件优先**：模式 B 把 CSS/JS 内联到 `index.html`，零依赖，直接可运行
- **相对路径**：API 调用用 `/api/...`，资源引用用 `./`，不写死域名
- **深色主题默认**：备忘录模板使用 macOS 深色，主题色通过 `--accent` 变量控制
- **escHtml 必用**：所有渲染用户输入的地方必须用 `escHtml()` 防 XSS
- **自动保存**：800ms 防抖，用户停止输入后自动保存，无需手动点保存
- **移动端**：侧栏布局在窄屏时用 `position: absolute + transform` 做抽屉效果

## 额外资源

### 模板文件
- **`assets/memo-example/index.html`** — 完整备忘录应用（可运行，直接改名复用）
- **`assets/template/index.html`** — 简单静态应用模板（含 style.css、app.js）

### 参考文档
- **`references/server-api.md`** — 完整 API 端点文档、代码示例
- **`references/app-patterns.md`** — 深色主题、布局、自动保存、截止时间等常用模式

### 备忘录应用线上地址
- `http://47.93.2.83/apps/%E5%A4%87%E5%BF%98%E5%BD%95/`（可参考实际效果）
