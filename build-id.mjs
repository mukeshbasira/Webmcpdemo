// One number that identifies a build by what went into it. Vite hashes the bundle filename by
// content, but Vercel builds the source itself, so its hash and a local one differ for the same
// commit — which made "is the live bundle the one I just built?" unanswerable. A hash of the source
// is the same wherever it is computed.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir) => readdirSync(dir).sort().flatMap(f => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.test.ts') ? [] : [p]
})

export const buildId = () => {
  const h = createHash('sha256')
  for (const f of [...walk('src'), 'index.html']) h.update(f).update(readFileSync(f))
  return h.digest('hex').slice(0, 12)
}

if (process.argv[1]?.endsWith('build-id.mjs')) console.log(buildId())
