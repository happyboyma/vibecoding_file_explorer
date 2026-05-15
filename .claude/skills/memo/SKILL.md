---
name: memo
description: This skill should be used when the user asks to "查看备忘录", "列出备忘录", "读取备忘录", "新建备忘录", "创建备忘录", "删除备忘录", "更新备忘录", "搜索备忘录", "命令行操作备忘录", "生成备忘录应用", "部署备忘录", "备忘录增删改查", "用命令行增删改查备忘录", or anything related to the memo miniapp running at http://47.93.2.83/apps/%E5%A4%87%E5%BF%98%E5%BD%95/.
version: 0.1.0
---

# 备忘录 Skill

## 应用信息

- **线上地址**：`http://47.93.2.83/apps/%E5%A4%87%E5%BF%98%E5%BD%95/`
- **数据目录**：服务器 `/notes/`（每条备忘录存为 `<id>.json`）
- **数据结构**：`{ id, title, content, createdAt, updatedAt, dueAt }`

## 命令行 CRUD

使用 `scripts/memo_cli.py` 通过 HTTP API 增删改查，无需额外依赖。

```bash
SCRIPT=.claude/skills/memo/scripts/memo_cli.py

# 切换服务器（默认公网）
export MEMO_API=http://47.93.2.83    # 公网
export MEMO_API=http://localhost:3001 # 本地
export MEMO_DIR=/notes               # 数据目录（默认 /notes）
```

### 列出所有备忘录
```bash
python3 $SCRIPT list
```
输出：ID、更新时间、标题、截止状态（✅ 充裕 / ⚠️ 临近 / ❌ 逾期）

### 读取详情
```bash
python3 $SCRIPT read <id>
```

### 创建
```bash
python3 $SCRIPT create -t "标题" -c "正文"
python3 $SCRIPT create -t "项目截止" -c "完成报告" -d "2026-05-20T18:00"
python3 $SCRIPT create          # 交互式输入
```

### 更新
```bash
python3 $SCRIPT update <id> -t "新标题"
python3 $SCRIPT update <id> -c "新正文"
python3 $SCRIPT update <id> -d "2026-06-01T09:00"   # 设置截止时间
python3 $SCRIPT update <id> -d ""                    # 清除截止时间
```

### 删除
```bash
python3 $SCRIPT delete <id>      # 有确认提示
python3 $SCRIPT delete <id> -f   # 跳过确认
```

### 搜索
```bash
python3 $SCRIPT search "关键词"   # 全文搜索标题和正文
```

## 等价的原始 curl 命令

```bash
BASE=http://47.93.2.83

# 列出所有记录文件
curl -s "$BASE/api/ls?path=%2Fnotes"

# 读取单条记录
curl -s "$BASE/api/read?path=%2Fnotes%2F<id>.json" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['content'])"

# 创建/更新
curl -s -X POST "$BASE/api/save" \
  -H "Content-Type: application/json" \
  -d '{"path":"/notes/<id>.json","content":"{\"id\":\"<id>\",\"title\":\"标题\",\"content\":\"内容\",\"updatedAt\":\"2026-05-15T00:00:00.000Z\",\"dueAt\":null}"}'

# 删除
curl -s -X DELETE "$BASE/api/delete?path=%2Fnotes%2F<id>.json"
```

路径 URL 编码：`/notes/abc.json` → `%2Fnotes%2Fabc.json`

## 部署备忘录应用

如需重新部署或在新服务器部署备忘录应用，使用 `assets/index.html`（完整单文件应用）：

```bash
# 写到临时目录
mkdir -p /tmp/备忘录
cp .claude/skills/memo/assets/index.html /tmp/备忘录/

# 用 create-miniapp skill 的上传脚本上传
python3 .claude/skills/create-miniapp/scripts/upload_app.py /tmp/备忘录 备忘录
```

`assets/index.html` 包含：
- macOS 风格深色主题（`--accent: #ffd60a` 黄色）
- 侧栏列表 + 编辑区布局，移动端响应式
- 完整 CRUD + 自动保存（800ms 防抖）+ 搜索 + 截止时间

## 额外资源

- **`scripts/memo_cli.py`** — 完整 CRUD CLI（list/read/create/update/delete/search）
- **`scripts/memo.sh`** — Shell 快捷入口（`./memo.sh list`）
- **`assets/index.html`** — 备忘录应用完整源码（单文件，可直接部署）
