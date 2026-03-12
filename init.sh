#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

printf '\nTransloom project re-entry\n'
printf '========================\n\n'

printf '%s\n' 'Project'
printf '%s\n' '- Electron + Next.js desktop translation app scaffold'
printf 'Root: %s\n\n' "$ROOT_DIR"

printf '%s\n' 'Workflow contracts'
printf '%s\n' '- feature_list.json: source of truth for feature scope and maturity'
printf '%s\n' '- claude-progress.txt: latest shared research and progress snapshot'
printf '%s\n' '- Task/message coordination: use the agent task system for ownership, blockers, and handoffs'
printf '%s\n' '- init.sh: read-only re-entry helper and optional dev launcher'
printf '%s\n\n' '- package.json: source of truth for runnable project commands'

printf '%s\n' 'Recommended re-entry order'
printf '%s\n' '1. Read feature_list.json for feature boundaries and next steps'
printf '%s\n' '2. Read claude-progress.txt for the latest shared context'
printf '%s\n' '3. Claim work in the task system before editing'
printf '%s\n' '4. Use direct messages for targeted coordination; use broadcast only when everyone must know'
printf '%s\n\n' '5. Verify commands in package.json, then run the smallest command needed'

printf '%s\n' 'Recommended commands'
printf '%s\n' '- Web only:      npm run dev:web'
printf '%s\n' '- Desktop dev:   npm run dev:desktop'
printf '%s\n' '- Build web:     npm run build'
printf '%s\n' '- Build desktop: npm run build:desktop'
printf '%s\n' '- Start web:     npm run start'
printf '%s\n' '- Start desktop: npm run start:desktop'
printf '%s\n' '- Lint:          npm run lint'
printf '%s\n' '- Typecheck:     npm run typecheck'
printf '%s\n\n' '- Tests:         npm run test'

printf '%s\n' 'Read first'
printf '%s\n' '- feature_list.json'
printf '%s\n' '- claude-progress.txt'
printf '%s\n' '- package.json'
printf '%s\n' '- src/app/page.tsx'
printf '%s\n' '- electron/main.ts'
printf '%s\n' '- src/app/api/translate/route.ts'
printf '%s\n' '- src/app/api/capture/translate/route.ts'
printf '%s\n' '- src/lib/pipeline/run-screenshot-translation.ts'
printf '%s\n' '- src/server/translation/providers/provider-registry.ts'
printf '%s\n\n' '- prisma/schema.prisma'

printf '%s\n' 'Current harness stance'
printf '%s\n' '- Keep init.sh as a re-entry helper; orchestration lives in .harness/'
printf '%s\n' '- Do not import harness files into Electron or Next runtime'
printf '%s\n' '- Use npm run harness:doctor / harness:status for control-plane visibility'
printf '%s\n\n' '- Prefer small, verifiable changes over broad rewrites inside each leased task'

if [[ "${1:-}" == "--start" ]]; then
  printf 'Starting desktop development mode...\n\n'
  npm run dev:desktop
fi
