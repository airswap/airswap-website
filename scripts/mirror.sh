#!/usr/bin/env bash
# Mirrors https://www.airswap.xyz into docs/ for GitHub Pages hosting.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/docs"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SITE='https://www.airswap.xyz'

if ! command -v wget > /dev/null; then
  echo 'wget is required (brew install wget)' >&2
  exit 1
fi

# Exit code 8 means the server returned an error for some URL; verify.mjs catches missing files.
wget \
  --mirror \
  --page-requisites \
  --convert-links \
  --adjust-extension \
  --no-host-directories \
  --span-hosts \
  --domains=www.airswap.xyz,cdn.prod.website-files.com,d3e54v103j8qbb.cloudfront.net \
  --restrict-file-names=windows \
  --execute robots=off \
  --wait=0.2 \
  --no-verbose \
  --directory-prefix="$TMP_DIR" \
  "$SITE/" \
  "$SITE/nft-marketplace" \
  "$SITE/otc" \
  "$SITE/privacy-policy" \
  "$SITE/404" \
  "$SITE/sitemap.xml" \
  "$SITE/robots.txt" \
  || [ $? -eq 8 ]

node "$ROOT_DIR/scripts/postprocess.mjs" "$TMP_DIR"

rm -rf "$OUT_DIR"
mv "$TMP_DIR" "$OUT_DIR"
trap - EXIT
chmod 755 "$OUT_DIR"

node "$ROOT_DIR/scripts/verify.mjs" "$OUT_DIR"
