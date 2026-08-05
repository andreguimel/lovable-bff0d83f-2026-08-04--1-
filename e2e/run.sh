#!/usr/bin/env bash
# Runner da suíte E2E do Guardião.
# Repassa flags para o Python: --only <nome>, --headed, --keep-going.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SHOTS="/tmp/browser/guardian_e2e/screenshots"
mkdir -p "$SHOTS"

if ! curl -fsS -o /dev/null "http://localhost:8080/"; then
  echo "❌ Preview em http://localhost:8080 não está respondendo." >&2
  exit 2
fi

echo "▶ Rodando suíte E2E do Guardião…"
cd "$ROOT"
python test_guardian.py "$@"
