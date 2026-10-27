#!/usr/bin/env bash
# copy-docs-markdown.sh mirrors every docs/**/*.md source file into site/ at
# the same relative path, alongside the HTML zensical already built for it.
# zensical only ever emits the rendered HTML for a page, never the source
# markdown, so without this an AI agent (or a human) fetching
# https://docs.pelton.app/install/macos.md would get nothing. With it, that
# URL serves the raw markdown next to the rendered page at
# https://docs.pelton.app/install/macos/, in line with llmstxt.org.
#
# Run after `zensical build` (site/ must already exist).
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

if [[ ! -d site ]]; then
  echo "site/ not found, run 'zensical build' first" >&2
  exit 1
fi

find docs -name '*.md' | while IFS= read -r src; do
  rel="${src#docs/}"
  dest="site/$rel"
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
done
