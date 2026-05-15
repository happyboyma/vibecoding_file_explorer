#!/bin/bash
# 备忘录 CLI 快捷入口
# 用法: ./memo.sh <list|read|create|update|delete|search> [参数...]
# 或配置别名: alias memo='MEMO_API=http://47.93.2.83 python3 /path/to/memo_cli.py'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/memo_cli.py" "$@"
