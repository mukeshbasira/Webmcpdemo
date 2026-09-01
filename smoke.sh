#!/bin/sh
# After a deploy: is the thing that is live the thing that was just built? The gates check the code;
# nothing checked that Vercel published it, to the right project, without serving a stale bundle.
set -e
URL="${1:-https://mcp-five-puce.vercel.app}"
say() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

code=$(curl -s -o /tmp/smoke.html -w '%{http_code}' "$URL")
[ "$code" = 200 ] || die "$URL answered $code"
say "$URL answers 200"

grep -q 'a page that argues back' /tmp/smoke.html || grep -q 'ROOM' /tmp/smoke.html || die 'the page served is not ROOM'
say 'it is ROOM'

# a SPA's HTML is a shell — the bundle is where the app actually is. Vite hashes the filename by
# content, but Vercel builds the source itself and its hash differs from a local one for the same
# code, so the name cannot answer "is this MY build?". A hash of the source can: build-id.mjs
# computes it the same way wherever it runs, and vite stamps it into the bundle.
want=$(node build-id.mjs 2>/dev/null || echo '')
bundle=''
n=0
while :; do
  bundle=$(grep -o '/assets/[A-Za-z0-9_.-]*\.js' /tmp/smoke.html | head -1)
  [ -n "$bundle" ] || die 'no script bundle referenced in the served HTML'
  bcode=$(curl -s -o /tmp/smoke.js -w '%{http_code}' "$URL$bundle")
  if [ "$bcode" = 200 ]; then
    { [ -z "$want" ] || grep -q "$want" /tmp/smoke.js; } && break
  fi
  n=$((n + 1))
  [ $n -lt 12 ] || die "after a minute the live page still is not this build (expected source $want; last bundle $bundle answered $bcode)"
  sleep 5
  curl -s -o /tmp/smoke.html "$URL?cachebust=$n"
done
say "serving this build${want:+ ($want)}, $(wc -c < /tmp/smoke.js | tr -d ' ') bytes"

# and it has to be a build of THIS source, not whatever was there before
for marker in define_flat work_triangle bedside_check wet_zone; do
  grep -q "$marker" /tmp/smoke.js || die "the live bundle has no '$marker' — Vercel is serving an older build"
done
say 'the live bundle is a build of this source'
printf '\n\033[32m✓ live and current\033[0m\n'
