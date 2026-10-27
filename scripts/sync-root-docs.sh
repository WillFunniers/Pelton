#!/usr/bin/env bash
# Generates docs/contributing/{guidelines,code-of-conduct,dco}.md from the
# canonical root files (CONTRIBUTING.md, CODE_OF_CONDUCT.md, DCO.md) so the
# guidelines only ever get edited in one place. Run this before `zensical
# build` or `zensical serve` whenever one of those root files changes; CI
# runs it automatically (see .github/workflows/docs.yml).
#
# The root files link to each other and to GitHub-hosted images with paths
# that make sense from the repo root (for github.com and the no-CDN check
# below); the sed pass rewrites the handful of known ones to their
# docs-relative equivalents so the copy under docs/contributing/ doesn't
# 404 or pull an external image into the built site.
set -euo pipefail
cd "$(dirname "$0")/.."

out_dir="docs/contributing"
mkdir -p "$out_dir"

generate() {
  local src=$1 dest=$2 title=$3 description=$4 note=$5
  {
    echo "---"
    printf 'title: "%s"\n' "${title}"
    printf 'description: "%s"\n' "${description}"
    echo "---"
    echo
    echo "??? note \"Editing this page\""
    echo "    This is a generated copy of \`${src}\` from the repo root. To change"
    echo "    its content, edit that file and run \`make sync-docs\` (CI does this"
    echo "    automatically on push). Edits made directly to this file are"
    echo "    overwritten on the next sync."
    echo
    echo "${note}"
    echo
    sed \
      -e 's#https://github.com/user-attachments/assets/e18a6bd6-ecbb-4b62-9585-09b55321dab0#../assets/contributing-banner.webp#' \
      -e 's#\[DCO\.md\](\./DCO\.md)#[Developer Certificate of Origin](dco.md)#' \
      -e 's#\[Code of Conduct\](\./CODE_OF_CONDUCT\.md)#[Code of Conduct](code-of-conduct.md)#' \
      "$src"
  } > "$dest"
}

generate CONTRIBUTING.md "${out_dir}/guidelines.md" \
  "Contributing guidelines" \
  "The full contributor guidelines for Pelton: ways to help, the code of conduct, AI-assisted development rules, and commit conventions." \
  '!!! tip "New here?"
    Optional but useful reading before opening your first PR. Once you have,
    see [Developing on Pelton](developing.md) or
    [Translating Pelton](translations.md) to get started.'

generate CODE_OF_CONDUCT.md "${out_dir}/code-of-conduct.md" \
  "Code of Conduct" \
  "The Code of Conduct that governs participation in Pelton, adapted from the Contributor Covenant." \
  '!!! tip "New here?"
    Optional but useful reading before opening your first issue or PR. See
    [Contributing guidelines](guidelines.md) for everything else.'

generate DCO.md "${out_dir}/dco.md" \
  "Developer Certificate of Origin" \
  "The full text of the Developer Certificate of Origin 1.1, which every signed-off commit attests to." \
  '!!! tip "New here?"
    Worth a skim before your first signed-off commit. See
    [Contributing guidelines](guidelines.md#developer-certificate-of-origin-dco)
    for how and why to sign off.'

echo "synced CONTRIBUTING.md, CODE_OF_CONDUCT.md, DCO.md into ${out_dir}/"
