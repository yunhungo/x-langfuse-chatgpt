#!/usr/bin/env bash
# @created 2026-09-05
# @description 下载已构建的插件并调用全局或项目 hooks 安装器。
# @author yunhungo
set -euo pipefail

usage() {
  echo 'Usage: bash install.sh --global | --project [project-path]'
}
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --global) if [ "$#" -ne 1 ]; then usage >&2; exit 1; fi ;;
  --project) if [ "$#" -gt 2 ]; then usage >&2; exit 1; fi ;;
  *) usage >&2; exit 1 ;;
esac
for dependency in node curl tar mktemp; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "Required command not found: $dependency" >&2
    exit 1
  fi
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22 or newer is required."); process.exit(1); }'
install_temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/x-langfuse-install.XXXXXXXX")"
trap 'rm -rf -- "$install_temp_dir"' EXIT
curl --fail --show-error --silent --location --retry 3 --connect-timeout 15 --max-time 120 \
  https://github.com/yunhungo/x-langfuse-chatgpt/archive/refs/heads/main.tar.gz \
  --output "$install_temp_dir/source.tar.gz"
mkdir "$install_temp_dir/source"
tar -xzf "$install_temp_dir/source.tar.gz" -C "$install_temp_dir/source" --strip-components=1
node "$install_temp_dir/source/scripts/install-hooks.mjs" "$@"
