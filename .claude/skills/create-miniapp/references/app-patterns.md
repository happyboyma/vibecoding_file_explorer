# MiniApp 常用模式参考

## 深色主题 CSS 变量

备忘录风格（macOS 深色）：
```css
:root {
  --bg: #1c1c1e;          /* 页面背景 */
  --panel: #2c2c2e;       /* 侧栏/面板背景 */
  --item: #3a3a3c;        /* 列表项背景 */
  --item-active: #4a4a4e; /* 选中项背景 */
  --accent: #ffd60a;      /* 主题色（黄）可换：#0a84ff 蓝 / #30d158 绿 / #ff453a 红 / #bf5af2 紫 */
  --text: #f5f5f7;        /* 主文字 */
  --sub: #8e8e93;         /* 次要文字 */
  --border: #3a3a3c;      /* 分隔线 */
  --danger: #ff453a;      /* 危险/删除 */
  --ok: #30d158;          /* 成功/正常 */
  --warn: #ff9f0a;        /* 警告 */
}
```

浅色主题（应用市场风格）：
```css
:root {
  --bg: #f1f5ff;
  --panel: #fff;
  --accent: #6366f1;
  --text: #1e293b;
  --sub: #64748b;
  --border: #e2e8f0;
  --danger: #ef4444;
}
```

## 布局模式

### 侧栏 + 编辑区（备忘录、邮件、设置类）
```css
body { display: flex; height: 100vh; overflow: hidden; }
.sidebar { width: 280px; min-width: 280px; display: flex; flex-direction: column; }
.editor-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
```

### 单列滚动（文章、列表、仪表盘）
```css
body { min-height: 100vh; }
.header { position: sticky; top: 0; z-index: 100; }
.main { max-width: 960px; margin: 0 auto; padding: 24px; }
```

### 网格卡片（应用市场、图库、商品列表）
```css
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
```

## 数据模型

### 标准记录结构
```js
{
  id: genId(),           // 唯一 ID
  title: '',             // 主标题
  content: '',           // 正文/详情
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  // 可选扩展字段：
  dueAt: null,           // 截止时间
  tags: [],              // 标签
  status: 'active',      // 状态机
  priority: 0,           // 优先级
}
```

### ID 生成
```js
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
// 示例输出：'lv2abc3x4y'（时间戳+随机，约10位，碰撞概率极低）
```

## 自动保存（800ms 防抖）

```js
let saveTimer = null;

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  setStatus('saving', '等待保存…');
  saveTimer = setTimeout(async () => {
    const item = items.find(m => m.id === currentId);
    if (!item) return;
    // 从 UI 读取最新值
    item.title     = titleInput.value;
    item.content   = contentInput.value;
    item.updatedAt = new Date().toISOString();
    // 重新排序（最新更新排最前）
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    renderList();
    await saveItem(item);
  }, 800);
}

// 绑定到输入事件
titleInput.addEventListener('input', scheduleAutoSave);
contentInput.addEventListener('input', scheduleAutoSave);
```

## 状态指示器（保存状态点）

```html
<div class="status-bar">
  <div class="status-dot" id="statusDot"></div>
  <span id="statusText">就绪</span>
</div>
```
```css
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sub); }
.status-dot.saving { background: var(--accent); }
.status-dot.saved  { background: var(--ok); }
.status-dot.error  { background: var(--danger); }
```
```js
function setStatus(s, msg) {
  statusDot.className = 'status-dot' + (s !== 'idle' ? ' ' + s : '');
  statusText.textContent = msg;
}
```

## 截止时间处理

```js
function dueDiff(iso) { return iso ? new Date(iso) - new Date() : null; }

function dueClass(iso) {
  if (!iso) return '';
  const diff = dueDiff(iso);
  if (diff < 0)         return 'over';   // 已逾期
  if (diff < 86400000)  return 'warn';   // 24小时内
  return 'ok';
}

function formatDueShort(iso) {
  if (!iso) return null;
  const diff = dueDiff(iso);
  const abs = Math.abs(diff);
  const days  = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins  = Math.floor((abs % 3600000) / 60000);
  const parts = [];
  if (days > 0)  parts.push(days + ' 天');
  if (hours > 0) parts.push(hours + ' 小时');
  if (mins > 0 || !parts.length) parts.push(mins + ' 分钟');
  return (diff >= 0 ? '还有 ' : '逾期 ') + parts.join(' ');
}
```

## 移动端侧栏折叠

```css
@media (max-width: 600px) {
  .sidebar {
    position: absolute; z-index: 10; height: 100%; width: 100%;
    transform: translateX(0); transition: transform .25s;
  }
  .sidebar.hidden { transform: translateX(-100%); }
}
```
```js
// 打开记录时隐藏侧栏
document.getElementById('sidebar').classList.add('hidden');
// 返回按钮
document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('hidden');
});
```

## HTML 转义（防 XSS）

```js
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```
渲染用户内容时必须用 `escHtml()`，避免 XSS。

## 相对时间格式化

```js
function formatDate(iso) {
  const diff = Date.now() - new Date(iso);
  if (diff < 60000)    return '刚刚';
  if (diff < 3600000)  return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  return new Date(iso).toLocaleDateString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
```

## 应用扩展方向

基于备忘录模板，只需修改数据字段和编辑区 UI，即可快速派生：

| 应用类型 | 数据字段扩展 | UI 变化 |
|---|---|---|
| 待办清单 | `status: 'todo'/'done'` | 添加勾选框，列表分组 |
| 书签收藏 | `url`, `favicon`, `tags` | 标题改为链接，预览图 |
| 日记 | `mood`, `weather` | 按日期分组，心情图标 |
| 食谱 | `ingredients[]`, `steps[]` | 多区域编辑 |
| 密码本 | `username`, `password`（本地加密） | 密码显示/隐藏切换 |
| 联系人 | `phone`, `email`, `avatar` | 头像首字母圆形 |
