#!/bin/sh
# Deploy ROOM. Type-check, tests and build all run first and any failure stops it — the same reason
# nothing else stands between an edit and a live page an agent talks to.
set -e
cd "$(dirname "$0")"
echo "→ types"; npx tsc --noEmit
echo "→ tests"; npm test --silent
echo "→ build"; npm run build --silent >/dev/null
echo "→ deploy"; npx vercel --yes --prod
echo "→ smoke"; ./smoke.sh
