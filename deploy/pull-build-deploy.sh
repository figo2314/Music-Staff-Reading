#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   REPO_DIR=/opt/note-recognition-webapp \
#   WEB_ROOT=/var/www/note-recognition \
#   BRANCH=main \
#   bash deploy/pull-build-deploy.sh

REPO_DIR="${REPO_DIR:-/opt/note-recognition-webapp}"
WEB_ROOT="${WEB_ROOT:-/var/www/note-recognition}"
BRANCH="${BRANCH:-main}"

cd "$REPO_DIR"

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
npm ci
npm run build

mkdir -p "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT"/

echo "Deployed $(git rev-parse --short HEAD) to $WEB_ROOT"
