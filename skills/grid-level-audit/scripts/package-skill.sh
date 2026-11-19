#!/usr/bin/env bash
set -euo pipefail

src_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_file="${1:-$PWD/grid-level-audit.zip}"
out_file="$(cd "$(dirname "$out_file")" && pwd)/$(basename "$out_file")"
case "$out_file" in
  "$src_dir"/*) printf '输出文件不能位于 Skill 内部\n' >&2; exit 1 ;;
esac
mkdir -p "$(dirname "$out_file")"
rm -f "$out_file"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
cp -R "$src_dir" "$tmp_dir/grid-level-audit"
rm -rf "$tmp_dir/grid-level-audit/.DS_Store" "$tmp_dir/grid-level-audit/.git"
(cd "$tmp_dir" && zip -qr "$out_file" grid-level-audit)
printf '已打包到 %s\n' "$out_file"
