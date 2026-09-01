// Does the suite actually hold anything? Break the page on purpose and check that it notices.
//
// A green suite proves nothing on its own. A test can assert something trivially true, or hedge
// itself behind a condition that stops being met — six of those were found here in one evening, and
// each looked green the whole time it had stopped checking. This is the blunter question: change what
// the page *does*, and the suite must go red. If it stays green, that behaviour is unguarded.
//
//   node mutate.mjs
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

export const MUTATIONS = [
  ['src/rules.ts', 'export const TURN = 150', 'export const TURN = 100', 'a wheelchair turns in a smaller circle'],
  ['src/rules.ts', 'export const REACH = 150', 'export const REACH = 90', 'a flex reaches less far'],
  ['src/rules.ts', 'export const TOUCHING = 15', 'export const TOUCHING = 40', 'desks read as one table further apart'],
  ['src/rules.ts', 'export const CHAT_MAX = 305', 'export const CHAT_MAX = 500', 'seats can sit further apart and still talk'],
  ['src/tools.ts', 'if (broke.length && !force) {', 'if (false && broke.length && !force) {', 'the page stops refusing'],
  ['src/tools.ts', '    if (losing) {', '    if (false && losing) {', 'the page stops asking before it wipes a home'],
  ['src/store.ts', `resolve('no answer')`, `resolve('no')`, 'silence gets reported as a refusal'],
  ['src/tools.ts', 'if (t !== undefined) { const unknown = noSuchPiece(t); if (unknown) return unknown }', '', 'find_space crashes on a piece the catalogue lacks'],
  ['src/tools.ts', "for (const [n, ac] of registered) if (!want.has(n) && n !== NUDGE) { ac.abort(); registered.delete(n) }", '', 'a contextual tool never leaves the browser again'],
  ['src/verify.ts', 'said > 0 && said < 12 && !Number.isInteger(said)', 'said > 0 && said < 12', 'a true 10cm claim is called wrong'],
  ['src/Plan.tsx', "role: 'button', tabIndex: 0, 'aria-label': label,", "'aria-label': label,", 'the controls on the plan stop being reachable'],
  ['src/store.ts', 'history: [...s.history.slice(-30)', 'history: [...s.history.slice(-1)', 'the room can only be walked back one step'],
  ['src/tools.ts', 'annotations: { readOnlyHint: !!t.readOnly,', 'annotations: { readOnlyHint: true,', 'every tool tells a client it only reads'],
  ['src/store.ts', "resolve('no answer') }, 90_000)", "resolve('no answer') }, 90)", 'the page stops waiting for the human almost at once'],
  ['src/rules.ts', "(a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1)", '0', 'errors stop being listed before warnings'],
  // this one is the shape of a tidy-up, not of a bug: sum over `items`, divide by the area of `mass`.
  // It shipped, and reported a balance point 3cm outside the room's own corner.
  ['src/tools.ts', 'const wsum = (f: (i: Item) => number) => mass.reduce', 'const wsum = (f: (i: Item) => number) => items.reduce', 'the balance point is a sum over one set divided by another'],
  ['src/tools.ts', "const aid = state.profile !== 'accessibility'", 'const aid = true', 'the page nags for a profile that is already set'],
  // the number a rule owns, copied into the one sentence the human reads
  ['src/rules.ts', "export const bedSide = (p: Profile) => (p === 'accessibility' ? 90 : 60)", "export const bedSide = (p: Profile) => (p === 'accessibility' ? 90 : 75)", 'a bed asks for a different gap than the rule does'],
  // the search stops looking while legal spots remain, and reports that there are none
  ['src/space.ts', 'if (n >= budget && (verified.length || fallback.length || n >= budget * 5)) break', 'if (n >= budget) break', 'a preference the room cannot satisfy reads as "nowhere fits"'],
  // the search forgets what the rules know about where a fixture can stand
  ['src/space.ts', 'spec(type).bed || PLUMBED[type]', 'spec(type).bed', 'a sink is scored into the middle of the floor'],
  // a rug lies under the furniture; searched for as though it collided with it, it has nowhere to go
  ['src/space.ts', 'const ceiling = type ? !!(spec(type).ceiling || spec(type).passable) : false', 'const ceiling = type ? !!spec(type).ceiling : false', 'a rug cannot be laid under a sofa'],
  // the door swing is neither a wall nor furniture, which is how both docking paths missed it
  ['src/dock.ts', '  if (state.room.doors.some(d => hits(doorClearance', '  if (false && state.room.doors.some(d => hits(doorClearance', 'a docked piece may stand in the doorway'],
]

// Importable: the test suite pins these anchors, and importing must not *run* the mutations —
// that would spawn a vitest that imports this file that spawns a vitest.
if (process.argv[1]?.endsWith('mutate.mjs')) run()

function run() {
const FILES = [...new Set(MUTATIONS.map(m => m[0]))]
const keep = new Map(FILES.map(f => [f, readFileSync(f, 'utf8')]))
const restore = () => keep.forEach((s, f) => writeFileSync(f, s))
process.on('exit', restore)
// A kill mid-run must not leave the tree mutated — `git checkout src/` is the fallback, but only
// for someone who realises that is what happened.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { restore(); process.exit(130) })

console.log('\n\x1b[1mmutation check\x1b[0m — every one of these should turn the suite red\n')
let bad = 0
for (const [file, find, repl, what] of MUTATIONS) {
  restore()
  const src = keep.get(file)
  // An anchor that no longer appears is a silent pass in the making — the same failure this file exists to find.
  if (!src.includes(find)) { console.log(`  \x1b[31m✗\x1b[0m ${what} — the line it mutates has moved: ${find}`); bad++; continue }
  writeFileSync(file, src.replace(find, repl))
  let green = true
  try { execSync('npx vitest run', { stdio: 'ignore' }) } catch { green = false }
  if (green) { console.log(`  \x1b[31m✗\x1b[0m ${what} — NOTHING FAILED`); bad++ }
  else console.log(`  \x1b[32m✓\x1b[0m ${what}`)
}
restore()
console.log(bad
  ? `\n\x1b[31m✗ ${bad} of ${MUTATIONS.length} changes the suite did not notice\x1b[0m\n`
  : `\n\x1b[32m✓ all ${MUTATIONS.length} — the suite notices when the page changes\x1b[0m\n`)
process.exit(bad ? 1 : 0)
}
