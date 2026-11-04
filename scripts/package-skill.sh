#!/usr/bin/env bash
set -euo pipefail

src_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="${1:-$PWD/strategy-condition-config}"
mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"
case "$out_dir/" in "$src_dir/"*) printf '输出目录不能位于 Skill 内部\n' >&2; exit 1 ;; esac
tar -C "$src_dir" -cf - SKILL.md agents assets references scripts | tar -C "$out_dir" -xf -
printf '已打包到 %s\n' "$out_dir"
