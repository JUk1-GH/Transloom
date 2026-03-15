#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
VENV_DIR="${HOME}/Library/Application Support/transloom-local-ocr/.venv"
export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK="${PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK:-True}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  printf 'Local OCR environment not found. Run npm run ocr:local:setup first.\n' >&2
  exit 1
fi

exec "$VENV_DIR/bin/python" "$ROOT_DIR/tools/local-ocr/server.py"
