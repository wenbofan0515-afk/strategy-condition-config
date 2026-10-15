#!/usr/bin/env bash
set -euo pipefail

src_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="${1:-$PWD/strategy-condition-config}"
mkdir -p "$out_dir"
tar -C "$src_dir" --exclude='*.pyc' --exclude='__pycache__' -cf - . | tar -C "$out_dir" -xf -
printf '已打包到 %s\n' "$out_dir"
