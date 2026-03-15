#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
VENV_DIR="${HOME}/Library/Application Support/transloom-local-ocr/.venv"

if ! command -v uv >/dev/null 2>&1; then
  printf 'uv is required. Install it first, then rerun npm run ocr:local:setup.\n' >&2
  exit 1
fi

if [ -n "${PYTHON_BIN:-}" ]; then
  RESOLVED_PYTHON_BIN="$PYTHON_BIN"
elif command -v python3.11 >/dev/null 2>&1; then
  RESOLVED_PYTHON_BIN=$(command -v python3.11)
elif command -v /opt/homebrew/bin/python3.11 >/dev/null 2>&1; then
  RESOLVED_PYTHON_BIN=/opt/homebrew/bin/python3.11
else
  printf 'Python 3.11 is required. Set PYTHON_BIN=/path/to/python3.11 and rerun npm run ocr:local:setup.\n' >&2
  exit 1
fi

uv venv --allow-existing --python "$RESOLVED_PYTHON_BIN" "$VENV_DIR"
uv pip install --python "$VENV_DIR/bin/python" -r "$ROOT_DIR/tools/local-ocr/requirements.txt"

printf 'Local OCR environment is ready at %s\n' "$VENV_DIR"
