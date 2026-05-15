#!/usr/bin/env python3
"""
将本地文件夹上传到服务器，使其在应用市场中出现

用法:
  python3 upload_app.py <本地文件夹路径> [应用名称]

示例:
  python3 upload_app.py ./my-app              → 以 my-app 为名上传
  python3 upload_app.py ./my-app todo-list    → 以 todo-list 为名上传
  python3 upload_app.py ./my-app --dry-run    → 仅列出待上传文件，不实际上传

环境变量:
  MEMO_API=http://47.93.2.83   服务器地址（默认公网地址）
"""

import os, sys, uuid, argparse
from pathlib import Path
from urllib import request, error


BASE_URL = os.environ.get("MEMO_API", "http://47.93.2.83")

# 忽略的文件/目录（不上传）
IGNORE = {".git", ".DS_Store", "__pycache__", "node_modules", ".gitignore", "*.pyc"}


def should_ignore(name: str) -> bool:
    if name in IGNORE:
        return True
    if name.startswith(".") and name != ".htaccess":
        return True
    return False


def collect_files(folder: Path) -> list[tuple[str, bytes]]:
    """递归收集文件，返回 [(relative_path, content), ...]"""
    result = []
    for root, dirs, files in os.walk(folder):
        # 过滤掉忽略的目录
        dirs[:] = [d for d in dirs if not should_ignore(d)]
        for fname in files:
            if should_ignore(fname):
                continue
            abs_path = Path(root) / fname
            rel_path = abs_path.relative_to(folder)
            try:
                content = abs_path.read_bytes()
                result.append((str(rel_path), content))
            except Exception as e:
                print(f"  ⚠️  跳过 {rel_path}: {e}", file=sys.stderr)
    return result


def guess_mime(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return {
        ".html": "text/html",
        ".htm":  "text/html",
        ".css":  "text/css",
        ".js":   "application/javascript",
        ".json": "application/json",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif":  "image/gif",
        ".svg":  "image/svg+xml",
        ".webp": "image/webp",
        ".ico":  "image/x-icon",
        ".woff": "font/woff",
        ".woff2":"font/woff2",
        ".ttf":  "font/ttf",
        ".txt":  "text/plain",
        ".md":   "text/markdown",
        ".pdf":  "application/pdf",
    }.get(ext, "application/octet-stream")


def build_multipart(
    dest_path: str,
    files: list[tuple[str, str, bytes]],  # (field_name, relative_path, content)
) -> tuple[str, bytes]:
    """
    构造 multipart/form-data 请求体。
    返回 (Content-Type header, body bytes)
    """
    boundary = uuid.uuid4().hex
    CRLF = b"\r\n"
    parts: list[bytes] = []

    def add_field(name: str, value: str):
        parts.append(b"--" + boundary.encode())
        parts.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        parts.append(b"")
        parts.append(value.encode("utf-8"))

    # destPath 字段
    add_field("destPath", dest_path)

    # 每个文件：files[] + relativePaths[]
    for rel_path, content in files:
        fname = Path(rel_path).name
        mime  = guess_mime(fname)

        # files 字段
        parts.append(b"--" + boundary.encode())
        parts.append(
            f'Content-Disposition: form-data; name="files"; filename="{fname}"'.encode()
        )
        parts.append(f"Content-Type: {mime}".encode())
        parts.append(b"")
        parts.append(content)

        # relativePaths 字段（与 files 一一对应）
        add_field("relativePaths", rel_path)

    parts.append(b"--" + boundary.encode() + b"--")

    body = CRLF.join(parts) + CRLF
    content_type = f"multipart/form-data; boundary={boundary}"
    return content_type, body


def upload(local_folder: Path, app_name: str, dry_run: bool = False):
    files = collect_files(local_folder)

    if not files:
        print("❌ 文件夹为空，没有可上传的文件")
        sys.exit(1)

    # 加上 app_name 作为 relative path 前缀，destPath 为根目录
    # 服务器会将文件写到 ROOT_DIR/<app_name>/<file>
    prefixed = [(f"{app_name}/{rel}", content) for rel, content in files]

    print(f"📦 准备上传 {len(prefixed)} 个文件 → /{app_name}/")
    for rel, content in prefixed:
        size = len(content)
        size_str = f"{size/1024:.1f} KB" if size >= 1024 else f"{size} B"
        print(f"   {rel}  ({size_str})")

    if dry_run:
        print("\n（dry-run 模式，未实际上传）")
        return

    print(f"\n⬆️  上传到 {BASE_URL} ...")
    content_type, body = build_multipart("/", prefixed)

    req = request.Request(
        BASE_URL + "/api/upload-folder",
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=60) as resp:
            import json
            result = json.loads(resp.read())
            if result.get("ok"):
                print(f"\n✅ 上传成功！")
                print(f"   应用地址：{BASE_URL}/apps/{app_name}/")
                print(f"   市场地址：{BASE_URL}/")
            else:
                print(f"❌ 服务器返回：{result}", file=sys.stderr)
                sys.exit(1)
    except error.HTTPError as e:
        msg = e.read().decode(errors="replace")
        print(f"❌ HTTP {e.code}: {msg}", file=sys.stderr)
        sys.exit(1)
    except error.URLError as e:
        print(f"❌ 连接失败 ({BASE_URL}): {e.reason}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        prog="upload_app.py",
        description="将本地文件夹上传到服务器应用市场",
    )
    parser.add_argument("folder", help="本地文件夹路径")
    parser.add_argument("name", nargs="?", default=None, help="服务器上的应用名称（默认用文件夹名）")
    parser.add_argument("--dry-run", "-n", action="store_true", help="仅列出待上传文件，不实际上传")
    args = parser.parse_args()

    folder = Path(args.folder).resolve()
    if not folder.exists():
        print(f"❌ 路径不存在: {folder}", file=sys.stderr)
        sys.exit(1)
    if not folder.is_dir():
        print(f"❌ 不是文件夹: {folder}", file=sys.stderr)
        sys.exit(1)

    app_name = args.name or folder.name
    if "/" in app_name or "\\" in app_name:
        print("❌ 应用名称不能包含斜杠", file=sys.stderr)
        sys.exit(1)

    upload(folder, app_name, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
