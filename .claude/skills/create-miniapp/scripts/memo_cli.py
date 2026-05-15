#!/usr/bin/env python3
"""
备忘录命令行 CRUD 工具

用法:
  python3 memo_cli.py list                          列出所有备忘录
  python3 memo_cli.py read <id>                     读取备忘录详情
  python3 memo_cli.py create -t "标题" -c "内容"   创建备忘录
  python3 memo_cli.py update <id> -t "标题"        更新标题/内容/截止时间
  python3 memo_cli.py delete <id> [-f]              删除备忘录（-f 跳过确认）
  python3 memo_cli.py search <关键词>               搜索备忘录

环境变量:
  MEMO_API=http://47.93.2.83   服务器地址（默认公网地址）
  MEMO_DIR=/notes              数据目录（默认 /notes）
"""

import json, sys, time, random, string, argparse, os
from urllib import request, parse, error
from datetime import datetime, timezone

BASE_URL = os.environ.get("MEMO_API", "http://47.93.2.83")
DATA_DIR = os.environ.get("MEMO_DIR", "/notes")


# ── HTTP 工具 ─────────────────────────────────────────────────────────────────

def _req(url, method="GET", data=None):
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"} if body else {}
    req = request.Request(url, data=body, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except error.HTTPError as e:
        msg = e.read().decode(errors="replace")
        print(f"❌ HTTP {e.code}: {msg}", file=sys.stderr)
        sys.exit(1)
    except error.URLError as e:
        print(f"❌ 连接失败 ({BASE_URL}): {e.reason}", file=sys.stderr)
        sys.exit(1)

def api_get(path):
    return _req(BASE_URL + path)

def api_post(path, data):
    return _req(BASE_URL + path, method="POST", data=data)

def api_delete(api_path):
    return _req(BASE_URL + "/api/delete?path=" + parse.quote(api_path), method="DELETE")


# ── 工具函数 ──────────────────────────────────────────────────────────────────

def gen_id():
    """生成与 JS 端相同格式的 ID（时间戳 base36 + 随机4位）"""
    chars = string.digits + string.ascii_lowercase
    n = int(time.time() * 1000)
    s = ""
    while n:
        s = chars[n % 36] + s
        n //= 36
    return s + "".join(random.choice(chars) for _ in range(4))

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

def fmt_date(iso):
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        diff = datetime.now(timezone.utc) - dt
        s = diff.total_seconds()
        if s < 60:     return "刚刚"
        if s < 3600:   return f"{int(s/60)} 分钟前"
        if s < 86400:  return f"{int(s/3600)} 小时前"
        return dt.strftime("%m-%d %H:%M")
    except Exception:
        return iso[:16]

def fmt_due(iso):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        diff = (dt - datetime.now(timezone.utc)).total_seconds()
        abs_d = abs(diff)
        days  = int(abs_d // 86400)
        hours = int((abs_d % 86400) // 3600)
        mins  = int((abs_d % 3600) // 60)
        parts = []
        if days:  parts.append(f"{days}天")
        if hours: parts.append(f"{hours}小时")
        if mins or not parts: parts.append(f"{mins}分钟")
        prefix = "还有 " if diff >= 0 else "逾期 "
        icon = "✅" if diff >= 86400 else ("⚠️" if diff >= 0 else "❌")
        return f"{icon} {prefix}{''.join(parts)}"
    except Exception:
        return iso

def item_path(mid):
    return DATA_DIR + "/" + mid + ".json"

def ensure_dir():
    api_post("/api/mkdir", {"path": DATA_DIR})

def load_all():
    """从服务器读取所有备忘录，按更新时间降序排列"""
    ensure_dir()
    ls = api_get("/api/ls?path=" + parse.quote(DATA_DIR))
    files = [f for f in ls.get("items", [])
             if not f.get("isDirectory") and f["name"].endswith(".json")]
    memos = []
    for f in files:
        path = DATA_DIR + "/" + f["name"]
        try:
            raw = api_get("/api/read?path=" + parse.quote(path))
            memos.append(json.loads(raw["content"]))
        except Exception:
            pass
    memos.sort(key=lambda m: m.get("updatedAt", ""), reverse=True)
    return memos

def load_one(mid):
    """读取单条备忘录，不存在则退出"""
    raw = api_get("/api/read?path=" + parse.quote(item_path(mid)))
    try:
        return json.loads(raw["content"])
    except Exception:
        print(f"❌ 解析失败: {raw}", file=sys.stderr)
        sys.exit(1)

def save_one(memo):
    api_post("/api/save", {
        "path": item_path(memo["id"]),
        "content": json.dumps(memo, ensure_ascii=False),
    })


# ── 命令实现 ──────────────────────────────────────────────────────────────────

def cmd_list(args):
    memos = load_all()
    if not memos:
        print("（暂无备忘录）")
        return
    print(f"共 {len(memos)} 条备忘录\n")
    print(f"  {'ID':<14}  {'更新时间':<10}  标题")
    print("  " + "─" * 56)
    for m in memos:
        mid   = m.get("id", "?")
        date  = fmt_date(m.get("updatedAt"))
        title = m.get("title") or "（无标题）"
        due   = fmt_due(m.get("dueAt"))
        due_s = f"  {due}" if due else ""
        print(f"  {mid:<14}  {date:<10}  {title}{due_s}")


def cmd_read(args):
    m = load_one(args.id)
    width = 60
    print("─" * width)
    print(f"  标题：{m.get('title') or '（无标题）'}")
    print(f"  ID：  {m.get('id')}")
    print(f"  更新：{fmt_date(m.get('updatedAt'))}")
    if m.get("dueAt"):
        print(f"  截止：{fmt_due(m.get('dueAt'))}  ({m['dueAt'][:16]})")
    print("─" * width)
    print(m.get("content") or "（无内容）")
    print("─" * width)


def cmd_create(args):
    title = args.title.strip() if args.title else ""
    content = args.content if args.content is not None else None

    if not title:
        title = input("标题：").strip()
    if content is None:
        print("内容（输入完成后按 Ctrl+D 或 Ctrl+Z）：")
        try:
            content = sys.stdin.read().strip()
        except (EOFError, KeyboardInterrupt):
            content = ""

    mid = gen_id()
    ts  = now_iso()
    due = (args.due + ":00.000Z") if args.due else None

    memo = {
        "id":        mid,
        "title":     title,
        "content":   content,
        "createdAt": ts,
        "updatedAt": ts,
        "dueAt":     due,
    }
    ensure_dir()
    save_one(memo)

    print(f"✅ 已创建")
    print(f"   ID：   {mid}")
    print(f"   标题： {title}")
    if due:
        print(f"   截止： {fmt_due(due)}")


def cmd_update(args):
    m = load_one(args.id)
    changed = []

    if args.title is not None:
        m["title"] = args.title
        changed.append(f"标题 → {args.title}")
    if args.content is not None:
        m["content"] = args.content
        changed.append("内容已更新")
    if args.due is not None:
        m["dueAt"] = (args.due + ":00.000Z") if args.due else None
        changed.append(f"截止 → {fmt_due(m['dueAt']) if m['dueAt'] else '（已清除）'}")

    if not changed:
        print("ℹ️  未指定任何更新字段（-t 标题 / -c 内容 / -d 截止时间）")
        return

    m["updatedAt"] = now_iso()
    save_one(m)

    print(f"✅ 已更新 {args.id}")
    for c in changed:
        print(f"   {c}")


def cmd_delete(args):
    m = load_one(args.id)
    title = m.get("title") or "（无标题）"

    if not args.force:
        try:
            ans = input(f'确认删除 "{title}"？(y/N) ').strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\n已取消")
            return
        if ans not in ("y", "yes"):
            print("已取消")
            return

    api_delete(item_path(args.id))
    print(f"✅ 已删除：{title}")


def cmd_search(args):
    kw = args.keyword.lower()
    memos = load_all()
    hits = [m for m in memos
            if kw in m.get("title", "").lower() or kw in m.get("content", "").lower()]

    if not hits:
        print(f'未找到包含 "{args.keyword}" 的备忘录')
        return

    print(f'找到 {len(hits)} 条匹配\n')
    for m in hits:
        title = m.get("title") or "（无标题）"
        body  = m.get("content", "").replace("\n", " ")
        idx   = body.lower().find(kw)
        if idx >= 0:
            start   = max(0, idx - 20)
            snippet = ("…" if start else "") + body[start:idx+60] + ("…" if idx+60 < len(body) else "")
        else:
            snippet = body[:80]
        print(f"  [{m.get('id')}] {title}")
        if snippet:
            print(f"    {snippet}")
        print()


# ── 入口 ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(prog="memo_cli.py", description="备忘录命令行 CRUD 工具")
    subs = parser.add_subparsers(dest="cmd")

    subs.add_parser("list", help="列出所有备忘录")

    p = subs.add_parser("read", help="读取备忘录详情")
    p.add_argument("id", help="备忘录 ID")

    p = subs.add_parser("create", help="创建备忘录")
    p.add_argument("-t", "--title",   default="",   help="标题")
    p.add_argument("-c", "--content", default=None, help="内容")
    p.add_argument("-d", "--due",     default=None, help="截止时间，格式 YYYY-MM-DDTHH:MM")

    p = subs.add_parser("update", help="更新备忘录")
    p.add_argument("id", help="备忘录 ID")
    p.add_argument("-t", "--title",   default=None, help="新标题")
    p.add_argument("-c", "--content", default=None, help="新内容")
    p.add_argument("-d", "--due",     default=None, help="截止时间（空字符串清除）")

    p = subs.add_parser("delete", help="删除备忘录")
    p.add_argument("id", help="备忘录 ID")
    p.add_argument("-f", "--force", action="store_true", help="跳过确认")

    p = subs.add_parser("search", help="搜索备忘录")
    p.add_argument("keyword", help="搜索关键词")

    args = parser.parse_args()
    if not args.cmd:
        parser.print_help()
        return

    {
        "list":   cmd_list,
        "read":   cmd_read,
        "create": cmd_create,
        "update": cmd_update,
        "delete": cmd_delete,
        "search": cmd_search,
    }[args.cmd](args)


if __name__ == "__main__":
    main()
