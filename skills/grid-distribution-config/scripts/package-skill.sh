#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 1 || "$1" != /* ]]; then
  echo '用法：bash scripts/package-skill.sh /absolute/path/output.zip' >&2
  exit 1
fi
skill_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -e "$1" ]]; then
  echo '目标文件已存在，请选择新文件名。' >&2
  exit 1
fi
cd -- "$skill_root"
zip -q -r "$1" SKILL.md VERSION README.md CHANGELOG.md release.json agents assets references scripts \
  -x '*/.DS_Store' '*/__pycache__/*' '*.pyc' '*/node_modules/*'
unzip -tq "$1"
